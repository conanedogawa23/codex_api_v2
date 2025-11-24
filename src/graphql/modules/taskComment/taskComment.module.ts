import { createModule, gql } from 'graphql-modules';
import { TaskComment } from '../../../models/TaskComment';
import { User } from '../../../models/User';
import { Task } from '../../../models/Task';
import { AppError } from '../../../middleware';
import { logger } from '../../../utils/logger';

export const taskCommentModule = createModule({
  id: 'taskComment',
  typeDefs: gql`
    type TaskComment {
      id: ID!
      taskId: String!
      author: User!
      body: String!
      parentCommentId: String
      mentions: [String!]!
      reactions: [Reaction!]!
      attachments: [CommentAttachment!]!
      isEdited: Boolean!
      isDeleted: Boolean!
      replyCount: Int
      createdAt: DateTime!
      updatedAt: DateTime!
    }

    type Reaction {
      emoji: String!
      userId: String!
      userName: String!
    }

    type CommentAttachment {
      name: String!
      data: String!
      type: String!
      size: Int!
    }

    input CreateCommentInput {
      taskId: String!
      body: String!
      authorId: String!
      parentCommentId: String
      attachments: [CommentAttachmentInput!]
    }

    input UpdateCommentInput {
      body: String!
    }

    input CommentAttachmentInput {
      name: String!
      data: String!
      type: String!
      size: Int!
    }

    extend type Query {
      taskComments(taskId: ID!): [TaskComment!]!
      taskComment(id: ID!): TaskComment
      commentReplies(parentCommentId: ID!): [TaskComment!]!
    }

    extend type Mutation {
      addTaskComment(input: CreateCommentInput!): TaskComment!
      updateTaskComment(id: ID!, input: UpdateCommentInput!): TaskComment!
      deleteTaskComment(id: ID!): Boolean!
      addReaction(commentId: ID!, emoji: String!, userId: String!): TaskComment!
      removeReaction(commentId: ID!, emoji: String!, userId: String!): TaskComment!
      addCommentAttachment(commentId: ID!, attachment: CommentAttachmentInput!): TaskComment!
      removeCommentAttachment(commentId: ID!, attachmentName: String!): TaskComment!
    }
  `,
  resolvers: {
    TaskComment: {
      id: (parent: any) => parent._id?.toString() || parent.id,
      author: async (parent: any) => {
        // Populate author if not already populated
        if (parent.author && typeof parent.author === 'object' && parent.author._id) {
          return parent.author;
        }
        
        // Fetch author if only authorId is available
        const user = await User.findById(parent.authorId).lean();
        if (!user) {
          throw new AppError('Author not found', 404);
        }
        
        return user;
      },
      mentions: (parent: any) => parent.mentions || [],
      reactions: (parent: any) => parent.reactions || [],
      attachments: (parent: any) => parent.attachments || [],
      replyCount: async (parent: any) => {
        const count = await TaskComment.countDocuments({
          parentCommentId: parent._id?.toString() || parent.id,
          isDeleted: false
        });
        return count;
      },
    },

    Query: {
      taskComments: async (_: any, { taskId }: { taskId: string }) => {
        try {
          // Fetch all comments (both root and replies) for the task
          const comments = await TaskComment.find({
            taskId,
            isDeleted: false
          })
            .populate('author')
            .sort({ createdAt: 1 })
            .lean();

          return comments;
        } catch (error) {
          logger.error('Error fetching task comments', { taskId, error });
          throw new AppError('Failed to fetch comments', 500);
        }
      },

      taskComment: async (_: any, { id }: { id: string }) => {
        try {
          const comment = await TaskComment.findById(id)
            .populate('author')
            .lean();

          if (!comment || comment.isDeleted) {
            throw new AppError('Comment not found', 404);
          }

          return comment;
        } catch (error) {
          logger.error('Error fetching comment', { id, error });
          throw error;
        }
      },

      commentReplies: async (_: any, { parentCommentId }: { parentCommentId: string }) => {
        try {
          const replies = await TaskComment.find({
            parentCommentId,
            isDeleted: false
          })
            .populate('author')
            .sort({ createdAt: 1 })
            .lean();

          return replies;
        } catch (error) {
          logger.error('Error fetching comment replies', { parentCommentId, error });
          throw new AppError('Failed to fetch replies', 500);
        }
      },
    },

    Mutation: {
      addTaskComment: async (_: any, { input }: { input: any }) => {
        try {
          // Verify task exists
          const task = await Task.findById(input.taskId);
          if (!task) {
            throw new AppError('Task not found', 404);
          }

          // Verify author exists
          const author = await User.findById(input.authorId).lean();
          if (!author) {
            throw new AppError('Author not found', 400);
          }

          // Create comment
          const comment = new TaskComment({
            taskId: input.taskId,
            authorId: input.authorId,
            body: input.body,
            parentCommentId: input.parentCommentId,
            attachments: input.attachments || [],
            mentions: [], // TODO: Extract mentions from body
          });

          await comment.save();

          // Update task comment count if it's a root comment
          if (!input.parentCommentId) {
            await Task.findByIdAndUpdate(input.taskId, {
              $inc: { comments: 1 }
            });
          }

          // Populate author before returning
          await comment.populate('author');

          logger.info('Task comment added', { commentId: comment._id, taskId: input.taskId });
          return comment.toObject();
        } catch (error) {
          logger.error('Error adding task comment', { input, error });
          throw error;
        }
      },

      updateTaskComment: async (_: any, { id, input }: { id: string; input: any }) => {
        try {
          const comment = await TaskComment.findById(id);
          if (!comment) {
            throw new AppError('Comment not found', 404);
          }

          // Update comment
          await comment.edit(input.body);
          await comment.populate('author');

          logger.info('Task comment updated', { commentId: id });
          return comment.toObject();
        } catch (error) {
          logger.error('Error updating task comment', { id, input, error });
          throw error;
        }
      },

      deleteTaskComment: async (_: any, { id }: { id: string }) => {
        try {
          const comment = await TaskComment.findById(id);
          if (!comment) {
            throw new AppError('Comment not found', 404);
          }

          // Soft delete comment
          await comment.delete();

          // Decrement task comment count if it's a root comment
          if (!comment.parentCommentId) {
            await Task.findByIdAndUpdate(comment.taskId, {
              $inc: { comments: -1 }
            });
          }

          logger.info('Task comment deleted', { commentId: id });
          return true;
        } catch (error) {
          logger.error('Error deleting task comment', { id, error });
          throw error;
        }
      },

      addReaction: async (_: any, { commentId, emoji, userId }: { commentId: string; emoji: string; userId: string }) => {
        try {
          const comment = await TaskComment.findById(commentId);
          if (!comment) {
            throw new AppError('Comment not found', 404);
          }

          // Get user to get their name
          const user = await User.findById(userId).lean();
          if (!user) {
            throw new AppError('User not found', 400);
          }

          await comment.addReaction(emoji, userId, user.name);
          await comment.populate('author');

          logger.info('Reaction added to comment', { commentId, emoji, userId });
          return comment.toObject();
        } catch (error) {
          logger.error('Error adding reaction', { commentId, emoji, error });
          throw error;
        }
      },

      removeReaction: async (_: any, { commentId, emoji, userId }: { commentId: string; emoji: string; userId: string }) => {
        try {
          const comment = await TaskComment.findById(commentId);
          if (!comment) {
            throw new AppError('Comment not found', 404);
          }

          await comment.removeReaction(emoji, userId);
          await comment.populate('author');

          logger.info('Reaction removed from comment', { commentId, emoji, userId });
          return comment.toObject();
        } catch (error) {
          logger.error('Error removing reaction', { commentId, emoji, error });
          throw error;
        }
      },

      addCommentAttachment: async (_: any, { commentId, attachment }: { commentId: string; attachment: any }) => {
        try {
          const comment = await TaskComment.findById(commentId);
          if (!comment) {
            throw new AppError('Comment not found', 404);
          }

          // Validate file size (5MB limit)
          const maxSize = 5 * 1024 * 1024; // 5MB in bytes
          if (attachment.size > maxSize) {
            throw new AppError('File size exceeds 5MB limit', 400);
          }

          await comment.addAttachment(attachment);
          await comment.populate('author');

          logger.info('Attachment added to comment', { commentId, attachmentName: attachment.name });
          return comment.toObject();
        } catch (error) {
          logger.error('Error adding attachment to comment', { commentId, error });
          throw error;
        }
      },

      removeCommentAttachment: async (_: any, { commentId, attachmentName }: { commentId: string; attachmentName: string }) => {
        try {
          const comment = await TaskComment.findById(commentId);
          if (!comment) {
            throw new AppError('Comment not found', 404);
          }

          await comment.removeAttachment(attachmentName);
          await comment.populate('author');

          logger.info('Attachment removed from comment', { commentId, attachmentName });
          return comment.toObject();
        } catch (error) {
          logger.error('Error removing attachment from comment', { commentId, error });
          throw error;
        }
      },
    },
  },
});

