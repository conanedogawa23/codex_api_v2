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
          // Add projectPath to each milestone for later use
          const milestonesWithPath = data.nodes.map((m: any) => ({
            ...m,
            projectPath
          }));
          allMilestones.push(...milestonesWithPath);
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

  async fetchMilestoneData(ids: number[], projectPath?: string): Promise<any> {
    if (!projectPath || ids.length === 0) {
      logger.error('fetchMilestoneData requires projectPath and at least one ID');
      return { data: { milestones: [] } };
    }

    const milestoneId = `gid://gitlab/Milestone/${ids[0]}`;
    logger.debug('Fetching comprehensive milestone data', { projectPath, milestoneId });

    try {
      const results = await Promise.allSettled([
        gitlabApiClient.executeQuery(GITLAB_MILESTONE_QUERIES.CORE_DATA, { projectPath, id: milestoneId }),
        gitlabApiClient.executeQuery(GITLAB_MILESTONE_QUERIES.ISSUES, { projectPath, id: milestoneId }),
        gitlabApiClient.executeQuery(GITLAB_MILESTONE_QUERIES.MERGE_REQUESTS, { projectPath, id: milestoneId }),
        gitlabApiClient.executeQuery(GITLAB_MILESTONE_QUERIES.STATISTICS, { projectPath, id: milestoneId })
      ]);

      const [core, issues, mrs, stats] = results.map((r, index) => {
        if (r.status === 'rejected') {
          logger.error(`Failed to fetch milestone category ${index}`, {
            error: r.reason instanceof Error ? r.reason.message : 'Unknown error',
            projectPath,
            milestoneId
          });
          return null;
        }
        return r.value;
      });

      // Extract single milestone from each category
      const coreMilestone = core?.data?.project?.milestone || null;
      const issuesData = issues?.data?.project?.milestone || null;
      const mrsData = mrs?.data?.project?.milestone || null;
      const statsData = stats?.data?.project?.milestone || null;

      if (!coreMilestone) {
        logger.warn('No core milestone data available', { projectPath, milestoneId });
        return { data: { milestones: [] } };
      }

      // Merge all data
      const merged = {
        ...coreMilestone,
        issues: issuesData?.issues || { nodes: [], count: 0 },
        mergeRequests: mrsData?.mergeRequests || { nodes: [], count: 0 },
        stats: statsData?.stats || null
      };

      logger.debug('Successfully merged milestone data', { projectPath, milestoneId });

      return { data: { milestones: [merged] } };
    } catch (error: unknown) {
      logger.error('Error fetching milestone data', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        projectPath
      });
      throw error;
    }
  }
}

export const gitlabMilestoneProcessor = new GitlabMilestoneProcessor();

