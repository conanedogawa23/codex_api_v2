import { logger } from '../../../utils/logger';
import { gitlabApiClient } from '../../../utils/gitlabApiClient';
import { GITLAB_ITERATION_QUERIES } from '../../../graphql/types/iteration/gitlabIterationQueries';

export class GitlabIterationProcessor {
  async fetchSimpleIterations(batchSize: number = 100): Promise<any[]> {
    const allIterations: any[] = [];
    let hasNextPage = true;
    let after: string | null = null;

    try {
      while (hasNextPage) {
        const result = await gitlabApiClient.executeQuery(GITLAB_ITERATION_QUERIES.SIMPLE_LIST, {
          first: batchSize,
          after
        });

        const data: any = (result as any)?.data?.iterations;
        if (data?.nodes) {
          allIterations.push(...data.nodes);
          hasNextPage = data.pageInfo?.hasNextPage || false;
          after = data.pageInfo?.endCursor || null;
        } else {
          hasNextPage = false;
        }
      }
      return allIterations;
    } catch (error: unknown) {
      logger.error('Error fetching iterations', { error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  }

  async fetchIterationData(ids: number[]): Promise<any> {
    const gitlabIds = ids.map(id => `gid://gitlab/Iteration/${id}`);
    try {
      const results = await Promise.allSettled([
        gitlabApiClient.executeQuery(GITLAB_ITERATION_QUERIES.CORE_DATA, { ids: gitlabIds }),
        gitlabApiClient.executeQuery(GITLAB_ITERATION_QUERIES.ISSUES, { ids: gitlabIds })
      ]);

      const [core, issues] = results.map((r) => r.status === 'fulfilled' ? r.value : null);
      const coreIterations = core?.data?.iterations?.nodes || [];
      const merged = coreIterations.map((it: any) => ({
        ...it,
        issues: issues?.data?.iterations?.nodes?.find((i: any) => i.id === it.id)?.issues || { nodes: [], count: 0 }
      }));
      return { data: { iterations: merged } };
    } catch (error: unknown) {
      logger.error('Error fetching iteration data', { error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  }
}

export const gitlabIterationProcessor = new GitlabIterationProcessor();

