import { logger } from '../../../utils/logger';
import { gitlabApiClient } from '../../../utils/gitlabApiClient';
import { GITLAB_ISSUE_QUERIES } from '../../../graphql/types/issue/gitlabIssueQueries';

/**
 * GitLab Issue Data Processor
 * Handles comprehensive issue data fetching from GitLab API using multiple parallel queries
 * 
 * Architecture:
 * - Uses 6 parallel queries for comprehensive data coverage
 * - Each query fetches a specific data category
 * - All queries execute in parallel using Promise.allSettled for optimal performance
 * - Individual query failures don't stop the entire sync process
 * - Results are merged into complete issue objects
 */
export class GitlabIssueProcessor {

  /**
   * Fetch simple issue list from GitLab with pagination support
   * Returns minimal issue data for initial discovery
   * 
   * @param batchSize - Number of issues to fetch per page
   * @param projectPath - Optional project path to filter issues by project
   */
  async fetchSimpleIssues(batchSize: number = 100, projectPath?: string): Promise<any[]> {
    logger.info('Fetching simple issues from GitLab', { batchSize, projectPath });

    const allIssues: any[] = [];
    let hasNextPage = true;
    let after: string | null = null;

    try {
      while (hasNextPage) {
        // Use project-specific query if projectPath provided, otherwise fetch all issues
        const query = projectPath ? GITLAB_ISSUE_QUERIES.SIMPLE_LIST : GITLAB_ISSUE_QUERIES.SIMPLE_LIST_ALL;
        const variables = projectPath
          ? { first: batchSize, after, projectPath }
          : { first: batchSize, after };

        const result = await gitlabApiClient.executeQuery(query, variables);

        const issuesData: any = projectPath
          ? (result as any)?.data?.project?.issues
          : (result as any)?.data?.issues;

        if (issuesData?.nodes) {
          allIssues.push(...issuesData.nodes);
          hasNextPage = issuesData.pageInfo?.hasNextPage || false;
          after = issuesData.pageInfo?.endCursor || null;

          logger.debug('Fetched issue batch', {
            batchSize: issuesData.nodes.length,
            totalIssues: allIssues.length,
            hasNextPage
          });
        } else {
          logger.warn('No issues data in response', {
            hasNodes: !!issuesData?.nodes,
            dataKeys: Object.keys((result as any)?.data || {})
          });
          hasNextPage = false;
        }
      }

      logger.info('Successfully fetched all simple issues', {
        totalIssues: allIssues.length,
        projectPath
      });

      return allIssues;
    } catch (error: unknown) {
      logger.error('Error fetching simple issues from GitLab', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        issuesFetchedBeforeError: allIssues.length,
        projectPath
      });
      throw error;
    }
  }

  /**
   * Fetch comprehensive issue data using parallel category queries
   * Uses Promise.allSettled to ensure individual query failures don't stop the sync
   * 
   * @param issueIds - Array of GitLab issue IDs
   * @returns Merged issue data from all successful category queries
   */
  async fetchIssueData(issueIds: number[]): Promise<any> {
    logger.debug('Fetching comprehensive issue data', {
      issueCount: issueIds.length,
      issueIds
    });

    // Convert numeric IDs to GitLab global IDs
    const gitlabIds = issueIds.map(id => `gid://gitlab/Issue/${id}`);

    try {
      // Execute all category queries in parallel with Promise.allSettled
      // This ensures one failure doesn't stop other queries
      const results = await Promise.allSettled([
        this.executeCategory('CORE_DATA', gitlabApiClient.executeQuery(GITLAB_ISSUE_QUERIES.CORE_DATA, { ids: gitlabIds })),
        this.executeCategory('ASSIGNEES_AUTHOR', gitlabApiClient.executeQuery(GITLAB_ISSUE_QUERIES.ASSIGNEES_AUTHOR, { ids: gitlabIds })),
        this.executeCategory('LABELS_MILESTONES', gitlabApiClient.executeQuery(GITLAB_ISSUE_QUERIES.LABELS_MILESTONES, { ids: gitlabIds })),
        this.executeCategory('RELATED_MRS', gitlabApiClient.executeQuery(GITLAB_ISSUE_QUERIES.RELATED_MRS, { ids: gitlabIds })),
        this.executeCategory('ISSUE_LINKS', gitlabApiClient.executeQuery(GITLAB_ISSUE_QUERIES.ISSUE_LINKS, { ids: gitlabIds })),
        this.executeCategory('TIME_TRACKING', gitlabApiClient.executeQuery(GITLAB_ISSUE_QUERIES.TIME_TRACKING, { ids: gitlabIds }))
      ]);

      // Extract results and handle failures
      const [
        coreDataResults,
        assigneesAuthorResults,
        labelsMilestonesResults,
        relatedMRsResults,
        issueLinksResults,
        timeTrackingResults
      ] = results.map((result, index) => {
        if (result.status === 'rejected') {
          const categoryName = this.getCategoryName(index);
          logger.error(`Failed to fetch ${categoryName} data for issues`, {
            error: result.reason instanceof Error ? result.reason.message : 'Unknown error',
            category: categoryName,
            issueIds
          });
          return null;
        }
        return result.value;
      });

      // Merge all category results into complete issue data
      const mergedData = this.mergeCompleteIssueData(
        coreDataResults,
        assigneesAuthorResults,
        labelsMilestonesResults,
        relatedMRsResults,
        issueLinksResults,
        timeTrackingResults
      );

      logger.debug('Successfully merged issue data from categories', {
        issueCount: issueIds.length,
        successfulCategories: results.filter(r => r.status === 'fulfilled').length,
        failedCategories: results.filter(r => r.status === 'rejected').length
      });

      return mergedData;
    } catch (error: unknown) {
      logger.error('Error fetching issue data', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        issueIds
      });
      throw error;
    }
  }

  /**
   * Execute a category query with proper error handling and logging
   * @private
   */
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

  /**
   * Get category name by index for error reporting
   * @private
   */
  private getCategoryName(index: number): string {
    const categories = [
      'CORE_DATA',
      'ASSIGNEES_AUTHOR',
      'LABELS_MILESTONES',
      'RELATED_MRS',
      'ISSUE_LINKS',
      'TIME_TRACKING'
    ];
    return categories[index] || `Unknown_${index}`;
  }

  /**
   * Merge all category results into complete issue data
   * Handles null/undefined results gracefully from failed queries
   * @private
   */
  private mergeCompleteIssueData(
    coreData: any,
    assigneesAuthor: any,
    labelsMilestones: any,
    relatedMRs: any,
    issueLinks: any,
    timeTracking: any
  ): any {
    logger.debug('Merging issue data from all categories');

    // Extract issue arrays from each category
    const coreIssues = coreData?.data?.issues?.nodes || [];
    const assigneesIssues = assigneesAuthor?.data?.issues?.nodes || [];
    const labelsIssues = labelsMilestones?.data?.issues?.nodes || [];
    const relatedMRsIssues = relatedMRs?.data?.issues?.nodes || [];
    const linksIssues = issueLinks?.data?.issues?.nodes || [];
    const timeTrackingIssues = timeTracking?.data?.issues?.nodes || [];

    // Use core data as base and merge additional data
    const mergedIssues = coreIssues.map((coreIssue: any) => {
      const issueId = coreIssue.id;

      // Find matching data from other categories
      const assigneesData = assigneesIssues.find((i: any) => i.id === issueId);
      const labelsData = labelsIssues.find((i: any) => i.id === issueId);
      const mrsData = relatedMRsIssues.find((i: any) => i.id === issueId);
      const linksData = linksIssues.find((i: any) => i.id === issueId);
      const timeData = timeTrackingIssues.find((i: any) => i.id === issueId);

      // Merge all data into one issue object
      return {
        ...coreIssue,
        author: assigneesData?.author || null,
        assignees: assigneesData?.assignees || { nodes: [] },
        labels: labelsData?.labels || { nodes: [] },
        milestone: labelsData?.milestone || null,
        epic: labelsData?.epic || null,
        relatedMergeRequests: mrsData?.relatedMergeRequests || { nodes: [], count: 0 },
        closingMergeRequests: mrsData?.closingMergeRequests || { nodes: [] },
        blockedByIssues: linksData?.blockedByIssues || { nodes: [], count: 0 },
        blockingIssues: linksData?.blockingIssues || { nodes: [], count: 0 },
        relatedIssues: linksData?.relatedIssues || { nodes: [], count: 0 },
        timeEstimate: timeData?.timeEstimate || 0,
        totalTimeSpent: timeData?.totalTimeSpent || 0,
        humanTimeEstimate: timeData?.humanTimeEstimate || null,
        humanTotalTimeSpent: timeData?.humanTotalTimeSpent || null,
        timelogs: timeData?.timelogs || { nodes: [], count: 0 }
      };
    });

    logger.debug('Issue data merge complete', {
      issueCount: mergedIssues.length
    });

    return {
      data: {
        issues: mergedIssues
      }
    };
  }
}

export const gitlabIssueProcessor = new GitlabIssueProcessor();

