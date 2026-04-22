import { createModule, gql } from 'graphql-modules';

export const baseModule = createModule({
  id: 'base',
  typeDefs: gql`
    enum AccessRole {
      STANDARD_USER
      ADMIN
      CLUSTER_SUPER_ADMIN
      FINANCE
    }

    enum Permission {
      VIEW_DEPARTMENT_MEMBERS
      MANAGE_DEPARTMENT_USERS
      MANAGE_DEPARTMENT_PROJECTS
      MANAGE_DEPARTMENT_SPRINTS
      MANAGE_DEPARTMENT_TASKS
      VIEW_DEPARTMENT_COST_REPORTS
      VIEW_DEPARTMENT_RESOURCE_UTILIZATION
      VIEW_PLATFORM_COST_REPORTS
      DOWNLOAD_PLATFORM_COST_REPORTS
      MANAGE_PLATFORM_FINANCE_RATES
    }

    type Query {
      _empty: String
    }

    type Mutation {
      _empty: String
    }

    type Subscription {
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
