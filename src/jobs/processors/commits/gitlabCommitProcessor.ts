import { logger } from '../../../utils/logger';
import { gitlabApiClient } from '../../../utils/gitlabApiClient';
import { GITLAB_COMMIT_QUERIES } from '../../../graphql/types/commit/gitlabCommitQueries';

export class GitlabCommitProcessor {
  async fetchSimpleCommits(batchSize: number = 100, projectPath?: string): Promise<any[]> {
    if (!projectPath) {
      logger.warn('Project path required for commit sync');
      return [];
    }

    logger.info('Fetching simple commits from GitLab', { projectPath });

    try {
      const result = await gitlabApiClient.executeQuery(GITLAB_COMMIT_QUERIES.SIMPLE_LIST, {
        first: batchSize,
        after: null,
        projectPath
      });

      const lastCommit = (result as any)?.data?.project?.repository?.tree?.lastCommit;
      if (lastCommit) {
        // Add projectPath for later use
        return [{
          ...lastCommit,
          projectPath
        }];
      }

      logger.info('No commits found', { projectPath });
      return [];
    } catch (error: unknown) {
      logger.error('Error fetching simple commits from GitLab', {
        error: error instanceof Error ? error.message : 'Unknown error',
        projectPath
      });
      throw error;
    }
  }

  async fetchCommitData(ids: number[], projectPath?: string, sha?: string): Promise<any> {
    if (!projectPath || !sha) {
      logger.error('fetchCommitData requires both projectPath and sha parameters');
      return { data: { commits: [] } };
    }

    logger.debug('Fetching comprehensive commit data', { projectPath, sha });

    try {
      const results = await Promise.allSettled([
        gitlabApiClient.executeQuery(GITLAB_COMMIT_QUERIES.CORE_DATA, { projectPath, sha }),
        gitlabApiClient.executeQuery(GITLAB_COMMIT_QUERIES.DIFF_STATS, { projectPath, sha }),
        gitlabApiClient.executeQuery(GITLAB_COMMIT_QUERIES.REFERENCES, { projectPath, sha }),
        gitlabApiClient.executeQuery(GITLAB_COMMIT_QUERIES.SIGNATURES, { projectPath, sha })
      ]);

      const [core, diffStats, references, signatures] = results.map((r, index) => {
        if (r.status === 'rejected') {
          logger.error(`Failed to fetch commit category ${index}`, {
            error: r.reason instanceof Error ? r.reason.message : 'Unknown error',
            projectPath,
            sha
          });
          return null;
        }
        return r.value;
      });

      // Extract single commit from each category
      const coreCommit = core?.data?.project?.repository?.commit || null;
      const statsData = diffStats?.data?.project?.repository?.commit || null;
      const refsData = references?.data?.project?.repository?.commit || null;
      const sigData = signatures?.data?.project?.repository?.commit || null;

      if (!coreCommit) {
        logger.warn('No core commit data available', { projectPath, sha });
        return { data: { commits: [] } };
      }

      // Merge all data
      const merged = {
        ...coreCommit,
        stats: statsData?.stats || null,
        pipelines: refsData?.pipelines || { nodes: [] },
        signature: sigData?.signature || null
      };

      logger.debug('Successfully merged commit data', { projectPath, sha });

      return { data: { commits: [merged] } };
    } catch (error: unknown) {
      logger.error('Error fetching commit data', {
        error: error instanceof Error ? error.message : 'Unknown error',
        projectPath,
        sha
      });
      throw error;
    }
  }
}

export const gitlabCommitProcessor = new GitlabCommitProcessor();

