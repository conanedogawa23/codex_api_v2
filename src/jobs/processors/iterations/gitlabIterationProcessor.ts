import { logger } from '../../../utils/logger';
import { gitlabApiClient } from '../../../utils/gitlabApiClient';
import { GITLAB_ITERATION_QUERIES } from '../../../graphql/types/iteration/gitlabIterationQueries';

export class GitlabIterationProcessor {
  async fetchSimpleIterations(batchSize: number = 100, groupPath?: string): Promise<any[]> {
    if (!groupPath) {
      logger.warn('Group path required for iteration sync');
      return [];
    }

    logger.info('Fetching simple iterations from GitLab', { batchSize, groupPath });
    const allIterations: any[] = [];
    let hasNextPage = true;
    let after: string | null = null;

    try {
      while (hasNextPage) {
        const result = await gitlabApiClient.executeQuery(GITLAB_ITERATION_QUERIES.SIMPLE_LIST, {
          first: batchSize,
          after,
          groupPath
        });

        const data: any = (result as any)?.data?.group?.iterations;
        if (data?.nodes) {
          // Add groupPath to each iteration for later use
          const iterationsWithPath = data.nodes.map((it: any) => ({
            ...it,
            groupPath
          }));
          allIterations.push(...iterationsWithPath);
          hasNextPage = data.pageInfo?.hasNextPage || false;
          after = data.pageInfo?.endCursor || null;
        } else {
          logger.warn('No iterations data in response', {
            hasNodes: !!data?.nodes,
            dataKeys: Object.keys((result as any)?.data || {})
          });
          hasNextPage = false;
        }
      }

      logger.info('Successfully fetched all simple iterations', { totalIterations: allIterations.length });
      return allIterations;
    } catch (error: unknown) {
      logger.error('Error fetching iterations', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        groupPath
      });
      throw error;
    }
  }

  async fetchIterationData(ids: number[], groupPath?: string): Promise<any> {
    if (!groupPath || ids.length === 0) {
      logger.error('fetchIterationData requires groupPath and at least one ID');
      return { data: { iterations: [] } };
    }

    const iterationId = `gid://gitlab/Iteration/${ids[0]}`;
    logger.debug('Fetching comprehensive iteration data', { groupPath, iterationId });

    try {
      const results = await Promise.allSettled([
        gitlabApiClient.executeQuery(GITLAB_ITERATION_QUERIES.CORE_DATA, { groupPath, iterationId }),
        gitlabApiClient.executeQuery(GITLAB_ITERATION_QUERIES.ISSUES, { groupPath, iterationId })
      ]);

      const [core, issues] = results.map((r, index) => {
        if (r.status === 'rejected') {
          logger.error(`Failed to fetch iteration category ${index}`, {
            error: r.reason instanceof Error ? r.reason.message : 'Unknown error',
            groupPath,
            iterationId
          });
          return null;
        }
        return r.value;
      });

      // Extract iterations from group query and filter by ID
      const allIterations = core?.data?.group?.iterations?.nodes || [];
      const issuesIterations = issues?.data?.group?.iterations?.nodes || [];

      const matchingIteration = allIterations.find((it: any) => it.id === iterationId);

      if (!matchingIteration) {
        logger.warn('No matching iteration found', { groupPath, iterationId });
        return { data: { iterations: [] } };
      }

      // Merge issues data
      const issuesData = issuesIterations.find((i: any) => i.id === iterationId);
      const merged = {
        ...matchingIteration,
        issues: issuesData?.issues || { nodes: [], count: 0 }
      };

      logger.debug('Successfully merged iteration data', { groupPath, iterationId });

      return { data: { iterations: [merged] } };
    } catch (error: unknown) {
      logger.error('Error fetching iteration data', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        groupPath
      });
      throw error;
    }
  }
}

export const gitlabIterationProcessor = new GitlabIterationProcessor();

