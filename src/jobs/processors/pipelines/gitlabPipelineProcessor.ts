import { logger } from '../../../utils/logger';
import { gitlabApiClient } from '../../../utils/gitlabApiClient';
import { GITLAB_PIPELINE_QUERIES } from '../../../graphql/types/pipeline/gitlabPipelineQueries';

export class GitlabPipelineProcessor {
  async fetchSimplePipelines(batchSize: number = 100, projectPath?: string): Promise<any[]> {
    if (!projectPath) {
      logger.warn('Project path required for pipeline sync');
      return [];
    }

    logger.info('Fetching simple pipelines from GitLab', { batchSize, projectPath });
    const allPipelines: any[] = [];
    let hasNextPage = true;
    let after: string | null = null;

    try {
      while (hasNextPage) {
        const result = await gitlabApiClient.executeQuery(GITLAB_PIPELINE_QUERIES.SIMPLE_LIST, {
          first: batchSize,
          after,
          projectPath
        });

        const pipelinesData: any = (result as any)?.data?.project?.pipelines;
        if (pipelinesData?.nodes) {
          allPipelines.push(...pipelinesData.nodes);
          hasNextPage = pipelinesData.pageInfo?.hasNextPage || false;
          after = pipelinesData.pageInfo?.endCursor || null;
        } else {
          hasNextPage = false;
        }
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

  async fetchPipelineData(pipelineIds: number[]): Promise<any> {
    const gitlabIds = pipelineIds.map(id => `gid://gitlab/Ci::Pipeline/${id}`);

    try {
      const results = await Promise.allSettled([
        gitlabApiClient.executeQuery(GITLAB_PIPELINE_QUERIES.CORE_DATA, { ids: gitlabIds }),
        gitlabApiClient.executeQuery(GITLAB_PIPELINE_QUERIES.JOBS, { ids: gitlabIds }),
        gitlabApiClient.executeQuery(GITLAB_PIPELINE_QUERIES.TEST_REPORTS, { ids: gitlabIds }),
        gitlabApiClient.executeQuery(GITLAB_PIPELINE_QUERIES.VARIABLES, { ids: gitlabIds }),
        gitlabApiClient.executeQuery(GITLAB_PIPELINE_QUERIES.ARTIFACTS, { ids: gitlabIds })
      ]);

      const [coreData, jobs, testReports, variables, artifacts] = results.map((result, index) => {
        if (result.status === 'rejected') {
          logger.error(`Failed to fetch pipeline category ${index}`, { error: result.reason });
          return null;
        }
        return result.value;
      });

      const corePipelines = coreData?.data?.ciPipelines?.nodes || [];
      const jobsPipelines = jobs?.data?.ciPipelines?.nodes || [];
      const testPipelines = testReports?.data?.ciPipelines?.nodes || [];
      const varsPipelines = variables?.data?.ciPipelines?.nodes || [];
      const artifactsPipelines = artifacts?.data?.ciPipelines?.nodes || [];

      const mergedPipelines = corePipelines.map((pipeline: any) => ({
        ...pipeline,
        jobs: jobsPipelines.find((p: any) => p.id === pipeline.id)?.jobs || { nodes: [], count: 0 },
        testReportSummary: testPipelines.find((p: any) => p.id === pipeline.id)?.testReportSummary || null,
        variables: varsPipelines.find((p: any) => p.id === pipeline.id)?.variables || { nodes: [] },
        artifacts: artifactsPipelines.find((p: any) => p.id === pipeline.id)?.jobs?.nodes?.flatMap((j: any) => j.artifacts?.nodes || []) || []
      }));

      return { data: { pipelines: mergedPipelines } };
    } catch (error: unknown) {
      logger.error('Error fetching pipeline data', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }
}

export const gitlabPipelineProcessor = new GitlabPipelineProcessor();

