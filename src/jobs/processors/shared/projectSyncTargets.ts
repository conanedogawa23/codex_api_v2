import { SyncOptions } from '../base/baseSyncProcessor';
import { Project } from '../../../models/Project';
import { logger } from '../../../utils/logger';

export interface ProjectScopedSyncOptions extends SyncOptions {
  projectPath?: string;
  projectOffset?: number;
  projectLimit?: number;
  projectBatchSize?: number;
  projectConcurrency?: number;
}

export interface SyncProjectTarget {
  gitlabId: number;
  pathWithNamespace: string;
  name?: string;
}

function normalizePositiveInteger(value: unknown, fallback: number, max?: number): number {
  const numericValue = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return fallback;
  }

  const normalized = Math.floor(numericValue);
  return max ? Math.min(normalized, max) : normalized;
}

function normalizeNonNegativeInteger(value: unknown, fallback: number): number {
  const numericValue = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numericValue) || numericValue < 0) {
    return fallback;
  }

  return Math.floor(numericValue);
}

async function fetchProjectBatch(offset: number, limit: number): Promise<SyncProjectTarget[]> {
  return Project.find({
    isActive: true,
    pathWithNamespace: { $exists: true, $ne: '' },
  })
    .sort({ gitlabId: 1, _id: 1 })
    .skip(offset)
    .limit(limit)
    .select('gitlabId pathWithNamespace name')
    .lean();
}

export async function fetchAcrossActiveProjects<T>(
  label: string,
  options: ProjectScopedSyncOptions,
  fetchForProject: (project: SyncProjectTarget) => Promise<T[]>
): Promise<T[]> {
  const projectOffset = normalizeNonNegativeInteger(options.projectOffset, 0);
  const projectBatchSize = normalizePositiveInteger(options.projectBatchSize, 25, 100);
  const projectConcurrency = normalizePositiveInteger(options.projectConcurrency, 5, 10);
  const projectLimit =
    options.projectLimit === undefined
      ? undefined
      : normalizePositiveInteger(options.projectLimit, projectBatchSize);

  const allItems: T[] = [];
  let offset = projectOffset;
  let projectsProcessed = 0;

  while (true) {
    const remaining = projectLimit === undefined ? projectBatchSize : projectLimit - projectsProcessed;
    if (remaining <= 0) {
      break;
    }

    const currentBatchSize = Math.min(projectBatchSize, remaining);
    const projects = await fetchProjectBatch(offset, currentBatchSize);
    if (projects.length === 0) {
      break;
    }

    logger.info(`Fetching ${label} from active project batch`, {
      projectOffset: offset,
      projectBatchSize: projects.length,
      projectConcurrency,
      projectsProcessed,
      projectLimit: projectLimit ?? 'all',
    });

    for (let chunkStart = 0; chunkStart < projects.length; chunkStart += projectConcurrency) {
      const projectChunk = projects.slice(chunkStart, chunkStart + projectConcurrency);
      const chunkResults = await Promise.all(
        projectChunk.map(async (project) => {
          try {
            return {
              project,
              items: await fetchForProject(project),
              error: null,
            };
          } catch (error: unknown) {
            return {
              project,
              items: [] as T[],
              error,
            };
          }
        })
      );

      for (const result of chunkResults) {
        if (!result.error) {
          allItems.push(...result.items);
          continue;
        }

        logger.warn(`Failed to fetch ${label} for project chunk item`, {
          projectId: result.project.gitlabId,
          projectPath: result.project.pathWithNamespace,
          error: result.error instanceof Error ? result.error.message : 'Unknown error',
        });
      }
    }

    projectsProcessed += projects.length;
    offset += projects.length;

    if (projects.length < currentBatchSize) {
      break;
    }
  }

  logger.info(`Completed ${label} fetch across active projects`, {
    projectOffset,
    projectLimit: projectLimit ?? 'all',
    projectsProcessed,
    totalItems: allItems.length,
  });

  return allItems;
}
