import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_DATA_DIR = path.resolve(MODULE_DIR, "..");

const DATA_FILES = {
  actions: "action.json",
  triggers: "trigger.json",
  responses: "response.json",
  resourceTemplates: "resourceTemplate.json",
  nodes: "node.json",
};

const GRAPHQL_INT_MIN = -(2 ** 31);
const GRAPHQL_INT_MAX = (2 ** 31) - 1;

export class DataValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "DataValidationError";
  }
}

function fail(message) {
  throw new DataValidationError(message);
}

function assertObject(value, location) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(`${location} must be an object`);
  }
}

function requiredId(value, location) {
  if (typeof value === "string") {
    if (value.length === 0 || value.trim().length === 0) {
      fail(`${location} must be a non-empty ID`);
    }
    return value;
  }

  if (Number.isSafeInteger(value)) {
    return String(value);
  }

  fail(`${location} must be a non-empty string or safe integer ID`);
}

function optionalId(value, location) {
  if (value === undefined || value === null) {
    return null;
  }
  return requiredId(value, location);
}

function requiredString(value, location) {
  if (typeof value !== "string") {
    fail(`${location} must be a string`);
  }
  return value;
}

function optionalString(value, location) {
  if (value === undefined || value === null) {
    return null;
  }
  return requiredString(value, location);
}

function requiredLong(value, location) {
  if (!Number.isSafeInteger(value)) {
    fail(`${location} must be a safe integer timestamp`);
  }
  return value;
}

function optionalLong(value, location) {
  if (value === undefined || value === null) {
    return null;
  }
  return requiredLong(value, location);
}

function optionalBoolean(value, location) {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "boolean") {
    fail(`${location} must be a boolean`);
  }
  return value;
}

function optionalInt(value, location) {
  if (value === undefined || value === null) {
    return null;
  }
  if (!Number.isInteger(value) || value < GRAPHQL_INT_MIN || value > GRAPHQL_INT_MAX) {
    fail(`${location} must be a 32-bit signed integer`);
  }
  return value;
}

function optionalFloat(value, location) {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(`${location} must be a finite number`);
  }
  return value;
}

function optionalArray(value, location) {
  if (value === undefined || value === null) {
    return null;
  }
  if (!Array.isArray(value)) {
    fail(`${location} must be an array or null`);
  }
  return value;
}

function relationIds(value, location) {
  if (value === undefined || value === null) {
    return null;
  }
  if (!Array.isArray(value)) {
    fail(`${location} must be an array or null`);
  }

  const ids = value.map((item, index) => requiredId(item, `${location}[${index}]`));
  const seen = new Set();
  for (const id of ids) {
    if (seen.has(id)) {
      fail(`${location} contains duplicate ID ${id}`);
    }
    seen.add(id);
  }
  return ids;
}

function indexById(items, typeName) {
  const index = new Map();
  for (const item of items) {
    if (index.has(item._id)) {
      fail(`duplicate ${typeName} _id ${item._id}`);
    }
    index.set(item._id, item);
  }
  return index;
}

function assertReference(index, id, location) {
  if (id !== null && !index.has(id)) {
    fail(`${location} references unknown ID ${id}`);
  }
}

async function readArray(dataDir, fileName) {
  const filePath = path.join(dataDir, fileName);
  let raw;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch (error) {
    throw new DataValidationError(`unable to read ${filePath}: ${error.message}`);
  }

  let value;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    throw new DataValidationError(`invalid JSON in ${filePath}: ${error.message}`);
  }

  if (!Array.isArray(value)) {
    fail(`${filePath} must contain a JSON array`);
  }
  return value;
}

function normalizeResourceConsumers(rawItems, collectionName) {
  return rawItems.map((raw, index) => {
    const location = `${collectionName}[${index}]`;
    assertObject(raw, location);
    return {
      _id: requiredId(raw._id, `${location}._id`),
      createdAt: requiredLong(raw.createdAt, `${location}.createdAt`),
      updatedAt: optionalLong(raw.updatedAt, `${location}.updatedAt`),
      name: requiredString(raw.name, `${location}.name`),
      description: optionalString(raw.description, `${location}.description`),
      functionString: optionalString(raw.functionString, `${location}.functionString`),
      resourceTemplateId: optionalId(raw.resourceTemplateId, `${location}.resourceTemplateId`),
    };
  });
}

