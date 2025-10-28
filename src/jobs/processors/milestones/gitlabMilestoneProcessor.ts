import { logger } from '../../../utils/logger';
import { gitlabApiClient } from '../../../utils/gitlabApiClient';
import { GITLAB_MILESTONE_QUERIES } from '../../../graphql/types/milestone/gitlabMilestoneQueries';

export class GitlabMilestoneProcessor {
  async fetchSimpleMilestones(batchSize: number = 100, projectPath?: string): Promise<any[]> {
    if (!projectPath) return [];
    const allMilestones: any[] = [];
    let hasNextPage = true;
    let after: string | null = null;

    try {
      while (hasNextPage) {
        const result = await gitlabApiClient.executeQuery(GITLAB_MILESTONE_QUERIES.SIMPLE_LIST, {
          first: batchSize,
          after,
          projectPath
        });

        const data: any = (result as any)?.data?.project?.milestones;
        if (data?.nodes) {
          allMilestones.push(...data.nodes);
          hasNextPage = data.pageInfo?.hasNextPage || false;
          after = data.pageInfo?.endCursor || null;
        } else {
          hasNextPage = false;
        }
      }
      return allMilestones;
    } catch (error: unknown) {
      logger.error('Error fetching milestones', { error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  }

  async fetchMilestoneData(ids: number[]): Promise<any> {
    const gitlabIds = ids.map(id => `gid://gitlab/Milestone/${id}`);
    try {
      const results = await Promise.allSettled([
        gitlabApiClient.executeQuery(GITLAB_MILESTONE_QUERIES.CORE_DATA, { ids: gitlabIds }),
        gitlabApiClient.executeQuery(GITLAB_MILESTONE_QUERIES.ISSUES, { ids: gitlabIds }),
        gitlabApiClient.executeQuery(GITLAB_MILESTONE_QUERIES.MERGE_REQUESTS, { ids: gitlabIds }),
        gitlabApiClient.executeQuery(GITLAB_MILESTONE_QUERIES.STATISTICS, { ids: gitlabIds })
      ]);

      const [core, issues, mrs, stats] = results.map((r) => r.status === 'fulfilled' ? r.value : null);
      const coreMilestones = core?.data?.milestones?.nodes || [];
      const merged = coreMilestones.map((m: any) => ({
        ...m,
        issues: issues?.data?.milestones?.nodes?.find((i: any) => i.id === m.id)?.issues || { nodes: [], count: 0 },
        mergeRequests: mrs?.data?.milestones?.nodes?.find((mr: any) => mr.id === m.id)?.mergeRequests || { nodes: [], count: 0 },
        stats: stats?.data?.milestones?.nodes?.find((s: any) => s.id === m.id)?.stats || null
      }));
      return { data: { milestones: merged } };
    } catch (error: unknown) {
      logger.error('Error fetching milestone data', { error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  }
}

export const gitlabMilestoneProcessor = new GitlabMilestoneProcessor();

