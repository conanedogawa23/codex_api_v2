import { logger } from '../../../utils/logger';
import { gitlabApiClient } from '../../../utils/gitlabApiClient';
import { GITLAB_PROJECT_QUERIES } from '../../../graphql/types/project/gitlabProjectQueries';

/**
 * GitLab Project Data Processor
 * Handles comprehensive project data fetching from GitLab API using multiple parallel queries
 * 
 * Architecture:
 * - Uses 8 parallel queries for comprehensive data coverage
 * - Each query fetches a specific data category
 * - All queries execute in parallel using Promise.allSettled for optimal performance
 * - Individual query failures don't stop the entire sync process
 * - Results are merged into complete project objects
 */
export class GitlabProjectProcessor {

  /**
   * Fetch simple project list from GitLab with pagination support
   * Returns minimal project data for initial discovery
   */
  async fetchSimpleProjects(batchSize: number = 100): Promise<any[]> {
    logger.info('Fetching simple projects from GitLab', { batchSize });

    const allProjects: any[] = [];
    let hasNextPage = true;
    let after: string | null = null;

    try {
      while (hasNextPage) {
        const result = await gitlabApiClient.executeQuery(GITLAB_PROJECT_QUERIES.SIMPLE_LIST, {
          first: batchSize,
          after: after
        });

        const projectsData: any = (result as any)?.data?.projects;
        if (projectsData?.nodes) {
          allProjects.push(...projectsData.nodes);
          hasNextPage = projectsData.pageInfo?.hasNextPage || false;
          after = projectsData.pageInfo?.endCursor || null;

          logger.debug('Fetched project batch', {
            batchSize: projectsData.nodes.length,
            totalProjects: allProjects.length,
            hasNextPage
          });
        } else {
          logger.warn('No projects data in response', { 
            hasNodes: !!projectsData?.nodes,
            dataKeys: Object.keys((result as any)?.data || {})
          });
          hasNextPage = false;
        }
      }

      logger.info('Successfully fetched all simple projects', {
        totalProjects: allProjects.length
      });

      return allProjects;
    } catch (error: unknown) {
      logger.error('Error fetching simple projects from GitLab', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        projectsFetchedBeforeError: allProjects.length
      });
      throw error;
    }
  }

  /**
   * Fetch comprehensive project data using parallel category queries
   * Uses Promise.allSettled to ensure individual query failures don't stop the sync
   * 
   * @param projectIds - Array of GitLab project IDs
   * @returns Merged project data from all successful category queries
   */
  async fetchProjectData(projectIds: number[]): Promise<any> {
    logger.debug('Fetching comprehensive project data', {
      projectCount: projectIds.length,
      projectIds
    });

    // Convert numeric IDs to GitLab global IDs
    const gitlabIds = projectIds.map(id => `gid://gitlab/Project/${id}`);

    try {
      // Execute all category queries in parallel with Promise.allSettled
      // This ensures one failure doesn't stop other queries
      const results = await Promise.allSettled([
        this.executeCategory('CORE_DATA', gitlabApiClient.executeQuery(GITLAB_PROJECT_QUERIES.CORE_DATA, { ids: gitlabIds })),
        this.executeCategory('MEMBERS', gitlabApiClient.executeQuery(GITLAB_PROJECT_QUERIES.MEMBERS, { ids: gitlabIds })),
        this.executeCategory('STATISTICS', gitlabApiClient.executeQuery(GITLAB_PROJECT_QUERIES.STATISTICS, { ids: gitlabIds })),
        this.executeCategory('REPOSITORY', gitlabApiClient.executeQuery(GITLAB_PROJECT_QUERIES.REPOSITORY, { ids: gitlabIds })),
        this.executeCategory('CICD_SETTINGS', gitlabApiClient.executeQuery(GITLAB_PROJECT_QUERIES.CICD_SETTINGS, { ids: gitlabIds })),
        this.executeCategory('CONTAINER_REGISTRY', gitlabApiClient.executeQuery(GITLAB_PROJECT_QUERIES.CONTAINER_REGISTRY, { ids: gitlabIds })),
        this.executeCategory('RELEASES', gitlabApiClient.executeQuery(GITLAB_PROJECT_QUERIES.RELEASES, { ids: gitlabIds })),
        this.executeCategory('MR_SETTINGS', gitlabApiClient.executeQuery(GITLAB_PROJECT_QUERIES.MR_SETTINGS, { ids: gitlabIds }))
      ]);

      // Extract results and handle failures
      const [
        coreDataResults,
        membersResults,
        statisticsResults,
        repositoryResults,
        cicdSettingsResults,
        containerRegistryResults,
        releasesResults,
        mrSettingsResults
      ] = results.map((result, index) => {
        if (result.status === 'rejected') {
          const categoryName = this.getCategoryName(index);
          logger.error(`Failed to fetch ${categoryName} data for projects`, {
            error: result.reason instanceof Error ? result.reason.message : 'Unknown error',
            category: categoryName,
            projectIds
          });
          return null;
        }
        return result.value;
      });

      // Merge all category results into complete project data
      const mergedData = this.mergeCompleteProjectData(
        coreDataResults,
        membersResults,
        statisticsResults,
        repositoryResults,
        cicdSettingsResults,
        containerRegistryResults,
        releasesResults,
        mrSettingsResults
      );

      logger.debug('Successfully merged project data from categories', {
        projectCount: projectIds.length,
        successfulCategories: results.filter(r => r.status === 'fulfilled').length,
        failedCategories: results.filter(r => r.status === 'rejected').length
      });

      return mergedData;
    } catch (error: unknown) {
      logger.error('Error fetching project data', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        projectIds
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
      'MEMBERS',
      'STATISTICS',
      'REPOSITORY',
      'CICD_SETTINGS',
      'CONTAINER_REGISTRY',
      'RELEASES',
      'MR_SETTINGS'
    ];
    return categories[index] || `Unknown_${index}`;
  }

  /**
   * Merge all category results into complete project data
   * Handles null/undefined results gracefully from failed queries
   * @private
   */
  private mergeCompleteProjectData(
    coreData: any,
    members: any,
    statistics: any,
    repository: any,
    cicdSettings: any,
    containerRegistry: any,
    releases: any,
    mrSettings: any
  ): any {
    logger.debug('Merging project data from all categories');

    // Extract project arrays from each category
    const coreProjects = coreData?.data?.projects?.nodes || [];
    const memberProjects = members?.data?.projects?.nodes || [];
    const statisticsProjects = statistics?.data?.projects?.nodes || [];
    const repositoryProjects = repository?.data?.projects?.nodes || [];
    const cicdProjects = cicdSettings?.data?.projects?.nodes || [];
    const containerProjects = containerRegistry?.data?.projects?.nodes || [];
    const releaseProjects = releases?.data?.projects?.nodes || [];
    const mrSettingsProjects = mrSettings?.data?.projects?.nodes || [];

    // Use core data as base and merge additional data
    const mergedProjects = coreProjects.map((coreProject: any) => {
      const projectId = coreProject.id;

      // Find matching data from other categories
      const memberData = memberProjects.find((p: any) => p.id === projectId);
      const statsData = statisticsProjects.find((p: any) => p.id === projectId);
      const repoData = repositoryProjects.find((p: any) => p.id === projectId);
      const cicdData = cicdProjects.find((p: any) => p.id === projectId);
      const containerData = containerProjects.find((p: any) => p.id === projectId);
      const releaseData = releaseProjects.find((p: any) => p.id === projectId);
      const mrSettingsData = mrSettingsProjects.find((p: any) => p.id === projectId);

      // Merge all data into one project object
      return {
        ...coreProject,
        projectMembers: memberData?.projectMembers || null,
        statistics: statsData?.statistics || null,
        issuesCount: statsData?.issuesCount?.count || 0,
        openIssuesCount: statsData?.openIssuesCount?.count || 0,
        mergeRequestsCount: statsData?.mergeRequestsCount?.count || 0,
        openMergeRequestsCount: statsData?.openMergeRequestsCount?.count || 0,
        repository: repoData?.repository || null,
        languages: repoData?.languages || [],
        ciConfigPath: cicdData?.ciConfigPath || null,
        ciCdSettings: cicdData?.ciCdSettings || null,
        runners: cicdData?.runners || null,
        containerRegistryEnabled: containerData?.containerRegistryEnabled || false,
        containerExpirationPolicy: containerData?.containerExpirationPolicy || null,
        containerRepositories: containerData?.containerRepositories || null,
        releases: releaseData?.releases || null,
        approvalRules: mrSettingsData?.approvalRules || null,
        // MR Settings are already in core data, but we can override with more detailed data
        allowMergeOnSkippedPipeline: mrSettingsData?.allowMergeOnSkippedPipeline ?? coreProject.allowMergeOnSkippedPipeline,
        mergeCommitTemplate: mrSettingsData?.mergeCommitTemplate ?? coreProject.mergeCommitTemplate,
        squashCommitTemplate: mrSettingsData?.squashCommitTemplate ?? coreProject.squashCommitTemplate
      };
    });

    logger.debug('Project data merge complete', {
      projectCount: mergedProjects.length
    });

    return {
      data: {
        projects: mergedProjects
      }
    };
  }
}

export const gitlabProjectProcessor = new GitlabProjectProcessor();