function normalizeResponses(rawItems) {
  return rawItems.map((raw, index) => {
    const location = `responses[${index}]`;
    assertObject(raw, location);
    const rawPlatforms = optionalArray(raw.platforms, `${location}.platforms`);
    const platforms = rawPlatforms === null
      ? null
      : rawPlatforms.map((platform, platformIndex) => {
        const platformLocation = `${location}.platforms[${platformIndex}]`;
        assertObject(platform, platformLocation);
        const rawLocaleGroups = optionalArray(platform.localeGroups, `${platformLocation}.localeGroups`);
        const localeGroups = rawLocaleGroups === null
          ? null
          : rawLocaleGroups.map((group, groupIndex) => {
            const groupLocation = `${platformLocation}.localeGroups[${groupIndex}]`;
            assertObject(group, groupLocation);
            const rawVariations = optionalArray(group.variations, `${groupLocation}.variations`);
            const variations = rawVariations === null
              ? null
              : rawVariations.map((variation, variationIndex) => {
                const variationLocation = `${groupLocation}.variations[${variationIndex}]`;
                assertObject(variation, variationLocation);
                return {
                  name: requiredString(variation.name, `${variationLocation}.name`),
                  responses: variation.responses === undefined ? null : variation.responses,
                };
              });
            return {
              localeGroupId: optionalId(group.localeGroup ?? group.localeGroupId, `${groupLocation}.localeGroup`),
              variations,
            };
          });
        return {
          integrationId: optionalId(platform.integrationId, `${platformLocation}.integrationId`),
          build: optionalInt(platform.build, `${platformLocation}.build`),
          localeGroups,
        };
      });

    return {
      _id: requiredId(raw._id, `${location}._id`),
      createdAt: requiredLong(raw.createdAt, `${location}.createdAt`),
      updatedAt: optionalLong(raw.updatedAt, `${location}.updatedAt`),
      name: requiredString(raw.name, `${location}.name`),
      description: optionalString(raw.description, `${location}.description`),
      platforms,
    };
  });
}

function normalizeResourceTemplates(rawItems) {
  return rawItems.map((raw, index) => {
    const location = `resourceTemplates[${index}]`;
    assertObject(raw, location);
    const updatedAt = optionalLong(raw.updatedAt, `${location}.updatedAt`);
    const hasCreatedAt = raw.createdAt !== undefined && raw.createdAt !== null;
    const createdAt = hasCreatedAt
      ? requiredLong(raw.createdAt, `${location}.createdAt`)
      : updatedAt;

    if (createdAt === null) {
      fail(`${location}.createdAt is missing and no updatedAt fallback exists`);
    }

    return {
      _id: requiredId(raw._id, `${location}._id`),
      createdAt,
      updatedAt,
      name: requiredString(raw.name, `${location}.name`),
      description: optionalString(raw.description, `${location}.description`),
      schema: raw.schema === undefined ? null : raw.schema,
      integrationId: optionalString(raw.integrationId, `${location}.integrationId`),
      functionString: optionalString(raw.functionString, `${location}.functionString`),
      key: optionalString(raw.key, `${location}.key`),
    };
  });
}

