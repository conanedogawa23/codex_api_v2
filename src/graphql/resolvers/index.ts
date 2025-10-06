import { GraphQLScalarType, Kind } from 'graphql';
import GraphQLJSON from 'graphql-type-json';
import { userQueries, userMutations } from './userResolver';
import { projectQueries, projectMutations } from './projectResolver';
import { issueQueries, issueMutations } from './issueResolver';
import { mergeRequestQueries } from './mergeRequestResolver';
import { taskQueries, taskMutations } from './taskResolver';
import { milestoneQueries } from './milestoneResolver';
import { pipelineQueries } from './pipelineResolver';
import { labelQueries } from './labelResolver';
import { healthQuery } from './healthResolver';

// Custom DateTime scalar
const dateTimeScalar = new GraphQLScalarType({
  name: 'DateTime',
  description: 'DateTime custom scalar type',
  serialize(value: any) {
    if (value instanceof Date) {
      return value.toISOString();
    }
    return value;
  },
  parseValue(value: any) {
    return new Date(value);
  },
  parseLiteral(ast) {
    if (ast.kind === Kind.STRING) {
      return new Date(ast.value);
    }
    return null;
  },
});

export const resolvers = {
  DateTime: dateTimeScalar,
  JSON: GraphQLJSON,

  Query: {
    // Health
    ...healthQuery,
    // Users
    ...userQueries,
    // Projects
    ...projectQueries,
    // Issues
    ...issueQueries,
    // Merge Requests
    ...mergeRequestQueries,
    // Tasks
    ...taskQueries,
    // Milestones
    ...milestoneQueries,
    // Pipelines
    ...pipelineQueries,
    // Labels
    ...labelQueries,
  },

  Mutation: {
    // Users
    ...userMutations,
    // Projects
    ...projectMutations,
    // Issues
    ...issueMutations,
    // Tasks
    ...taskMutations,
  },
};

