import { createModule, gql } from 'graphql-modules';

export const baseModule = createModule({
  id: 'base',
  typeDefs: gql`
    type Query {
      _empty: String
    }

    type Mutation {
      _empty: String
    }
  `,
  resolvers: {
    Query: {
      _empty: () => 'This is a base Query type',
    },
    Mutation: {
      _empty: () => 'This is a base Mutation type',
    },
  },
});
