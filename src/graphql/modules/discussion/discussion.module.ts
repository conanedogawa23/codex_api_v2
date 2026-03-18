import { createModule, gql } from 'graphql-modules';
import { Discussion } from '../../../models/Discussion';
import { AppError } from '../../../middleware';
import { GraphQLContext, requireCurrentUser } from '../../../utils/auth';
import { logger } from '../../../utils/logger';
import { requireProjectAccess, withProjectFilter } from '../../../utils/rbac';

export const discussionModule = createModule({
  id: 'discussion',
  typeDefs: gql`
    type Discussion {
      id: ID!
      gitlabId: String!
      projectId: String!
      noteableType: NoteableType!
      noteableId: ID!
      individualNote: Boolean!
      noteIds: [ID!]!
      createdAt: DateTime!
      updatedAt: DateTime!
      lastSyncedAt: DateTime!
      isDeleted: Boolean!
    }

    enum NoteableType {
      Issue
      MergeRequest
    }

    extend type Query {
      discussion(id: ID!): Discussion
      discussionByGitlabId(gitlabId: String!): Discussion
      discussions(noteableId: ID!, noteableType: NoteableType!, limit: Int = 20, offset: Int = 0): [Discussion!]!
      discussionsByProject(projectId: String!, limit: Int = 20, offset: Int = 0): [Discussion!]!
    }
  `,
  resolvers: {
    Discussion: {
      id: (parent: any) => parent._id?.toString() || parent.id,
    },
    
    Query: {
      discussion: async (_: any, { id }: { id: string }, context: GraphQLContext) => {
        requireCurrentUser(context);
        logger.info('Fetching discussion by ID', { id });
        
        const discussion = await Discussion.findById(id).lean();
        
        if (!discussion) {
          throw new AppError(`Discussion with ID ${id} not found`, 404);
        }

        await requireProjectAccess(context, discussion.projectId, 'gitlab');
        
        return discussion;
      },

      discussionByGitlabId: async (_: any, { gitlabId }: { gitlabId: string }, context: GraphQLContext) => {
        requireCurrentUser(context);
        logger.info('Fetching discussion by GitLab ID', { gitlabId });
        
        const discussion = await Discussion.findOne({ gitlabId, isDeleted: false }).lean();
        
        if (!discussion) {
          throw new AppError(
            `Discussion with GitLab ID ${gitlabId} not found. It may not be synced yet.`,
            404
          );
        }

        await requireProjectAccess(context, discussion.projectId, 'gitlab');
        
        return discussion;
      },

      discussions: async (
        _: any,
        { noteableId, noteableType, limit, offset }: any,
        context: GraphQLContext
      ) => {
        requireCurrentUser(context);
        logger.info('Fetching discussions', { noteableId, noteableType, limit, offset });

        const filter = await withProjectFilter(
          context,
          {
          noteableId,
          noteableType,
          isDeleted: false
          },
          'projectId',
          'gitlab'
        );

        return await Discussion.find(filter)
          .limit(limit)
          .skip(offset)
          .sort({ createdAt: -1 })
          .lean();
      },

      discussionsByProject: async (
        _: any,
        { projectId, limit, offset }: { projectId: string; limit: number; offset: number },
        context: GraphQLContext
      ) => {
        requireCurrentUser(context);
        logger.info('Fetching discussions by project', { projectId, limit, offset });

        const filter = await withProjectFilter(
          context,
          { projectId, isDeleted: false },
          'projectId',
          'gitlab'
        );

        return await Discussion.find(filter)
          .limit(limit)
          .skip(offset)
          .sort({ createdAt: -1 })
          .lean();
      },
    },
  },
});
