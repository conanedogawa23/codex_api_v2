import { createModule, gql } from 'graphql-modules';
import { GraphQLScalarType, Kind } from 'graphql';
import GraphQLJSON from 'graphql-type-json';

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

export const scalarsModule = createModule({
  id: 'scalars',
  typeDefs: gql`
    scalar DateTime
    scalar JSON
  `,
  resolvers: {
    DateTime: dateTimeScalar,
    JSON: GraphQLJSON,
  },
});
