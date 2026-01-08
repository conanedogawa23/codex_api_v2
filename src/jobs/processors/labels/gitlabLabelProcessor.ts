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
          // Add projectPath to each label for later use
          const labelsWithPath = data.nodes.map((l: any) => ({
            ...l,
            projectPath
          }));
          allLabels.push(...labelsWithPath);
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

  async fetchLabelData(ids: number[], projectPath?: string): Promise<any> {
    if (!projectPath || ids.length === 0) {
      logger.error('fetchLabelData requires projectPath and at least one ID');
      return { data: { labels: [] } };
    }

    const labelId = `gid://gitlab/ProjectLabel/${ids[0]}`;
    logger.debug('Fetching comprehensive label data', { projectPath, labelId });

    try {
      const results = await Promise.allSettled([
        gitlabApiClient.executeQuery(GITLAB_LABEL_QUERIES.CORE_DATA, { projectPath, labelId }),
        gitlabApiClient.executeQuery(GITLAB_LABEL_QUERIES.USAGE_STATS, { projectPath, labelId }),
        gitlabApiClient.executeQuery(GITLAB_LABEL_QUERIES.RELATED_ISSUES, { projectPath, labelId })
      ]);

      const [core] = results.map((r, index) => {
        if (r.status === 'rejected') {
          logger.error(`Failed to fetch label category ${index}`, {
            error: r.reason instanceof Error ? r.reason.message : 'Unknown error',
            projectPath,
            labelId
          });
          return null;
        }
        return r.value;
      });

      // Extract labels from project query and filter by ID
      const allLabels = core?.data?.project?.labels?.nodes || [];
      const matchingLabel = allLabels.find((l: any) => l.id === labelId);

      if (!matchingLabel) {
        logger.warn('No matching label found', { projectPath, labelId });
        return { data: { labels: [] } };
      }

      logger.debug('Successfully found label data', { projectPath, labelId });

      return { data: { labels: [matchingLabel] } };
    } catch (error: unknown) {
      logger.error('Error fetching label data', {
        error: error instanceof Error ? error.message : 'Unknown error',
        projectPath
      });
      throw error;
    }
  }
}

export const gitlabLabelProcessor = new GitlabLabelProcessor();

