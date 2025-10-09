import { createModule, gql } from 'graphql-modules';
import { DraftNote } from '../../../models/DraftNote';
import { AppError } from '../../../middleware';
import { logger } from '../../../utils/logger';

export const draftNoteModule = createModule({
  id: 'draftNote',
  typeDefs: gql`
    type DraftNote {
      id: ID!
      gitlabId: Int!
      projectId: String!
      mergeRequestId: ID!
      authorId: ID!
      note: String!
      position: JSON
      lineCode: String
      resolveDiscussion: Boolean!
      createdAt: DateTime!
      updatedAt: DateTime!
      lastSyncedAt: DateTime!
      isDeleted: Boolean!
    }

    extend type Query {
      draftNote(id: ID!): DraftNote
      draftNoteByGitlabId(gitlabId: Int!): DraftNote
      draftNotes(mergeRequestId: ID!, limit: Int = 20, offset: Int = 0): [DraftNote!]!
      draftNotesByAuthor(authorId: ID!, limit: Int = 20, offset: Int = 0): [DraftNote!]!
    }
  `,
  resolvers: {
    Query: {
      draftNote: async (_: any, { id }: { id: string }) => {
        logger.info('Fetching draft note by ID', { id });
        
        const draftNote = await DraftNote.findById(id).lean();
        
        if (!draftNote) {
          throw new AppError(`Draft note with ID ${id} not found`, 404);
        }
        
        return draftNote;
      },

      draftNoteByGitlabId: async (_: any, { gitlabId }: { gitlabId: number }) => {
        logger.info('Fetching draft note by GitLab ID', { gitlabId });
        
        const draftNote = await DraftNote.findOne({ gitlabId, isDeleted: false }).lean();
        
        if (!draftNote) {
          throw new AppError(
            `Draft note with GitLab ID ${gitlabId} not found. It may not be synced yet.`,
            404
          );
        }
        
        return draftNote;
      },

      draftNotes: async (_: any, { mergeRequestId, limit, offset }: { mergeRequestId: string; limit: number; offset: number }) => {
        logger.info('Fetching draft notes', { mergeRequestId, limit, offset });
        
        return await DraftNote.find({ mergeRequestId, isDeleted: false })
          .limit(limit)
          .skip(offset)
          .sort({ createdAt: -1 })
          .lean();
      },

      draftNotesByAuthor: async (_: any, { authorId, limit, offset }: { authorId: string; limit: number; offset: number }) => {
        logger.info('Fetching draft notes by author', { authorId, limit, offset });
        
        return await DraftNote.find({ authorId, isDeleted: false })
          .limit(limit)
          .skip(offset)
          .sort({ createdAt: -1 })
          .lean();
      },
    },
  },
});
