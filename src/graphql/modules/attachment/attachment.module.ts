import { createModule, gql } from 'graphql-modules';
import { Attachment } from '../../../models/Attachment';
import { AppError } from '../../../middleware';
import { GraphQLContext, requireCurrentUser } from '../../../utils/auth';
import { logger } from '../../../utils/logger';
import { requireProjectAccess, withProjectFilter } from '../../../utils/rbac';

export const attachmentModule = createModule({
  id: 'attachment',
  typeDefs: gql`
    type Attachment {
      id: ID!
      projectId: String!
      secret: String!
      filename: String!
      url: String!
      alt: String
      markdown: String!
      uploadedBy: ID
      size: Int
      mimeType: String
      createdAt: DateTime!
      lastSyncedAt: DateTime!
      isDeleted: Boolean!
    }

    extend type Query {
      attachment(id: ID!): Attachment
      attachmentByUrl(url: String!): Attachment
      attachments(projectId: String!, limit: Int = 20, offset: Int = 0): [Attachment!]!
      attachmentsByUploader(uploaderId: ID!, limit: Int = 20, offset: Int = 0): [Attachment!]!
    }
  `,
  resolvers: {
    Attachment: {
      id: (parent: any) => parent._id?.toString() || parent.id,
    },
    
    Query: {
      attachment: async (_: any, { id }: { id: string }, context: GraphQLContext) => {
        requireCurrentUser(context);
        logger.info('Fetching attachment by ID', { id });
        
        const attachment = await Attachment.findById(id).lean();
        
        if (!attachment) {
          throw new AppError(`Attachment with ID ${id} not found`, 404);
        }

        await requireProjectAccess(context, attachment.projectId, 'gitlab');
        
        return attachment;
      },

      attachmentByUrl: async (_: any, { url }: { url: string }, context: GraphQLContext) => {
        requireCurrentUser(context);
        logger.info('Fetching attachment by URL', { url });
        
        const attachment = await Attachment.findOne({ url, isDeleted: false }).lean();
        
        if (!attachment) {
          throw new AppError(`Attachment with URL ${url} not found`, 404);
        }

        await requireProjectAccess(context, attachment.projectId, 'gitlab');
        
        return attachment;
      },

      attachments: async (
        _: any,
        { projectId, limit, offset }: { projectId: string; limit: number; offset: number },
        context: GraphQLContext
      ) => {
        requireCurrentUser(context);
        logger.info('Fetching attachments', { projectId, limit, offset });

        const filter = await withProjectFilter(
          context,
          { projectId, isDeleted: false },
          'projectId',
          'gitlab'
        );

        return await Attachment.find(filter)
          .limit(limit)
          .skip(offset)
          .sort({ createdAt: -1 })
          .lean();
      },

      attachmentsByUploader: async (
        _: any,
        { uploaderId, limit, offset }: { uploaderId: string; limit: number; offset: number },
        context: GraphQLContext
      ) => {
        requireCurrentUser(context);
        logger.info('Fetching attachments by uploader', { uploaderId, limit, offset });

        const filter = await withProjectFilter(
          context,
          { uploadedBy: uploaderId, isDeleted: false },
          'projectId',
          'gitlab'
        );

        return await Attachment.find(filter)
          .limit(limit)
          .skip(offset)
          .sort({ createdAt: -1 })
          .lean();
      },
    },
  },
});
