import { logger } from '../../../utils/logger';
import { Project } from '../../../models/Project';
import { gitlabApi } from '../../../utils/gitlabApi';

export class GitlabCommitProcessor {
  private async resolveProjectGitlabId(projectPath: string): Promise<number | undefined> {
    const existingProject = await Project.findOne({ pathWithNamespace: projectPath })
      .select('gitlabId')
      .lean();

    if (existingProject?.gitlabId) {
      return existingProject.gitlabId;
    }

    try {
      const gitlabProject = await gitlabApi.getProject(projectPath);
      return gitlabProject.id;
    } catch (error: unknown) {
      logger.warn('Unable to resolve project GitLab ID for commit sync', {
        projectPath,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return undefined;
    }
  }

  async fetchSimpleCommits(
    batchSize: number = 100,
    projectPath?: string,
    projectGitlabId?: number
  ): Promise<any[]> {
    if (!projectPath) {
      logger.warn('Project path required for commit sync');
      return [];
    }

    logger.info('Fetching simple commits from GitLab', { projectPath, batchSize });

    try {
      const resolvedProjectGitlabId = projectGitlabId ?? await this.resolveProjectGitlabId(projectPath);
      const perPage = Math.max(1, Math.min(batchSize, 100));
      const allCommits: any[] = [];
      let page = 1;

      while (true) {
        const commits = await gitlabApi.listProjectCommits(projectPath, page, perPage);
        if (commits.length === 0) {
          break;
        }

        allCommits.push(
          ...commits.map((commit) => ({
            ...commit,
            sha: commit.id,
            shortId: commit.short_id,
            projectPath,
            projectId: resolvedProjectGitlabId ? String(resolvedProjectGitlabId) : undefined,
          }))
        );

        if (commits.length < perPage) {
          break;
        }

        page += 1;
      }

      if (allCommits.length === 0) {
        logger.info('No commits found', { projectPath });
      }

      return allCommits;
    } catch (error: unknown) {
      logger.error('Error fetching simple commits from GitLab', {
        error: error instanceof Error ? error.message : 'Unknown error',
        projectPath
      });
      throw error;
    }
  }

  async fetchCommitData(ids: number[], projectPath?: string, sha?: string): Promise<any> {
    logger.debug('Commit sync uses REST list payloads as the source of truth', {
      idsCount: ids.length,
      projectPath,
      sha,
    });
    return { data: { commits: [] } };
  }
}

export const gitlabCommitProcessor = new GitlabCommitProcessor();

