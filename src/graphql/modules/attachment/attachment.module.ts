import { createModule, gql } from 'graphql-modules';
import { Attachment } from '../../../models/Attachment';
import { AppError } from '../../../middleware';
import { logger } from '../../../utils/logger';

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
    Query: {
      attachment: async (_: any, { id }: { id: string }) => {
        logger.info('Fetching attachment by ID', { id });
        
        const attachment = await Attachment.findById(id).lean();
        
        if (!attachment) {
          throw new AppError(`Attachment with ID ${id} not found`, 404);
        }
        
        return attachment;
      },

      attachmentByUrl: async (_: any, { url }: { url: string }) => {
        logger.info('Fetching attachment by URL', { url });
        
        const attachment = await Attachment.findOne({ url, isDeleted: false }).lean();
        
        if (!attachment) {
          throw new AppError(`Attachment with URL ${url} not found`, 404);
        }
        
        return attachment;
      },

      attachments: async (_: any, { projectId, limit, offset }: { projectId: string; limit: number; offset: number }) => {
        logger.info('Fetching attachments', { projectId, limit, offset });
        
        return await Attachment.find({ projectId, isDeleted: false })
          .limit(limit)
          .skip(offset)
          .sort({ createdAt: -1 })
          .lean();
      },

      attachmentsByUploader: async (_: any, { uploaderId, limit, offset }: { uploaderId: string; limit: number; offset: number }) => {
        logger.info('Fetching attachments by uploader', { uploaderId, limit, offset });
        
        return await Attachment.find({ uploadedBy: uploaderId, isDeleted: false })
          .limit(limit)
          .skip(offset)
          .sort({ createdAt: -1 })
          .lean();
      },
    },
  },
});
