import { GraphQLScalarType, Kind } from "graphql";

function serializeLong(value) {
  const normalized = typeof value === "bigint" ? Number(value) : value;
  if (typeof normalized === "string" && /^-?\d+$/.test(normalized)) {
    const parsed = Number(normalized);
    if (Number.isSafeInteger(parsed)) {
      return parsed;
    }
  }
  if (!Number.isSafeInteger(normalized)) {
    throw new TypeError("Long must be a safe integer");
  }
  return normalized;
}

export const Long = new GraphQLScalarType({
  name: "Long",
  description: "A safe integer, used for Unix timestamps in milliseconds.",
  serialize: serializeLong,
  parseValue: serializeLong,
  parseLiteral(ast) {
    if (ast.kind !== Kind.INT) {
      throw new TypeError("Long must be an integer literal");
    }
    return serializeLong(ast.value);
  },
});

function parseJsonLiteral(ast) {
  switch (ast.kind) {
    case Kind.NULL:
      return null;
    case Kind.STRING:
    case Kind.BOOLEAN:
      return ast.value;
    case Kind.INT: {
      const value = Number(ast.value);
      return Number.isSafeInteger(value) ? value : ast.value;
    }
    case Kind.FLOAT:
      return Number(ast.value);
    case Kind.LIST:
      return ast.values.map(parseJsonLiteral);
    case Kind.OBJECT:
      return Object.fromEntries(ast.fields.map((field) => [field.name.value, parseJsonLiteral(field.value)]));
    default:
      throw new TypeError(`Unsupported JSON literal kind ${ast.kind}`);
  }
}

export const JSONScalar = new GraphQLScalarType({
  name: "JSON",
  description: "An arbitrary JSON value.",
  serialize(value) {
    if (value === undefined) {
      return null;
    }
    return value;
  },
  parseValue(value) {
    return value;
  },
  parseLiteral: parseJsonLiteral,
});

export const typeDefs = `#graphql
  scalar Long
  scalar JSON

  type Action {
    _id: ID!
    createdAt: Long!
    updatedAt: Long
    name: String!
    description: String
    functionString: String
    resourceTemplateId: ID
    resourceTemplate: ResourceTemplate
  }

  type Trigger {
    _id: ID!
    createdAt: Long!
    updatedAt: Long
    name: String!
    description: String
    functionString: String
    resourceTemplateId: ID
    resourceTemplate: ResourceTemplate
  }

  type Response {
    _id: ID!
    createdAt: Long!
    updatedAt: Long
    name: String!
    description: String
    platforms: [ResponsePlatform]
  }

  type ResponsePlatform {
    integrationId: ID
    build: Int
    localeGroups: [ResponseLocaleGroup]
  }

  type ResponseLocaleGroup {
    localeGroupId: ID
    variations: [ResponseVariation]
  }

  type ResponseVariation {
    name: String!
    responses: JSON
  }

  type ResourceTemplate {
    _id: ID!
    createdAt: Long!
    updatedAt: Long
    name: String!
    description: String
    schema: JSON
    integrationId: String
    functionString: String
    key: String
  }

  type NodeObject {
    _id: ID!
    createdAt: Long!
    updatedAt: Long
    name: String!
    description: String
    parentIds: [ID]
    parents: [NodeObject]
    root: Boolean
    trigger: Trigger
    triggerId: ID
    responses: [Response]
    responseIds: [ID]
    actions: [Action]
    actionIds: [ID]
    priority: Float
    compositeId: ID
    global: Boolean
    colour: String
  }

  type Query {
    node(nodeId: ID): NodeObject
  }
`;

function byId(store, collection, id) {
  return id === null || id === undefined ? null : store[collection].get(id) ?? null;
}

export const resolvers = {
  Long,
  JSON: JSONScalar,
  Query: {
    node: (_, { nodeId }, { store }) => nodeId === undefined || nodeId === null
      ? null
      : store.nodeById.get(String(nodeId)) ?? null,
  },
  Action: {
    resourceTemplate: (action, _, { store }) => byId(store, "resourceTemplateById", action.resourceTemplateId),
  },
  Trigger: {
    resourceTemplate: (trigger, _, { store }) => byId(store, "resourceTemplateById", trigger.resourceTemplateId),
  },
  NodeObject: {
    parents: (node, _, { store }) => node.parentIds === null
      ? null
      : node.parentIds.map((compositeId) => store.nodeByCompositeId.get(compositeId)),
    trigger: (node, _, { store }) => byId(store, "triggerById", node.triggerId),
    responses: (node, _, { store }) => node.responseIds === null
      ? null
      : node.responseIds.map((id) => store.responseById.get(id)),
    actions: (node, _, { store }) => node.actionIds === null
      ? null
      : node.actionIds.map((id) => store.actionById.get(id)),
  },
};
