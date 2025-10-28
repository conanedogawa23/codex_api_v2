import { logger } from '../../../utils/logger';
import { gitlabApiClient } from '../../../utils/gitlabApiClient';
import { GITLAB_NAMESPACE_QUERIES } from '../../../graphql/types/namespace/gitlabNamespaceQueries';

export class GitlabNamespaceProcessor {
  async fetchSimpleNamespaces(batchSize: number = 100): Promise<any[]> {
    logger.info('Fetching simple namespaces from GitLab', { batchSize });
    const allNamespaces: any[] = [];
    let hasNextPage = true;
    let after: string | null = null;

    try {
      while (hasNextPage) {
        const result = await gitlabApiClient.executeQuery(GITLAB_NAMESPACE_QUERIES.SIMPLE_LIST, {
          first: batchSize,
          after
        });

        const namespacesData: any = (result as any)?.data?.namespaces;
        if (namespacesData?.nodes) {
          allNamespaces.push(...namespacesData.nodes);
          hasNextPage = namespacesData.pageInfo?.hasNextPage || false;
          after = namespacesData.pageInfo?.endCursor || null;
          logger.debug('Fetched namespace batch', { batchSize: namespacesData.nodes.length });
        } else {
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

  async fetchNamespaceData(namespaceIds: number[]): Promise<any> {
    const gitlabIds = namespaceIds.map(id => `gid://gitlab/Namespace/${id}`);

    try {
      const results = await Promise.allSettled([
        gitlabApiClient.executeQuery(GITLAB_NAMESPACE_QUERIES.CORE_DATA, { ids: gitlabIds }),
        gitlabApiClient.executeQuery(GITLAB_NAMESPACE_QUERIES.PROJECTS, { ids: gitlabIds }),
        gitlabApiClient.executeQuery(GITLAB_NAMESPACE_QUERIES.GROUPS, { ids: gitlabIds }),
        gitlabApiClient.executeQuery(GITLAB_NAMESPACE_QUERIES.STATISTICS, { ids: gitlabIds })
      ]);

      const [coreData, projects, groups, statistics] = results.map((result, index) => {
        if (result.status === 'rejected') {
          logger.error(`Failed to fetch namespace category ${index}`, { error: result.reason });
          return null;
        }
        return result.value;
      });

      const coreNamespaces = coreData?.data?.namespaces?.nodes || [];
      const projectsNamespaces = projects?.data?.namespaces?.nodes || [];
      const groupsNamespaces = groups?.data?.namespaces?.nodes || [];
      const statsNamespaces = statistics?.data?.namespaces?.nodes || [];

      const mergedNamespaces = coreNamespaces.map((ns: any) => ({
        ...ns,
        projects: projectsNamespaces.find((p: any) => p.id === ns.id)?.projects || { nodes: [], count: 0 },
        groups: groupsNamespaces.find((g: any) => g.id === ns.id)?.descendantGroups || { nodes: [], count: 0 },
        statistics: statsNamespaces.find((s: any) => s.id === ns.id)?.rootStorageStatistics || null
      }));

      return { data: { namespaces: mergedNamespaces } };
    } catch (error: unknown) {
      logger.error('Error fetching namespace data', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }
}

export const gitlabNamespaceProcessor = new GitlabNamespaceProcessor();

