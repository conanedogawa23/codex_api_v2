import { logger } from '../../../utils/logger';
import { gitlabApiClient } from '../../../utils/gitlabApiClient';
import { GITLAB_COMMIT_QUERIES } from '../../../graphql/types/commit/gitlabCommitQueries';

export class GitlabCommitProcessor {
  async fetchCommitData(ids: number[]): Promise<any> {
    const gitlabIds = ids.map(id => `gid://gitlab/Commit/${id}`);
    try {
      const results = await Promise.allSettled([
        gitlabApiClient.executeQuery(GITLAB_COMMIT_QUERIES.CORE_DATA, { ids: gitlabIds }),
        gitlabApiClient.executeQuery(GITLAB_COMMIT_QUERIES.DIFF_STATS, { ids: gitlabIds }),
        gitlabApiClient.executeQuery(GITLAB_COMMIT_QUERIES.REFERENCES, { ids: gitlabIds }),
        gitlabApiClient.executeQuery(GITLAB_COMMIT_QUERIES.SIGNATURES, { ids: gitlabIds })
      ]);

      const [core, diffStats, references, signatures] = results.map((r) => r.status === 'fulfilled' ? r.value : null);
      const coreCommits = core?.data?.commits?.nodes || [];
      const merged = coreCommits.map((c: any) => ({
        ...c,
        stats: diffStats?.data?.commits?.nodes?.find((d: any) => d.id === c.id)?.stats || null,
        pipelines: references?.data?.commits?.nodes?.find((r: any) => r.id === c.id)?.pipelines || { nodes: [] },
        signature: signatures?.data?.commits?.nodes?.find((s: any) => s.id === c.id)?.signature || null
      }));
      return { data: { commits: merged } };
    } catch (error: unknown) {
      logger.error('Error fetching commit data', { error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  }
}

export const gitlabCommitProcessor = new GitlabCommitProcessor();

