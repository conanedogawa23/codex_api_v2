import mongoose from 'mongoose';
import { ProjectSprintRepoMapping } from '../models/ProjectSprintRepoMapping';

export interface UniqueSprintRepoProjectMapping {
  projectId: string;
  sprintRepoId: string;
}

function getUniqueStringIds(ids: string[]): string[] {
  return Array.from(new Set(
    ids
      .map((id) => String(id ?? '').trim())
      .filter((id) => id.length > 0)
  ));
}

export function buildMixedIdValues(ids: string[]): Array<string | mongoose.Types.ObjectId> {
  const values: Array<string | mongoose.Types.ObjectId> = [];

  for (const id of getUniqueStringIds(ids)) {
    values.push(id);

    if (mongoose.Types.ObjectId.isValid(id)) {
      values.push(new mongoose.Types.ObjectId(id));
    }
  }

  return values;
}

export function buildTaskScopeFilter(
  projectIds: string[],
  sprintRepoIds: string[]
): Record<string, unknown> {
  const conditions: Record<string, unknown>[] = [];
  const projectValues = buildMixedIdValues(projectIds);
  const sprintRepoValues = buildMixedIdValues(sprintRepoIds);

  if (projectValues.length > 0) {
    conditions.push({
      projectId: { $in: projectValues },
    });
  }

  if (sprintRepoValues.length > 0) {
    conditions.push({
      sprintRepoId: { $in: sprintRepoValues },
    });
  }

  if (conditions.length === 0) {
    return { _id: { $in: [] } };
  }

  return conditions.length === 1 ? conditions[0] : { $or: conditions };
}

export async function getUniqueSprintRepoProjectMappings(
  projectIds: string[]
): Promise<UniqueSprintRepoProjectMapping[]> {
  const normalizedProjectIds = getUniqueStringIds(projectIds);

  if (normalizedProjectIds.length === 0) {
    return [];
  }

  const mappings = await ProjectSprintRepoMapping.aggregate([
    {
      $match: {
        isActive: true,
      },
    },
    {
      $group: {
        _id: '$sprintRepoId',
        projectIds: { $addToSet: '$projectId' },
      },
    },
    {
      $match: {
        $expr: {
          $eq: [{ $size: '$projectIds' }, 1],
        },
      },
    },
    {
      $project: {
        _id: 0,
        sprintRepoId: { $toString: '$_id' },
        projectId: { $arrayElemAt: ['$projectIds', 0] },
      },
    },
    {
      $match: {
        projectId: { $in: normalizedProjectIds },
      },
    },
  ]);

  return mappings.map((mapping: UniqueSprintRepoProjectMapping) => ({
    projectId: String(mapping.projectId),
    sprintRepoId: String(mapping.sprintRepoId),
  }));
}

export async function getUniquelyMappedSprintRepoIds(projectIds: string[]): Promise<string[]> {
  const mappings = await getUniqueSprintRepoProjectMappings(projectIds);
  return mappings.map((mapping) => mapping.sprintRepoId);
}

/**
 * All sprint repo IDs linked to the given Codex projects via active mappings
 * (not restricted to globally one-to-one project/repo pairs).
 */
export async function getActiveSprintRepoIdsForProjects(projectIds: string[]): Promise<string[]> {
  const normalizedProjectIds = getUniqueStringIds(projectIds);
  if (normalizedProjectIds.length === 0) {
    return [];
  }

  const projectValues = buildMixedIdValues(normalizedProjectIds);
  const docs = await ProjectSprintRepoMapping.find({
    isActive: true,
    projectId: { $in: projectValues },
  })
    .select('sprintRepoId')
    .lean();

  const ids = new Set<string>();
  for (const doc of docs) {
    const sid = (doc as { sprintRepoId?: unknown }).sprintRepoId;
    if (sid != null) {
      ids.add(typeof sid === 'string' ? sid : String(sid));
    }
  }
  return Array.from(ids);
}
