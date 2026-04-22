import { createModule, gql } from 'graphql-modules';
import mongoose from 'mongoose';
import { Task } from '../../../models/Task';
import { AppError } from '../../../middleware';
import { GraphQLContext, requireCurrentUser } from '../../../utils/auth';
import { logger } from '../../../utils/logger';

export const boardModule = createModule({
  id: 'board',
  typeDefs: gql`
    type BoardColumn {
      status: String!
      tasks: [Task!]!
      count: Int!
    }

    type BoardData {
      columns: [BoardColumn!]!
      totalTasks: Int!
    }

    extend type Query {
      boardData(projectId: ID, sprintId: ID): BoardData!
    }
  `,
  resolvers: {
    Query: {
      boardData: async (
        _: any,
        { projectId, sprintId }: { projectId?: string; sprintId?: string },
        context: GraphQLContext
      ) => {
        try {
          requireCurrentUser(context);
          // Build filter based on provided parameters
          const filter: any = { isActive: true };

          // Use raw MongoDB collection when filtering by sprintId to handle both String and ObjectId types
          if (sprintId) {
            const db = mongoose.connection.db;
            const tasksCollection = db.collection('tasks');
            
            const sprintFilter: any = { 
              $or: [
                { sprintId: sprintId },  // String match
                { sprintId: new mongoose.Types.ObjectId(sprintId) }  // ObjectId match
              ],
              isActive: true 
            };
            
            // Fetch all tasks matching the filter
            const rawTasks = await tasksCollection.find(sprintFilter).toArray();
            
            // Convert ObjectId fields to strings for GraphQL compatibility
            const tasks = rawTasks.map((task: any) => ({
              ...task,
              _id: task._id.toString(),
              sprintId: task.sprintId?.toString ? task.sprintId.toString() : task.sprintId,
              assignedTo: task.assignedTo ? {
                ...task.assignedTo,
                id: task.assignedTo.id?.toString ? task.assignedTo.id.toString() : task.assignedTo.id
              } : null,
              assignedBy: task.assignedBy ? {
                ...task.assignedBy,
                id: task.assignedBy.id?.toString ? task.assignedBy.id.toString() : task.assignedBy.id
              } : null
            }));
            
            // Define board columns
            const statuses = ['pending', 'in-progress', 'completed', 'delayed', 'cancelled'];

            // Group tasks by status
            const columns = statuses.map((status) => {
              const statusTasks = tasks.filter((task) => task.status === status);
              return {
                status: status.toUpperCase().replace(/-/g, '_'),
                tasks: statusTasks,
                count: statusTasks.length,
              };
            });

            logger.info('Fetched board data', {
              projectId,
              sprintId,
              totalTasks: tasks.length,
            });

            return {
              columns,
              totalTasks: tasks.length,
            };
          } else if (projectId) {
            filter.projectId = projectId;
            
            // Fetch all tasks matching the filter
            const tasks = await Task.find(filter).lean();

            // Define board columns
            const statuses = ['pending', 'in-progress', 'completed', 'delayed', 'cancelled'];

            // Group tasks by status
            const columns = statuses.map((status) => {
              const statusTasks = tasks.filter((task) => task.status === status);
              return {
                status: status.toUpperCase().replace(/-/g, '_'),
                tasks: statusTasks,
                count: statusTasks.length,
              };
            });

            logger.info('Fetched board data', {
              projectId,
              sprintId,
              totalTasks: tasks.length,
            });

            return {
              columns,
              totalTasks: tasks.length,
            };
          } else {
            throw new AppError('Either projectId or sprintId must be provided', 400);
          }
        } catch (error) {
          logger.error('Error fetching board data', { projectId, sprintId, error });
          throw error;
        }
      },
    },
  },
});

