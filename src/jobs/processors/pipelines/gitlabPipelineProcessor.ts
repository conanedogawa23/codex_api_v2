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
          // Add projectPath to each pipeline for later use
          const pipelinesWithPath = pipelinesData.nodes.map((p: any) => ({
            ...p,
            projectPath
          }));
          allPipelines.push(...pipelinesWithPath);
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

  async fetchPipelineData(pipelineIds: number[], projectPath?: string, iid?: number): Promise<any> {
    if (!projectPath || !iid) {
      logger.error('fetchPipelineData requires both projectPath and iid parameters');
      return { data: { pipelines: [] } };
    }

    logger.debug('Fetching comprehensive pipeline data', { projectPath, iid });

    try {
      const results = await Promise.allSettled([
        gitlabApiClient.executeQuery(GITLAB_PIPELINE_QUERIES.CORE_DATA, { projectPath, iid: String(iid) }),
        gitlabApiClient.executeQuery(GITLAB_PIPELINE_QUERIES.JOBS, { projectPath, iid: String(iid) }),
        gitlabApiClient.executeQuery(GITLAB_PIPELINE_QUERIES.TEST_REPORTS, { projectPath, iid: String(iid) }),
        gitlabApiClient.executeQuery(GITLAB_PIPELINE_QUERIES.VARIABLES, { projectPath, iid: String(iid) }),
        gitlabApiClient.executeQuery(GITLAB_PIPELINE_QUERIES.ARTIFACTS, { projectPath, iid: String(iid) })
      ]);

      const [coreData, jobs, testReports, variables, artifacts] = results.map((result, index) => {
        if (result.status === 'rejected') {
          logger.error(`Failed to fetch pipeline category ${index}`, { 
            error: result.reason instanceof Error ? result.reason.message : 'Unknown error',
            projectPath,
            iid
          });
          return null;
        }
        return result.value;
      });

      // Extract single pipeline from each category
      const corePipeline = coreData?.data?.project?.pipeline || null;
      const jobsData = jobs?.data?.project?.pipeline || null;
      const testData = testReports?.data?.project?.pipeline || null;
      const varsData = variables?.data?.project?.pipeline || null;
      const artifactsData = artifacts?.data?.project?.pipeline || null;

      if (!corePipeline) {
        logger.warn('No core pipeline data available', { projectPath, iid });
        return { data: { pipelines: [] } };
      }

      // Merge all data into one pipeline object
      const mergedPipeline = {
        ...corePipeline,
        jobs: jobsData?.jobs || { nodes: [], count: 0 },
        testReportSummary: testData?.testReportSummary || null,
        variables: varsData?.variables || { nodes: [] },
        artifacts: artifactsData?.jobs?.nodes?.flatMap((j: any) => j.artifacts?.nodes || []) || []
      };

      logger.debug('Successfully merged pipeline data', { projectPath, iid });

      return { data: { pipelines: [mergedPipeline] } };
    } catch (error: unknown) {
      logger.error('Error fetching pipeline data', {
        error: error instanceof Error ? error.message : 'Unknown error',
        projectPath,
        iid
      });
      throw error;
    }
  }
}

export const gitlabPipelineProcessor = new GitlabPipelineProcessor();

