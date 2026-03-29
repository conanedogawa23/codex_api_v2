import { logger } from '../../../utils/logger';
import { gitlabApiClient } from '../../../utils/gitlabApiClient';
import { GITLAB_MERGE_REQUEST_QUERIES } from '../../../graphql/types/mergeRequest/gitlabMergeRequestQueries';

/**
 * GitLab Merge Request Data Processor
 * Handles comprehensive MR data fetching from GitLab API using multiple parallel queries
 * 
 * Architecture:
 * - Uses the stable GraphQL categories available on this GitLab deployment
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
    let pageCount = 0;
    const maxPages = 100; // Allows fetching up to 10,000 MRs per project (100 pages * 100 per page)

    try {
      while (hasNextPage && pageCount < maxPages) {
        pageCount++;
        
        const query = projectPath 
          ? GITLAB_MERGE_REQUEST_QUERIES.SIMPLE_LIST 
          : GITLAB_MERGE_REQUEST_QUERIES.SIMPLE_LIST_ALL;
          
        const variables = projectPath
          ? { first: batchSize, after, projectPath }
          : { first: batchSize, after };

        logger.debug('Executing GitLab query for merge requests', {
          query: projectPath ? 'SIMPLE_LIST' : 'SIMPLE_LIST_ALL',
          variables,
          pageCount
        });

        const result = await gitlabApiClient.executeQuery(query, variables);

        // Validate response structure
        if (!result || !result.data) {
          logger.error('Invalid response from GitLab API', {
            hasResult: !!result,
            hasData: !!(result as any)?.data,
            responseKeys: result ? Object.keys(result) : []
          });
          hasNextPage = false;
          break;
        }

        const mrsData: any = projectPath
          ? (result as any).data?.project?.mergeRequests
          : (result as any).data?.mergeRequests;

        if (!mrsData) {
          logger.warn('No merge requests data in GitLab response', {
            hasProject: !!(result as any).data?.project,
            hasMergeRequests: !!(result as any).data?.mergeRequests,
            dataKeys: Object.keys((result as any).data || {}),
            projectPath
          });
          hasNextPage = false;
          break;
        }

        if (mrsData.nodes && Array.isArray(mrsData.nodes)) {
          const validMRs = mrsData.nodes.filter((mr: any) => {
            if (!mr || !mr.id) {
              logger.warn('Skipping invalid MR node', { mr });
              return false;
            }
            return true;
          });

          allMRs.push(...validMRs);
          hasNextPage = mrsData.pageInfo?.hasNextPage || false;
          after = mrsData.pageInfo?.endCursor || null;

          logger.debug('Fetched MR batch successfully', {
            batchSize: validMRs.length,
            totalMRs: allMRs.length,
            hasNextPage,
            pageCount,
            endCursor: after
          });
        } else {
          logger.warn('MR nodes missing or invalid', {
            hasNodes: !!mrsData.nodes,
            isArray: Array.isArray(mrsData.nodes),
            mrsDataKeys: Object.keys(mrsData)
          });
          hasNextPage = false;
        }
      }

      if (pageCount >= maxPages) {
        logger.warn('Reached maximum page limit for MR fetch', {
          maxPages,
          mrsFetched: allMRs.length
        });
      }

      logger.info('Successfully fetched all simple merge requests', {
        totalMRs: allMRs.length,
        pagesFetched: pageCount,
        projectPath: projectPath || 'all projects'
      });

      return allMRs;
    } catch (error: unknown) {
      logger.error('Error fetching simple merge requests from GitLab', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        mrsFetchedBeforeError: allMRs.length,
        pagesFetched: pageCount,
        projectPath: projectPath || 'all projects'
      });
      
      // Return partial results if any were fetched before error
      if (allMRs.length > 0) {
        logger.info('Returning partial MR results after error', {
          mrCount: allMRs.length
        });
        return allMRs;
      }
      
      throw error;
    }
  }

  /**
   * Fetch comprehensive MR data using the stable individual queries
   * Fetches each MR one at a time with all category data
   * Uses Promise.allSettled to ensure individual query failures don't stop the sync
   */
  async fetchMergeRequestData(mrIds: number[]): Promise<any> {
    if (!mrIds || mrIds.length === 0) {
      logger.warn('No merge request IDs provided for fetching');
      return { data: { mergeRequests: [] } };
    }

    logger.debug('Fetching comprehensive merge request data', {
      mrCount: mrIds.length,
      mrIds: mrIds.slice(0, 5), // Log first 5 IDs only
      totalIds: mrIds.length
    });

    const allMergeRequests: any[] = [];

    // Fetch each MR individually with all its category data
    for (const mrId of mrIds) {
      try {
        const gitlabId = `gid://gitlab/MergeRequest/${mrId}`;
        
        const results = await Promise.allSettled([
          this.executeCategory('CORE_DATA', gitlabApiClient.executeQuery(GITLAB_MERGE_REQUEST_QUERIES.CORE_DATA, { id: gitlabId })),
          this.executeCategory('REVIEWERS_ASSIGNEES', gitlabApiClient.executeQuery(GITLAB_MERGE_REQUEST_QUERIES.REVIEWERS_ASSIGNEES, { id: gitlabId })),
        ]);

        const [
          coreDataResult,
          reviewersAssigneesResult,
        ] = results.map((result, index) => {
          if (result.status === 'rejected') {
            const categoryName = this.getCategoryName(index);
            logger.warn(`Failed to fetch ${categoryName} for MR ${mrId}`, {
              error: result.reason instanceof Error ? result.reason.message : 'Unknown error',
              category: categoryName,
              mrId
            });
            return null;
          }
          return result.value;
        });

        // If we got core data, merge all category data for this MR
        if (coreDataResult && coreDataResult.data?.mergeRequest) {
          const mergedMR = this.mergeSingleMergeRequestData(
            coreDataResult.data.mergeRequest,
            reviewersAssigneesResult?.data?.mergeRequest
          );

          allMergeRequests.push(mergedMR);

          const successfulCategories = results.filter(r => r.status === 'fulfilled').length;
          logger.debug(`Fetched MR ${mrId} with ${successfulCategories}/2 categories`);
        } else {
          logger.warn(`No core data for MR ${mrId} - skipping`);
        }

      } catch (error: unknown) {
        logger.error(`Error fetching MR ${mrId}`, {
          error: error instanceof Error ? error.message : 'Unknown error',
          mrId
        });
        // Continue with next MR
      }
    }

    logger.info('Completed fetching all merge requests', {
      requested: mrIds.length,
      fetched: allMergeRequests.length
    });

    return {
      data: {
        mergeRequests: allMergeRequests
      }
    };
  }

  private async executeCategory(categoryName: string, queryPromise: Promise<any>): Promise<any> {
    const startTime = Date.now();
    try {
      const result = await queryPromise;
      const duration = Date.now() - startTime;
      
      // Validate result structure
      if (!result || !result.data) {
        logger.warn(`${categoryName} query returned invalid structure`, {
          hasResult: !!result,
          hasData: !!result?.data,
          duration
        });
      } else {
        logger.debug(`Successfully fetched ${categoryName} data`, {
          duration,
          hasNodes: !!result.data.mergeRequests?.nodes,
          nodeCount: result.data.mergeRequests?.nodes?.length || 0
        });
      }
      
      return result;
    } catch (error: unknown) {
      const duration = Date.now() - startTime;
      logger.error(`Failed to execute ${categoryName} query`, {
        error: error instanceof Error ? error.message : 'Unknown error',
        errorStack: error instanceof Error ? error.stack : undefined,
        category: categoryName,
        duration
      });
      throw error;
    }
  }

  private getCategoryName(index: number): string {
    const categories = [
      'CORE_DATA',
      'REVIEWERS_ASSIGNEES',
    ];
    return categories[index] || `Unknown_${index}`;
  }

  /**
   * Merge data from all categories for a single MR
   */
  private mergeSingleMergeRequestData(
    coreData: any,
    reviewersAssignees: any,
  ): any {
    return {
      ...coreData,
      author: reviewersAssignees?.author || null,
      assignees: reviewersAssignees?.assignees || { nodes: [] },
      reviewers: reviewersAssignees?.reviewers || { nodes: [] },
      mergedBy: reviewersAssignees?.mergedBy || null,
    };
  }
}

export const gitlabMergeRequestProcessor = new GitlabMergeRequestProcessor();

