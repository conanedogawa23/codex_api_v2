import { createModule, gql } from 'graphql-modules';
import { database } from '../../../config/database';
import pkg from '../../../../package.json';

export const healthModule = createModule({
  id: 'health',
  typeDefs: gql`
    type HealthStatus {
      status: String!
      timestamp: DateTime!
      database: DatabaseStatus!
      version: String!
    }

    type DatabaseStatus {
      status: String!
      responseTime: Int!
    }

    extend type Query {
      health: HealthStatus!
    }
  `,
  resolvers: {
    Query: {
      health: async () => {
        const dbHealth = await database.healthCheck();
        
        return {
          status: dbHealth.status === 'connected' ? 'OK' : 'ERROR',
          timestamp: new Date().toISOString(),
          database: {
            status: dbHealth.status,
            responseTime: dbHealth.responseTime,
          },
          version: pkg.version,
        };
      },
    },
  },
});
