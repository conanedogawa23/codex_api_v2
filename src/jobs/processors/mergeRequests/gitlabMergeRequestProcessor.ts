import { logger } from '../../../utils/logger';
import { gitlabApiClient } from '../../../utils/gitlabApiClient';
import { GITLAB_MERGE_REQUEST_QUERIES } from '../../../graphql/types/mergeRequest/gitlabMergeRequestQueries';

/**
 * GitLab Merge Request Data Processor
 * Handles comprehensive MR data fetching from GitLab API using multiple parallel queries
 * 
 * Architecture:
 * - Uses 8 parallel queries for comprehensive data coverage
 * - Each query fetches a specific data category
 * - All queries execute in parallel using Promise.allSettled for optimal performance
 * - Individual query failures don't stop the entire sync process
 * - Results are merged into complete MR objects
 */
export class GitlabMergeRequestProcessor {

  /**
   * Fetch simple MR list from GitLab with pagination support
   * Returns minimal MR data for initial discovery
   */
  async fetchSimpleMergeRequests(batchSize: number = 100, projectPath?: string): Promise<any[]> {
    logger.info('Fetching simple merge requests from GitLab', { batchSize, projectPath });

    const allMRs: any[] = [];
    let hasNextPage = true;
    let after: string | null = null;

    try {
      while (hasNextPage) {
        const query = projectPath ? GITLAB_MERGE_REQUEST_QUERIES.SIMPLE_LIST : GITLAB_MERGE_REQUEST_QUERIES.SIMPLE_LIST_ALL;
        const variables = projectPath
          ? { first: batchSize, after, projectPath }
          : { first: batchSize, after };

        const result = await gitlabApiClient.executeQuery(query, variables);

        const mrsData: any = projectPath
          ? (result as any)?.data?.project?.mergeRequests
          : (result as any)?.data?.mergeRequests;

        if (mrsData?.nodes) {
          allMRs.push(...mrsData.nodes);
          hasNextPage = mrsData.pageInfo?.hasNextPage || false;
          after = mrsData.pageInfo?.endCursor || null;

          logger.debug('Fetched MR batch', {
            batchSize: mrsData.nodes.length,
            totalMRs: allMRs.length,
            hasNextPage
          });
        } else {
          logger.warn('No MRs data in response', {
            hasNodes: !!mrsData?.nodes,
            dataKeys: Object.keys((result as any)?.data || {})
          });
          hasNextPage = false;
        }
      }

      logger.info('Successfully fetched all simple merge requests', {
        totalMRs: allMRs.length,
        projectPath
      });

      return allMRs;
    } catch (error: unknown) {
      logger.error('Error fetching simple merge requests from GitLab', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        mrsFetchedBeforeError: allMRs.length,
        projectPath
      });
      throw error;
    }
  }

  /**
   * Fetch comprehensive MR data using parallel category queries
   * Uses Promise.allSettled to ensure individual query failures don't stop the sync
   */
  async fetchMergeRequestData(mrIds: number[]): Promise<any> {
    logger.debug('Fetching comprehensive merge request data', {
      mrCount: mrIds.length,
      mrIds
    });

    const gitlabIds = mrIds.map(id => `gid://gitlab/MergeRequest/${id}`);

    try {
      const results = await Promise.allSettled([
        this.executeCategory('CORE_DATA', gitlabApiClient.executeQuery(GITLAB_MERGE_REQUEST_QUERIES.CORE_DATA, { ids: gitlabIds })),
        this.executeCategory('REVIEWERS_ASSIGNEES', gitlabApiClient.executeQuery(GITLAB_MERGE_REQUEST_QUERIES.REVIEWERS_ASSIGNEES, { ids: gitlabIds })),
        this.executeCategory('APPROVALS', gitlabApiClient.executeQuery(GITLAB_MERGE_REQUEST_QUERIES.APPROVALS, { ids: gitlabIds })),
        this.executeCategory('PIPELINES', gitlabApiClient.executeQuery(GITLAB_MERGE_REQUEST_QUERIES.PIPELINES, { ids: gitlabIds })),
        this.executeCategory('DIFF_STATS', gitlabApiClient.executeQuery(GITLAB_MERGE_REQUEST_QUERIES.DIFF_STATS, { ids: gitlabIds })),
        this.executeCategory('DISCUSSIONS', gitlabApiClient.executeQuery(GITLAB_MERGE_REQUEST_QUERIES.DISCUSSIONS, { ids: gitlabIds })),
        this.executeCategory('COMMITS', gitlabApiClient.executeQuery(GITLAB_MERGE_REQUEST_QUERIES.COMMITS, { ids: gitlabIds })),
        this.executeCategory('CHANGES', gitlabApiClient.executeQuery(GITLAB_MERGE_REQUEST_QUERIES.CHANGES, { ids: gitlabIds }))
      ]);

      const [
        coreDataResults,
        reviewersAssigneesResults,
        approvalsResults,
        pipelinesResults,
        diffStatsResults,
        discussionsResults,
        commitsResults,
        changesResults
      ] = results.map((result, index) => {
        if (result.status === 'rejected') {
          const categoryName = this.getCategoryName(index);
          logger.error(`Failed to fetch ${categoryName} data for merge requests`, {
            error: result.reason instanceof Error ? result.reason.message : 'Unknown error',
            category: categoryName,
            mrIds
          });
          return null;
        }
        return result.value;
      });

      const mergedData = this.mergeCompleteMergeRequestData(
        coreDataResults,
        reviewersAssigneesResults,
        approvalsResults,
        pipelinesResults,
        diffStatsResults,
        discussionsResults,
        commitsResults,
        changesResults
      );

      logger.debug('Successfully merged merge request data from categories', {
        mrCount: mrIds.length,
        successfulCategories: results.filter(r => r.status === 'fulfilled').length,
        failedCategories: results.filter(r => r.status === 'rejected').length
      });

      return mergedData;
    } catch (error: unknown) {
      logger.error('Error fetching merge request data', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        mrIds
      });
      throw error;
    }
  }

  private async executeCategory(categoryName: string, queryPromise: Promise<any>): Promise<any> {
    try {
      const result = await queryPromise;
      logger.debug(`Successfully fetched ${categoryName} data`);
      return result;
    } catch (error: unknown) {
      logger.error(`Failed to execute ${categoryName} query`, {
        error: error instanceof Error ? error.message : 'Unknown error',
        category: categoryName
      });
      throw error;
    }
  }

  private getCategoryName(index: number): string {
    const categories = [
      'CORE_DATA',
      'REVIEWERS_ASSIGNEES',
      'APPROVALS',
      'PIPELINES',
      'DIFF_STATS',
      'DISCUSSIONS',
      'COMMITS',
      'CHANGES'
    ];
    return categories[index] || `Unknown_${index}`;
  }

  private mergeCompleteMergeRequestData(
    coreData: any,
    reviewersAssignees: any,
    approvals: any,
    pipelines: any,
    diffStats: any,
    discussions: any,
    commits: any,
    changes: any
  ): any {
    logger.debug('Merging merge request data from all categories');

    const coreMRs = coreData?.data?.mergeRequests?.nodes || [];
    const reviewersMRs = reviewersAssignees?.data?.mergeRequests?.nodes || [];
    const approvalsMRs = approvals?.data?.mergeRequests?.nodes || [];
    const pipelinesMRs = pipelines?.data?.mergeRequests?.nodes || [];
    const diffStatsMRs = diffStats?.data?.mergeRequests?.nodes || [];
    const discussionsMRs = discussions?.data?.mergeRequests?.nodes || [];
    const commitsMRs = commits?.data?.mergeRequests?.nodes || [];
    const changesMRs = changes?.data?.mergeRequests?.nodes || [];

    const mergedMRs = coreMRs.map((coreMR: any) => {
      const mrId = coreMR.id;

      const reviewersData = reviewersMRs.find((mr: any) => mr.id === mrId);
      const approvalsData = approvalsMRs.find((mr: any) => mr.id === mrId);
      const pipelinesData = pipelinesMRs.find((mr: any) => mr.id === mrId);
      const diffStatsData = diffStatsMRs.find((mr: any) => mr.id === mrId);
      const discussionsData = discussionsMRs.find((mr: any) => mr.id === mrId);
      const commitsData = commitsMRs.find((mr: any) => mr.id === mrId);
      const changesData = changesMRs.find((mr: any) => mr.id === mrId);

      return {
        ...coreMR,
        author: reviewersData?.author || null,
        assignees: reviewersData?.assignees || { nodes: [] },
        reviewers: reviewersData?.reviewers || { nodes: [] },
        mergedBy: reviewersData?.mergedBy || null,
        approved: approvalsData?.approved || false,
        approvedBy: approvalsData?.approvedBy || { nodes: [] },
        approvalsLeft: approvalsData?.approvalsLeft || 0,
        approvalsRequired: approvalsData?.approvalsRequired || 0,
        approvalState: approvalsData?.approvalState || null,
        headPipeline: pipelinesData?.headPipeline || null,
        pipelines: pipelinesData?.pipelines || { nodes: [], count: 0 },
        diffStats: diffStatsData?.diffStats || null,
        diffStatsSummary: diffStatsData?.diffStatsSummary || null,
        discussions: discussionsData?.discussions || { nodes: [] },
        commits: commitsData?.commits || { nodes: [], count: 0 },
        commitCount: commitsData?.commitCount || 0,
        diffRefs: changesData?.diffRefs || null,
        diffHeadSha: changesData?.diffHeadSha || null
      };
    });

    logger.debug('Merge request data merge complete', {
      mrCount: mergedMRs.length
    });

    return {
      data: {
        mergeRequests: mergedMRs
      }
    };
  }
}

export const gitlabMergeRequestProcessor = new GitlabMergeRequestProcessor();