function normalizeNodes(rawItems) {
  return rawItems.map((raw, index) => {
    const location = `nodes[${index}]`;
    assertObject(raw, location);
    const preActions = relationIds(raw.preActions, `${location}.preActions`);
    const postActions = relationIds(raw.postActions, `${location}.postActions`);
    const actionIds = preActions === null && postActions === null
      ? null
      : [...(preActions ?? []), ...(postActions ?? [])];
    const seenActions = new Set();
    for (const id of actionIds ?? []) {
      if (seenActions.has(id)) {
        fail(`${location}.preActions and postActions contain duplicate ID ${id}`);
      }
      seenActions.add(id);
    }

    return {
      _id: requiredId(raw._id, `${location}._id`),
      createdAt: requiredLong(raw.createdAt, `${location}.createdAt`),
      updatedAt: optionalLong(raw.updatedAt, `${location}.updatedAt`),
      name: requiredString(raw.name, `${location}.name`),
      description: optionalString(raw.description, `${location}.description`),
      parentIds: relationIds(raw.parents, `${location}.parents`),
      root: optionalBoolean(raw.root, `${location}.root`),
      triggerId: optionalId(raw.trigger, `${location}.trigger`),
      responseIds: relationIds(raw.responses, `${location}.responses`),
      actionIds,
      priority: optionalFloat(raw.priority, `${location}.priority`),
      compositeId: optionalId(raw.compositeId, `${location}.compositeId`),
      global: optionalBoolean(raw.global, `${location}.global`),
      colour: optionalString(raw.colour, `${location}.colour`),
    };
  });
}

function validateRelationships(store) {
  for (const action of store.actions) {
    assertReference(store.resourceTemplateById, action.resourceTemplateId, `action ${action._id}.resourceTemplateId`);
  }
  for (const trigger of store.triggers) {
    assertReference(store.resourceTemplateById, trigger.resourceTemplateId, `trigger ${trigger._id}.resourceTemplateId`);
  }
  for (const node of store.nodes) {
    assertReference(store.triggerById, node.triggerId, `node ${node._id}.trigger`);
    for (const responseId of node.responseIds ?? []) {
      assertReference(store.responseById, responseId, `node ${node._id}.responses`);
    }
    for (const actionId of node.actionIds ?? []) {
      assertReference(store.actionById, actionId, `node ${node._id}.actions`);
    }
    for (const parentId of node.parentIds ?? []) {
      if (!store.nodeByCompositeId.has(parentId)) {
        fail(`node ${node._id}.parents references unknown compositeId ${parentId}`);
      }
    }
  }

  const visiting = new Set();
  const visited = new Set();
  const visit = (node) => {
    if (visiting.has(node._id)) {
      fail(`Parent cycle detected at node ${node._id}`);
    }
    if (visited.has(node._id)) {
      return;
    }
    visiting.add(node._id);
    for (const parentId of node.parentIds ?? []) {
      visit(store.nodeByCompositeId.get(parentId));
    }
    visiting.delete(node._id);
    visited.add(node._id);
  };
  for (const node of store.nodes) {
    visit(node);
  }
}

export async function loadData({ dataDir = DEFAULT_DATA_DIR } = {}) {
  const rawEntries = await Promise.all(
    Object.entries(DATA_FILES).map(async ([key, fileName]) => [key, await readArray(dataDir, fileName)]),
  );
  const raw = Object.fromEntries(rawEntries);
  const actions = normalizeResourceConsumers(raw.actions, "actions");
  const triggers = normalizeResourceConsumers(raw.triggers, "triggers");
  const responses = normalizeResponses(raw.responses);
  const resourceTemplates = normalizeResourceTemplates(raw.resourceTemplates);
  const nodes = normalizeNodes(raw.nodes);

  const store = {
    actions,
    triggers,
    responses,
    resourceTemplates,
    nodes,
    actionById: indexById(actions, "action"),
    triggerById: indexById(triggers, "trigger"),
    responseById: indexById(responses, "response"),
    resourceTemplateById: indexById(resourceTemplates, "resourceTemplate"),
    nodeById: indexById(nodes, "node"),
    nodeByCompositeId: new Map(),
  };

  for (const node of nodes) {
    if (node.compositeId !== null) {
      if (store.nodeByCompositeId.has(node.compositeId)) {
        fail(`duplicate node compositeId ${node.compositeId}`);
      }
      store.nodeByCompositeId.set(node.compositeId, node);
    }
  }

  validateRelationships(store);
  return store;
}
