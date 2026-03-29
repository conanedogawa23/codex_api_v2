import { logger } from '../../../utils/logger';
import { Project } from '../../../models/Project';
import { gitlabApi } from '../../../utils/gitlabApi';

export class GitlabEventProcessor {
  async fetchSimpleEvents(batchSize: number = 100): Promise<any[]> {
    const allEvents: any[] = [];
    const perProjectLimit = Math.max(1, Math.min(batchSize, 100));

    try {
      const activeProjects = await Project.find({
        isActive: true,
        pathWithNamespace: { $exists: true, $ne: '' }
      })
        .select('gitlabId pathWithNamespace')
        .lean();

      for (const project of activeProjects) {
        try {
          const events = await gitlabApi.getProjectEvents(project.pathWithNamespace, perProjectLimit);
          allEvents.push(
            ...events.map((event) => ({
              ...event,
              project: project.gitlabId
                ? { id: `gid://gitlab/Project/${project.gitlabId}` }
                : undefined,
            }))
          );
        } catch (error: unknown) {
          logger.warn('Failed to fetch events for project', {
            projectPath: project.pathWithNamespace,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      return allEvents;
    } catch (error: unknown) {
      logger.error('Error fetching events', { error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  }

  async fetchEventData(ids: number[]): Promise<any> {
    logger.debug('Event sync uses REST list payloads as the source of truth', { eventIds: ids });
    return { data: { events: [] } };
  }
}

export const gitlabEventProcessor = new GitlabEventProcessor();

