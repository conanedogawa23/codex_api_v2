import { logger } from '../../../utils/logger';
import { gitlabApiClient } from '../../../utils/gitlabApiClient';
import { GITLAB_EVENT_QUERIES } from '../../../graphql/types/event/gitlabEventQueries';

export class GitlabEventProcessor {
  async fetchSimpleEvents(batchSize: number = 100): Promise<any[]> {
    const allEvents: any[] = [];
    let hasNextPage = true;
    let after: string | null = null;

    try {
      while (hasNextPage) {
        const result = await gitlabApiClient.executeQuery(GITLAB_EVENT_QUERIES.SIMPLE_LIST, {
          first: batchSize,
          after
        });

        const data: any = (result as any)?.data?.events;
        if (data?.nodes) {
          allEvents.push(...data.nodes);
          hasNextPage = data.pageInfo?.hasNextPage || false;
          after = data.pageInfo?.endCursor || null;
        } else {
          hasNextPage = false;
        }
      }
      return allEvents;
    } catch (error: unknown) {
      logger.error('Error fetching events', { error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  }

  async fetchEventData(ids: number[]): Promise<any> {
    const gitlabIds = ids.map(id => `gid://gitlab/Event/${id}`);
    try {
      const result = await gitlabApiClient.executeQuery(GITLAB_EVENT_QUERIES.CORE_DATA, { ids: gitlabIds });
      return { data: { events: result?.data?.events?.nodes || [] } };
    } catch (error: unknown) {
      logger.error('Error fetching event data', { error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  }
}

export const gitlabEventProcessor = new GitlabEventProcessor();

