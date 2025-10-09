import { createModule, gql } from 'graphql-modules';
import { Note } from '../../../models/Note';
import { AppError } from '../../../middleware';
import { logger } from '../../../utils/logger';
import mongoose from 'mongoose';

export const noteModule = createModule({
  id: 'note',
  typeDefs: gql`
    type Note {
      id: ID!
      gitlabId: Int!
      discussionId: ID
      projectId: String!
      noteableType: NoteableTypeExtended!
      noteableId: String!
      body: String!
      authorId: ID!
      system: Boolean!
      resolvable: Boolean!
      resolved: Boolean
      resolvedBy: ID
      resolvedAt: DateTime
      confidential: Boolean!
      internal: Boolean!
      type: String
      position: JSON
      createdAt: DateTime!
      updatedAt: DateTime!
      lastSyncedAt: DateTime!
      isDeleted: Boolean!
    }

    enum NoteableTypeExtended {
      Issue
      MergeRequest
      Commit
    }

    extend type Query {
      note(id: ID!): Note
      noteByGitlabId(gitlabId: Int!): Note
      notes(noteableId: ID!, noteableType: NoteableTypeExtended!, limit: Int = 20, offset: Int = 0): [Note!]!
      notesByAuthor(authorId: ID!, limit: Int = 20, offset: Int = 0): [Note!]!
      unresolvedNotes(projectId: String!, limit: Int = 20): [Note!]!
    }

    extend type Mutation {
      resolveNote(id: ID!, userId: ID!): Note!
      unresolveNote(id: ID!): Note!
    }
  `,
  resolvers: {
    Note: {
      id: (parent: any) => parent._id?.toString() || parent.id,
    },
    
    Query: {
      note: async (_: any, { id }: { id: string }) => {
        logger.info('Fetching note by ID', { id });
        
        const note = await Note.findById(id).lean();
        
        if (!note) {
          throw new AppError(`Note with ID ${id} not found`, 404);
        }
        
        return note;
      },

      noteByGitlabId: async (_: any, { gitlabId }: { gitlabId: number }) => {
        logger.info('Fetching note by GitLab ID', { gitlabId });
        
        const note = await Note.findOne({ gitlabId, isDeleted: false }).lean();
        
        if (!note) {
          throw new AppError(
            `Note with GitLab ID ${gitlabId} not found. It may not be synced yet.`,
            404
          );
        }
        
        return note;
      },

      notes: async (_: any, { noteableId, noteableType, limit, offset }: any) => {
        logger.info('Fetching notes', { noteableId, noteableType, limit, offset });
        
        return await Note.find({
          noteableId,
          noteableType,
          isDeleted: false
        })
          .limit(limit)
          .skip(offset)
          .sort({ createdAt: -1 })
          .lean();
      },

      notesByAuthor: async (_: any, { authorId, limit, offset }: { authorId: string; limit: number; offset: number }) => {
        logger.info('Fetching notes by author', { authorId, limit, offset });
        
        return await Note.find({ authorId, isDeleted: false })
          .limit(limit)
          .skip(offset)
          .sort({ createdAt: -1 })
          .lean();
      },

      unresolvedNotes: async (_: any, { projectId, limit }: { projectId: string; limit: number }) => {
        logger.info('Fetching unresolved notes', { projectId, limit });
        
        return await Note.find({
          projectId,
          resolvable: true,
          resolved: false,
          isDeleted: false
        })
          .limit(limit)
          .sort({ createdAt: -1 })
          .lean();
      },
    },

    Mutation: {
      resolveNote: async (_: any, { id, userId }: { id: string; userId: string }) => {
        logger.info('Resolving note', { id, userId });
        
        const note = await Note.findById(id);
        
        if (!note) {
          throw new AppError(`Note with ID ${id} not found`, 404);
        }

        if (!note.resolvable) {
          throw new AppError('This note is not resolvable', 400);
        }

        if (note.resolved) {
          throw new AppError('Note is already resolved', 400);
        }

        await note.resolve(new mongoose.Types.ObjectId(userId));
        
        const updatedNote = await Note.findById(id).lean();
        
        logger.info('Note resolved successfully', { id });
        return updatedNote!;
      },

      unresolveNote: async (_: any, { id }: { id: string }) => {
        logger.info('Unresolving note', { id });
        
        const note = await Note.findById(id);
        
        if (!note) {
          throw new AppError(`Note with ID ${id} not found`, 404);
        }

        if (!note.resolvable) {
          throw new AppError('This note is not resolvable', 400);
        }

        if (!note.resolved) {
          throw new AppError('Note is not resolved', 400);
        }

        await note.unresolve();
        
        const updatedNote = await Note.findById(id).lean();
        
        logger.info('Note unresolved successfully', { id });
        return updatedNote!;
      },
    },
  },
});
