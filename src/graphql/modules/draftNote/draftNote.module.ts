import { createModule, gql } from 'graphql-modules';
import { DraftNote } from '../../../models/DraftNote';
import { AppError } from '../../../middleware';
import { GraphQLContext, requireCurrentUser } from '../../../utils/auth';
import { logger } from '../../../utils/logger';
import { requireProjectAccess, withProjectFilter } from '../../../utils/rbac';

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
    DraftNote: {
      id: (parent: any) => parent._id?.toString() || parent.id,
    },
    
    Query: {
      draftNote: async (_: any, { id }: { id: string }, context: GraphQLContext) => {
        requireCurrentUser(context);
        logger.info('Fetching draft note by ID', { id });
        
        const draftNote = await DraftNote.findById(id).lean();
        
        if (!draftNote) {
          throw new AppError(`Draft note with ID ${id} not found`, 404);
        }

        await requireProjectAccess(context, draftNote.projectId, 'gitlab');
        
        return draftNote;
      },

      draftNoteByGitlabId: async (_: any, { gitlabId }: { gitlabId: number }, context: GraphQLContext) => {
        requireCurrentUser(context);
        logger.info('Fetching draft note by GitLab ID', { gitlabId });
        
        const draftNote = await DraftNote.findOne({ gitlabId, isDeleted: false }).lean();
        
        if (!draftNote) {
          throw new AppError(
            `Draft note with GitLab ID ${gitlabId} not found. It may not be synced yet.`,
            404
          );
        }

        await requireProjectAccess(context, draftNote.projectId, 'gitlab');
        
        return draftNote;
      },

      draftNotes: async (
        _: any,
        { mergeRequestId, limit, offset }: { mergeRequestId: string; limit: number; offset: number },
        context: GraphQLContext
      ) => {
        requireCurrentUser(context);
        logger.info('Fetching draft notes', { mergeRequestId, limit, offset });

        const filter = await withProjectFilter(
          context,
          { mergeRequestId, isDeleted: false },
          'projectId',
          'gitlab'
        );

        return await DraftNote.find(filter)
          .limit(limit)
          .skip(offset)
          .sort({ createdAt: -1 })
          .lean();
      },

      draftNotesByAuthor: async (
        _: any,
        { authorId, limit, offset }: { authorId: string; limit: number; offset: number },
        context: GraphQLContext
      ) => {
        requireCurrentUser(context);
        logger.info('Fetching draft notes by author', { authorId, limit, offset });

        const filter = await withProjectFilter(
          context,
          { authorId, isDeleted: false },
          'projectId',
          'gitlab'
        );

        return await DraftNote.find(filter)
          .limit(limit)
          .skip(offset)
          .sort({ createdAt: -1 })
          .lean();
      },
    },
  },
});
