import { logger } from '../../../utils/logger';
import { gitlabApiClient } from '../../../utils/gitlabApiClient';
import { GITLAB_NAMESPACE_QUERIES } from '../../../graphql/types/namespace/gitlabNamespaceQueries';

export class GitlabNamespaceProcessor {
  async fetchSimpleNamespaces(batchSize: number = 100): Promise<any[]> {
    logger.info('Fetching simple namespaces (groups) from GitLab', { batchSize });
    const allNamespaces: any[] = [];
    let hasNextPage = true;
    let after: string | null = null;

    try {
      while (hasNextPage) {
        const result = await gitlabApiClient.executeQuery(GITLAB_NAMESPACE_QUERIES.SIMPLE_LIST, {
          first: batchSize,
          after
        });

        const groupsData: any = (result as any)?.data?.groups;
        if (groupsData?.nodes) {
          allNamespaces.push(...groupsData.nodes);
          hasNextPage = groupsData.pageInfo?.hasNextPage || false;
          after = groupsData.pageInfo?.endCursor || null;
          logger.debug('Fetched namespace batch', { batchSize: groupsData.nodes.length });
        } else {
          logger.warn('No groups data in response', {
            hasNodes: !!groupsData?.nodes,
            dataKeys: Object.keys((result as any)?.data || {})
          });
          hasNextPage = false;
        }
      }

      logger.info('Successfully fetched all simple namespaces', { totalNamespaces: allNamespaces.length });
      return allNamespaces;
    } catch (error: unknown) {
      logger.error('Error fetching simple namespaces from GitLab', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async fetchNamespaceData(namespaceIds: number[], fullPath?: string): Promise<any> {
    if (namespaceIds.length === 0 && !fullPath) {
      logger.warn('fetchNamespaceData called with no IDs or fullPath');
      return { data: { namespaces: [] } };
    }

    // Use fullPath if provided, otherwise this won't work properly
    // The base processor should pass fullPath in the entity data
    if (!fullPath) {
      logger.error('fetchNamespaceData requires fullPath parameter for group queries');
      return { data: { namespaces: [] } };
    }

    logger.debug('Fetching comprehensive namespace data', { fullPath });

    try {
      const results = await Promise.allSettled([
        gitlabApiClient.executeQuery(GITLAB_NAMESPACE_QUERIES.CORE_DATA, { fullPath }),
        gitlabApiClient.executeQuery(GITLAB_NAMESPACE_QUERIES.PROJECTS, { fullPath }),
        gitlabApiClient.executeQuery(GITLAB_NAMESPACE_QUERIES.GROUPS, { fullPath }),
        gitlabApiClient.executeQuery(GITLAB_NAMESPACE_QUERIES.STATISTICS, { fullPath })
      ]);

      const [coreData, projects, groups, statistics] = results.map((result, index) => {
        if (result.status === 'rejected') {
          logger.error(`Failed to fetch namespace category ${index}`, { 
            error: result.reason instanceof Error ? result.reason.message : 'Unknown error',
            fullPath 
          });
          return null;
        }
        return result.value;
      });

      // Extract single group from each category response
      const coreGroup = coreData?.data?.group || null;
      const projectsData = projects?.data?.group || null;
      const groupsData = groups?.data?.group || null;
      const statsData = statistics?.data?.group || null;

      if (!coreGroup) {
        logger.warn('No core group data available', { fullPath });
        return { data: { namespaces: [] } };
      }

      // Merge all data into one namespace object
      const mergedNamespace = {
        ...coreGroup,
        projects: projectsData?.projects || { nodes: [], count: 0 },
        groups: groupsData?.descendantGroups || { nodes: [], count: 0 },
        statistics: statsData?.rootStorageStatistics || null
      };

      logger.debug('Successfully merged namespace data', { fullPath });

      return { data: { namespaces: [mergedNamespace] } };
    } catch (error: unknown) {
      logger.error('Error fetching namespace data', {
        error: error instanceof Error ? error.message : 'Unknown error',
        fullPath
      });
      throw error;
    }
  }
}

export const gitlabNamespaceProcessor = new GitlabNamespaceProcessor();

