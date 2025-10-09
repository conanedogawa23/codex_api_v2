import { createModule, gql } from 'graphql-modules';
import { Label } from '../../../models/Label';
import { AppError } from '../../../middleware';
import { logger } from '../../../utils/logger';

export const labelModule = createModule({
  id: 'label',
  typeDefs: gql`
    type Label {
      id: ID!
      gitlabId: Int!
      projectId: Int!
      name: String!
      description: String
      color: String!
      textColor: String!
      openIssuesCount: Int!
      closedIssuesCount: Int!
      openMergeRequestsCount: Int!
      subscribed: Boolean!
      priority: Int!
      lastSynced: DateTime!
      isActive: Boolean!
    }

    input CreateLabelInput {
      projectId: Int!
      name: String!
      description: String
      color: String!
    }

    input UpdateLabelInput {
      name: String
      description: String
      color: String
      priority: Int
    }

    extend type Query {
      label(id: ID!): Label
      labelByName(projectId: Int!, name: String!): Label
      labels(
        projectId: Int
        limit: Int = 50
        offset: Int = 0
      ): [Label!]!
      labelsByProject(projectId: Int!): [Label!]!
    }

    extend type Mutation {
      updateLabel(id: ID!, input: UpdateLabelInput!): Label!
    }
  `,
  resolvers: {
    Query: {
      label: async (_: any, { id }: { id: string }) => {
        const label = await Label.findById(id).lean();
        if (!label) {
          throw new AppError('Label not found', 404);
        }
        return label;
      },

      labelByName: async (_: any, { projectId, name }: { projectId: number; name: string }) => {
        const label = await Label.findOne({ projectId, name }).lean();
        if (!label) {
          throw new AppError('Label not found', 404);
        }
        return label;
      },

      labels: async (
        _: any,
        { projectId, limit = 20, offset = 0 }: any
      ) => {
        const filter: any = {};
        if (projectId) filter.projectId = projectId;

        return await Label.find(filter)
          .limit(limit)
          .skip(offset)
          .sort({ name: 1 })
          .lean();
      },

      labelsByProject: async (_: any, { projectId }: { projectId: number }) => {
        return await Label.find({ projectId, isActive: true }).sort({ name: 1 }).lean();
      },
    },

    Mutation: {
      updateLabel: async (_: any, { id, input }: any) => {
        const label = await Label.findByIdAndUpdate(id, input, {
          new: true,
          runValidators: true,
        });
        if (!label) {
          throw new AppError('Label not found', 404);
        }
        logger.info(`Updated label: ${label.name}`);
        return label;
      },
    },
  },
});
