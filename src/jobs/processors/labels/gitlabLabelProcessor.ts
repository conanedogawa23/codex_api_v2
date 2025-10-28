import { logger } from '../../../utils/logger';
import { gitlabApiClient } from '../../../utils/gitlabApiClient';
import { GITLAB_LABEL_QUERIES } from '../../../graphql/types/label/gitlabLabelQueries';

export class GitlabLabelProcessor {
  async fetchSimpleLabels(batchSize: number = 100, projectPath?: string): Promise<any[]> {
    if (!projectPath) return [];
    const allLabels: any[] = [];
    let hasNextPage = true;
    let after: string | null = null;

    try {
      while (hasNextPage) {
        const result = await gitlabApiClient.executeQuery(GITLAB_LABEL_QUERIES.SIMPLE_LIST, {
          first: batchSize,
          after,
          projectPath
        });

        const data: any = (result as any)?.data?.project?.labels;
        if (data?.nodes) {
          allLabels.push(...data.nodes);
          hasNextPage = data.pageInfo?.hasNextPage || false;
          after = data.pageInfo?.endCursor || null;
        } else {
          hasNextPage = false;
        }
      }
      return allLabels;
    } catch (error: unknown) {
      logger.error('Error fetching labels', { error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  }

  async fetchLabelData(ids: number[]): Promise<any> {
    const gitlabIds = ids.map(id => `gid://gitlab/Label/${id}`);
    try {
      const results = await Promise.allSettled([
        gitlabApiClient.executeQuery(GITLAB_LABEL_QUERIES.CORE_DATA, { ids: gitlabIds }),
        gitlabApiClient.executeQuery(GITLAB_LABEL_QUERIES.USAGE_STATS, { ids: gitlabIds }),
        gitlabApiClient.executeQuery(GITLAB_LABEL_QUERIES.RELATED_ISSUES, { ids: gitlabIds })
      ]);

      const [core] = results.map((r) => r.status === 'fulfilled' ? r.value : null);
      return { data: { labels: core?.data?.labels?.nodes || [] } };
    } catch (error: unknown) {
      logger.error('Error fetching label data', { error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  }
}

export const gitlabLabelProcessor = new GitlabLabelProcessor();

