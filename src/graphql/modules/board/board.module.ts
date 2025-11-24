import { createModule, gql } from 'graphql-modules';
import { Task } from '../../../models/Task';
import { AppError } from '../../../middleware';
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
        { projectId, sprintId }: { projectId?: string; sprintId?: string }
      ) => {
        try {
          // Build filter based on provided parameters
          const filter: any = { isActive: true };

          if (sprintId) {
            filter.sprintId = sprintId;
          } else if (projectId) {
            filter.projectId = projectId;
          } else {
            throw new AppError('Either projectId or sprintId must be provided', 400);
          }

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
        } catch (error) {
          logger.error('Error fetching board data', { projectId, sprintId, error });
          throw error;
        }
      },
    },
  },
});

