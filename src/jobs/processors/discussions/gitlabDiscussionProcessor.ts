import { logger } from '../../../utils/logger';
import { gitlabApiClient } from '../../../utils/gitlabApiClient';
import { GITLAB_DISCUSSION_QUERIES } from '../../../graphql/types/discussion/gitlabDiscussionQueries';

export class GitlabDiscussionProcessor {
  async fetchDiscussionData(ids: number[]): Promise<any> {
    const gitlabIds = ids.map(id => `gid://gitlab/Discussion/${id}`);
    try {
      const results = await Promise.allSettled([
        gitlabApiClient.executeQuery(GITLAB_DISCUSSION_QUERIES.CORE_DATA, { ids: gitlabIds }),
        gitlabApiClient.executeQuery(GITLAB_DISCUSSION_QUERIES.NOTES, { ids: gitlabIds })
      ]);

      const [core, notes] = results.map((r) => r.status === 'fulfilled' ? r.value : null);
      const coreDiscussions = core?.data?.discussions?.nodes || [];
      const merged = coreDiscussions.map((d: any) => ({
        ...d,
        notes: notes?.data?.discussions?.nodes?.find((n: any) => n.id === d.id)?.notes || { nodes: [] }
      }));
      return { data: { discussions: merged } };
    } catch (error: unknown) {
      logger.error('Error fetching discussion data', { error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  }
}

export const gitlabDiscussionProcessor = new GitlabDiscussionProcessor();

