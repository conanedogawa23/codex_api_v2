import { logger } from '../../../utils/logger';
import { gitlabApi } from '../../../utils/gitlabApi';

export class GitlabPipelineProcessor {
  async fetchSimplePipelines(batchSize: number = 100, projectPath?: string): Promise<any[]> {
    if (!projectPath) {
      logger.warn('Project path required for pipeline sync');
      return [];
    }

    logger.info('Fetching simple pipelines from GitLab', { batchSize, projectPath });
    const allPipelines: any[] = [];
    let page = 1;
    const perPage = Math.max(1, Math.min(batchSize, 100));

    try {
      while (true) {
        const pipelines = await gitlabApi.listProjectPipelines(projectPath, page, perPage);
        if (pipelines.length === 0) {
          break;
        }

        allPipelines.push(
          ...pipelines.map((pipeline) => ({
            ...pipeline,
            projectPath,
          }))
        );

        if (pipelines.length < perPage) {
          break;
        }

        page += 1;
      }

      logger.info('Successfully fetched all simple pipelines', { totalPipelines: allPipelines.length });
      return allPipelines;
    } catch (error: unknown) {
      logger.error('Error fetching simple pipelines from GitLab', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async fetchPipelineData(pipelineIds: number[], projectPath?: string, iid?: number): Promise<any> {
    const pipelineId = pipelineIds[0];
    if (!projectPath || !pipelineId) {
      logger.error('fetchPipelineData requires both projectPath and pipelineId parameters');
      return { data: { pipelines: [] } };
    }

    logger.debug('Fetching comprehensive pipeline data', { projectPath, pipelineId });

    try {
      const pipeline = await gitlabApi.getProjectPipeline(projectPath, pipelineId);
      logger.debug('Successfully fetched pipeline data', { projectPath, pipelineId });
      return { data: { pipelines: [{ ...pipeline, projectPath }] } };
    } catch (error: unknown) {
      logger.error('Error fetching pipeline data', {
        error: error instanceof Error ? error.message : 'Unknown error',
        projectPath,
        pipelineId
      });
      throw error;
    }
  }
}

export const gitlabPipelineProcessor = new GitlabPipelineProcessor();

