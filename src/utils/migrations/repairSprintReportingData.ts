import 'dotenv/config';
import 'reflect-metadata';

import mongoose from 'mongoose';

type ScriptOptions = {
  apply: boolean;
  databaseName: string;
};

type ProjectDocument = {
  _id: mongoose.Types.ObjectId;
  name?: string;
  progress?: number;
  tasks?: {
    total?: number;
    completed?: number;
    inProgress?: number;
    pending?: number;
  };
};

type SprintRepoDocument = {
  _id: mongoose.Types.ObjectId;
  name?: string;
};

type SprintDocument = {
  _id: mongoose.Types.ObjectId;
  name?: string;
  projectName?: string;
  sprintRepoId?: unknown;
};

type MappingDocument = {
  _id: mongoose.Types.ObjectId;
  projectId?: string;
  sprintRepoId?: unknown;
  isActive?: boolean;
};

type TaskDocument = {
  _id: mongoose.Types.ObjectId;
  title?: string;
  projectId?: unknown;
  sprintRepoId?: unknown;
  status?: string;
  estimatedHours?: number;
  actualHours?: number;
  isActive?: boolean;
};

type MappingCandidate = {
  key: string;
  projectId: string;
  sprintRepoId: string;
  sources: Set<string>;
};

const DEFAULT_DATABASE_NAME = 'codex_api_demo';
const EXACT_TEST_TITLE_KEYS = new Set(['test', 'testtask']);

function parseArgs(): ScriptOptions {
  const args = process.argv.slice(2);

  return {
    apply: args.includes('--apply'),
    databaseName:
      args.find((arg) => arg.startsWith('--database='))?.split('=')[1]?.trim()
      || DEFAULT_DATABASE_NAME,
  };
}

function normalizeName(value?: string | null): string {
  return (value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function toIdString(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmedValue = value.trim();
    return trimmedValue.length > 0 ? trimmedValue : null;
  }

  if (value instanceof mongoose.Types.ObjectId) {
    return value.toString();
  }

  if (value && typeof value === 'object' && typeof (value as { toString?: () => string }).toString === 'function') {
    const stringValue = (value as { toString: () => string }).toString();
    return stringValue && stringValue !== '[object Object]' ? stringValue : null;
  }

  return null;
}

function createTaskSummary() {
  return {
    total: 0,
    completed: 0,
    inProgress: 0,
    pending: 0,
  };
}

function addAlias(aliasMap: Map<string, Set<string>>, sprintRepoId: string, value?: string | null) {
  const normalizedValue = normalizeName(value);
  if (!normalizedValue) {
    return;
  }

  const existingAliases = aliasMap.get(sprintRepoId) || new Set<string>();
  existingAliases.add(normalizedValue);
  aliasMap.set(sprintRepoId, existingAliases);
}

function addCandidate(
  candidates: Map<string, MappingCandidate>,
  projectId: string,
  sprintRepoId: string,
  source: string
) {
  const key = `${projectId}:${sprintRepoId}`;
  const existingCandidate = candidates.get(key);

  if (existingCandidate) {
    existingCandidate.sources.add(source);
    return;
  }

  candidates.set(key, {
    key,
    projectId,
    sprintRepoId,
    sources: new Set([source]),
  });
}

function queueMappingDeactivation(
  mappingOperations: any[],
  mapping: MappingDocument,
  now: Date
) {
  mappingOperations.push({
    updateOne: {
      filter: { _id: mapping._id },
      update: {
        $set: {
          isActive: false,
          updatedAt: now,
        },
      },
    },
  });
}

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is required');
  }

  const options = parseArgs();
  const now = new Date();

  await mongoose.connect(process.env.MONGODB_URI);

  try {
    const client = mongoose.connection.getClient();
    const db = client.db(options.databaseName);

    const projectsCollection = db.collection<ProjectDocument>('projects');
    const sprintReposCollection = db.collection<SprintRepoDocument>('sprintRepos');
    const sprintsCollection = db.collection<SprintDocument>('sprints');
    const mappingsCollection = db.collection<MappingDocument>('project_sprint_repo_mappings');
    const tasksCollection = db.collection<TaskDocument>('tasks');

    const [projects, sprintRepos, sprints, mappings, tasks] = await Promise.all([
      projectsCollection.find({ isActive: true }).project({ name: 1, progress: 1, tasks: 1 }).toArray(),
      sprintReposCollection.find({ isActive: true }).project({ name: 1 }).toArray(),
      sprintsCollection.find({ isActive: true }).project({ name: 1, projectName: 1, sprintRepoId: 1 }).toArray(),
      mappingsCollection.find({}).project({ projectId: 1, sprintRepoId: 1, isActive: 1 }).toArray(),
      tasksCollection.find({ isActive: true }).project({
        title: 1,
        projectId: 1,
        sprintRepoId: 1,
        status: 1,
        estimatedHours: 1,
        actualHours: 1,
      }).toArray(),
    ]);

    const validProjectIds = new Set(projects.map((project) => project._id.toString()));
    const validSprintRepoIds = new Set(sprintRepos.map((sprintRepo) => sprintRepo._id.toString()));
    const projectIdsByNormalizedName = new Map<string, Set<string>>();

    for (const project of projects) {
      const normalizedProjectName = normalizeName(project.name);
      if (!normalizedProjectName) {
        continue;
      }

      const matchingProjectIds = projectIdsByNormalizedName.get(normalizedProjectName) || new Set<string>();
      matchingProjectIds.add(project._id.toString());
      projectIdsByNormalizedName.set(normalizedProjectName, matchingProjectIds);
    }

    const aliasBySprintRepoId = new Map<string, Set<string>>();
    for (const sprintRepo of sprintRepos) {
      addAlias(aliasBySprintRepoId, sprintRepo._id.toString(), sprintRepo.name);
    }
    for (const sprint of sprints) {
      const sprintRepoId = toIdString(sprint.sprintRepoId);
      if (!sprintRepoId) {
        continue;
      }

      addAlias(aliasBySprintRepoId, sprintRepoId, sprint.projectName);
    }

    const mappingEntries: Array<[string, MappingDocument]> = mappings.map((mapping) => [
      `${mapping.projectId}:${toIdString(mapping.sprintRepoId)}`,
      mapping as MappingDocument,
    ]);
    const mappingByKey = new Map<string, MappingDocument>(mappingEntries);
    const activeMappingsBySprintRepoId = new Map<string, Set<string>>();

    for (const mapping of mappings) {
      const sprintRepoId = toIdString(mapping.sprintRepoId);
      if (!mapping.isActive || !mapping.projectId || !sprintRepoId) {
        continue;
      }

      if (!validProjectIds.has(mapping.projectId) || !validSprintRepoIds.has(sprintRepoId)) {
        continue;
      }

      const sprintRepoProjects = activeMappingsBySprintRepoId.get(sprintRepoId) || new Set<string>();
      sprintRepoProjects.add(mapping.projectId);
      activeMappingsBySprintRepoId.set(sprintRepoId, sprintRepoProjects);
    }

    const mappedSprintRepoIdsBefore = new Set(activeMappingsBySprintRepoId.keys());
    const mappedSprintsBefore = sprints.filter((sprint) => {
      const sprintRepoId = toIdString(sprint.sprintRepoId);
      return sprintRepoId ? mappedSprintRepoIdsBefore.has(sprintRepoId) : false;
    }).length;
    const validTaskProjectLinksBefore = tasks.filter((task) => {
      const taskTitleKey = normalizeName(task.title);
      if (EXACT_TEST_TITLE_KEYS.has(taskTitleKey)) {
        return false;
      }

      const projectId = toIdString(task.projectId);
      return Boolean(projectId && validProjectIds.has(projectId));
    }).length;

    const mappingCandidates = new Map<string, MappingCandidate>();

    for (const task of tasks) {
      const projectId = toIdString(task.projectId);
      const sprintRepoId = toIdString(task.sprintRepoId);

      if (!projectId || !sprintRepoId || !validProjectIds.has(projectId) || !mongoose.Types.ObjectId.isValid(sprintRepoId)) {
        continue;
      }

      addCandidate(mappingCandidates, projectId, sprintRepoId, 'task');
    }

    for (const [sprintRepoId, aliases] of aliasBySprintRepoId.entries()) {
      if (!mongoose.Types.ObjectId.isValid(sprintRepoId)) {
        continue;
      }

      if ([...aliases].some((alias) => alias.includes('test'))) {
        continue;
      }

      const candidateProjectIds = new Set<string>();
      for (const alias of aliases) {
        const matchingProjectIds = projectIdsByNormalizedName.get(alias);
        if (!matchingProjectIds) {
          continue;
        }

        for (const projectId of matchingProjectIds) {
          candidateProjectIds.add(projectId);
        }
      }

      if (candidateProjectIds.size !== 1) {
        continue;
      }

      const candidateProjectId = [...candidateProjectIds][0];
      const existingActiveProjectIds = activeMappingsBySprintRepoId.get(sprintRepoId);
      if (
        existingActiveProjectIds
        && existingActiveProjectIds.size > 0
        && !existingActiveProjectIds.has(candidateProjectId)
      ) {
        continue;
      }

      addCandidate(
        mappingCandidates,
        candidateProjectId,
        sprintRepoId,
        'exact-name'
      );
    }

    const taskEvidenceByMappingKey = new Map<string, number>();
    for (const task of tasks) {
      const projectId = toIdString(task.projectId);
      const sprintRepoId = toIdString(task.sprintRepoId);
      if (!projectId || !sprintRepoId) {
        continue;
      }

      if (!validProjectIds.has(projectId) || !validSprintRepoIds.has(sprintRepoId)) {
        continue;
      }

      const evidenceKey = `${projectId}:${sprintRepoId}`;
      taskEvidenceByMappingKey.set(evidenceKey, (taskEvidenceByMappingKey.get(evidenceKey) || 0) + 1);
    }

    const summary = {
      databaseName: options.databaseName,
      apply: options.apply,
      activeProjects: projects.length,
      activeSprintRepos: sprintRepos.length,
      activeSprints: sprints.length,
      activeTasks: tasks.length,
      mappedSprintsBefore,
      validTaskProjectLinksBefore,
      mappingCandidates: mappingCandidates.size,
      mappingsCreated: 0,
      mappingsReactivated: 0,
      mappingsAlreadyActive: 0,
      mappingsDeactivatedInvalid: 0,
      mappingsDeactivatedDuplicate: 0,
      mappingsCreatedFromTaskData: 0,
      mappingsCreatedFromExactNameMatch: 0,
      tasksAlreadyValid: 0,
      tasksNormalized: 0,
      tasksAmbiguous: 0,
      tasksUnresolved: 0,
      testTasksDeactivated: 0,
      projectsUpdated: 0,
      mappedSprintsAfter: 0,
      validTaskProjectLinksAfter: 0,
      ambiguousTaskExamples: [] as Array<{
        taskId: string;
        title: string;
        projectId: string | null;
        sprintRepoId: string | null;
      }>,
      unresolvedTaskExamples: [] as Array<{
        taskId: string;
        title: string;
        projectId: string | null;
        sprintRepoId: string | null;
      }>,
      deactivatedTaskTitles: [] as string[],
    };

    const mappingOperations: any[] = [];

    for (const candidate of mappingCandidates.values()) {
      const existingMapping = mappingByKey.get(candidate.key);

      if (existingMapping?.isActive) {
        summary.mappingsAlreadyActive += 1;
        continue;
      }

      if (existingMapping?._id) {
        mappingOperations.push({
          updateOne: {
            filter: { _id: existingMapping._id },
            update: {
              $set: {
                isActive: true,
                updatedAt: now,
              },
            },
          },
        });
        existingMapping.isActive = true;
        summary.mappingsReactivated += 1;
      } else {
        const sprintRepoObjectId = new mongoose.Types.ObjectId(candidate.sprintRepoId);
        mappingOperations.push({
          insertOne: {
            document: {
              projectId: candidate.projectId,
              sprintRepoId: sprintRepoObjectId,
              isActive: true,
              createdAt: now,
              updatedAt: now,
            },
          },
        });

        mappingByKey.set(candidate.key, {
          _id: new mongoose.Types.ObjectId(),
          projectId: candidate.projectId,
          sprintRepoId: sprintRepoObjectId,
          isActive: true,
        });
        summary.mappingsCreated += 1;
      }

      if (candidate.sources.has('task')) {
        summary.mappingsCreatedFromTaskData += 1;
      }
      if (candidate.sources.has('exact-name')) {
        summary.mappingsCreatedFromExactNameMatch += 1;
      }
    }

    for (const mapping of mappingByKey.values()) {
      const sprintRepoId = toIdString(mapping.sprintRepoId);
      if (!mapping.isActive || !mapping.projectId || !sprintRepoId) {
        continue;
      }

      if (validProjectIds.has(mapping.projectId) && validSprintRepoIds.has(sprintRepoId)) {
        continue;
      }

      queueMappingDeactivation(mappingOperations, mapping, now);
      mapping.isActive = false;
      summary.mappingsDeactivatedInvalid += 1;
    }

    const activeMappingsGroupedBySprintRepoId = new Map<string, MappingDocument[]>();
    for (const mapping of mappingByKey.values()) {
      const sprintRepoId = toIdString(mapping.sprintRepoId);
      if (!mapping.isActive || !mapping.projectId || !sprintRepoId) {
        continue;
      }

      const sprintRepoMappings = activeMappingsGroupedBySprintRepoId.get(sprintRepoId) || [];
      sprintRepoMappings.push(mapping);
      activeMappingsGroupedBySprintRepoId.set(sprintRepoId, sprintRepoMappings);
    }

    for (const [sprintRepoId, sprintRepoMappings] of activeMappingsGroupedBySprintRepoId.entries()) {
      if (sprintRepoMappings.length <= 1) {
        continue;
      }

      const mappingsWithTaskEvidence = sprintRepoMappings.filter((mapping) => (
        (taskEvidenceByMappingKey.get(`${mapping.projectId}:${sprintRepoId}`) || 0) > 0
      ));

      if (mappingsWithTaskEvidence.length !== 1) {
        continue;
      }

      const keepMappingId = mappingsWithTaskEvidence[0]._id.toString();
      for (const mapping of sprintRepoMappings) {
        if (mapping._id.toString() === keepMappingId) {
          continue;
        }

        queueMappingDeactivation(mappingOperations, mapping, now);
        mapping.isActive = false;
        summary.mappingsDeactivatedDuplicate += 1;
      }
    }

    if (options.apply && mappingOperations.length > 0) {
      await mappingsCollection.bulkWrite(mappingOperations, { ordered: false });
    }

    const activeMappingsAfterRepair = new Map<string, Set<string>>();
    for (const mapping of mappingByKey.values()) {
      const sprintRepoId = toIdString(mapping.sprintRepoId);
      if (!mapping.isActive || !mapping.projectId || !sprintRepoId) {
        continue;
      }

      const sprintRepoProjects = activeMappingsAfterRepair.get(sprintRepoId) || new Set<string>();
      sprintRepoProjects.add(mapping.projectId);
      activeMappingsAfterRepair.set(sprintRepoId, sprintRepoProjects);
    }

    const uniqueProjectBySprintRepoId = new Map<string, string>();
    const ambiguousSprintRepoIds = new Set<string>();
    for (const [sprintRepoId, projectIds] of activeMappingsAfterRepair.entries()) {
      if (projectIds.size === 1) {
        uniqueProjectBySprintRepoId.set(sprintRepoId, [...projectIds][0]);
      } else if (projectIds.size > 1) {
        ambiguousSprintRepoIds.add(sprintRepoId);
      }
    }

    const taskOperations: any[] = [];
    const repairedTasks = tasks.map<{
      _id: mongoose.Types.ObjectId;
      title?: string;
      status?: string;
      estimatedHours?: number;
      actualHours?: number;
      projectId: string | null;
      sprintRepoId: string | null;
      isActive: boolean;
    }>((task) => {
      const taskId = task._id.toString();
      const title = task.title || 'Untitled task';
      const titleKey = normalizeName(title);
      const currentProjectId = toIdString(task.projectId);
      const sprintRepoId = toIdString(task.sprintRepoId);

      if (EXACT_TEST_TITLE_KEYS.has(titleKey)) {
        summary.testTasksDeactivated += 1;
        summary.deactivatedTaskTitles.push(title);

        taskOperations.push({
          updateOne: {
            filter: { _id: task._id },
            update: {
              $set: {
                isActive: false,
                updatedAt: now,
              },
            },
          },
        });

        return {
          _id: task._id,
          title: task.title,
          status: task.status,
          estimatedHours: task.estimatedHours,
          actualHours: task.actualHours,
          isActive: false,
          projectId: currentProjectId,
          sprintRepoId,
        };
      }

      const isCurrentlyValidProject = Boolean(currentProjectId && validProjectIds.has(currentProjectId));
      if (isCurrentlyValidProject) {
        summary.tasksAlreadyValid += 1;
      }

      let resolvedProjectId = currentProjectId;
      if (!isCurrentlyValidProject) {
        const directSprintRepoMatch = sprintRepoId ? uniqueProjectBySprintRepoId.get(sprintRepoId) : null;
        const legacyProjectAsSprintRepoMatch = currentProjectId ? uniqueProjectBySprintRepoId.get(currentProjectId) : null;

        if (directSprintRepoMatch) {
          resolvedProjectId = directSprintRepoMatch;
        } else if (legacyProjectAsSprintRepoMatch) {
          resolvedProjectId = legacyProjectAsSprintRepoMatch;
        } else if (
          (sprintRepoId && ambiguousSprintRepoIds.has(sprintRepoId))
          || (currentProjectId && ambiguousSprintRepoIds.has(currentProjectId))
        ) {
          summary.tasksAmbiguous += 1;
          if (summary.ambiguousTaskExamples.length < 10) {
            summary.ambiguousTaskExamples.push({
              taskId,
              title,
              projectId: currentProjectId,
              sprintRepoId,
            });
          }
        } else {
          summary.tasksUnresolved += 1;
          if (summary.unresolvedTaskExamples.length < 10) {
            summary.unresolvedTaskExamples.push({
              taskId,
              title,
              projectId: currentProjectId,
              sprintRepoId,
            });
          }
        }
      }

      if (resolvedProjectId && resolvedProjectId !== currentProjectId) {
        summary.tasksNormalized += 1;
        taskOperations.push({
          updateOne: {
            filter: { _id: task._id },
            update: {
              $set: {
                projectId: resolvedProjectId,
                updatedAt: now,
              },
            },
          },
        });
      }

      return {
        _id: task._id,
        title: task.title,
        status: task.status,
        estimatedHours: task.estimatedHours,
        actualHours: task.actualHours,
        isActive: true,
        projectId: resolvedProjectId,
        sprintRepoId,
      };
    });

    if (options.apply && taskOperations.length > 0) {
      await tasksCollection.bulkWrite(taskOperations, { ordered: false });
    }

    const projectSummaryById = new Map<string, ReturnType<typeof createTaskSummary>>();
    for (const task of repairedTasks) {
      if (!task.isActive) {
        continue;
      }

      const projectId = toIdString(task.projectId);
      if (!projectId || !validProjectIds.has(projectId)) {
        continue;
      }

      const projectSummary = projectSummaryById.get(projectId) || createTaskSummary();
      projectSummary.total += 1;

      switch (task.status) {
        case 'completed':
          projectSummary.completed += 1;
          break;
        case 'in-progress':
          projectSummary.inProgress += 1;
          break;
        case 'pending':
          projectSummary.pending += 1;
          break;
        default:
          break;
      }

      projectSummaryById.set(projectId, projectSummary);
    }

    summary.validTaskProjectLinksAfter = repairedTasks.filter((task) => {
      if (!task.isActive) {
        return false;
      }

      const projectId = toIdString(task.projectId);
      return Boolean(projectId && validProjectIds.has(projectId));
    }).length;

    const projectOperations: any[] = [];
    for (const project of projects) {
      const projectId = project._id.toString();
      const nextTaskSummary = projectSummaryById.get(projectId) || createTaskSummary();
      const nextProgress = nextTaskSummary.total > 0
        ? Math.round((nextTaskSummary.completed / nextTaskSummary.total) * 100)
        : 0;

      const currentTaskSummary = project.tasks || {};
      const currentProgress = typeof project.progress === 'number' ? project.progress : 0;

      const needsUpdate =
        currentTaskSummary.total !== nextTaskSummary.total
        || currentTaskSummary.completed !== nextTaskSummary.completed
        || currentTaskSummary.inProgress !== nextTaskSummary.inProgress
        || currentTaskSummary.pending !== nextTaskSummary.pending
        || currentProgress !== nextProgress;

      if (!needsUpdate) {
        continue;
      }

      summary.projectsUpdated += 1;
      projectOperations.push({
        updateOne: {
          filter: { _id: project._id },
          update: {
            $set: {
              tasks: nextTaskSummary,
              progress: nextProgress,
              updatedAt: now,
            },
          },
        },
      });
    }

    if (options.apply && projectOperations.length > 0) {
      await projectsCollection.bulkWrite(projectOperations, { ordered: false });
    }

    const mappedSprintRepoIdsAfter = new Set(activeMappingsAfterRepair.keys());
    summary.mappedSprintsAfter = sprints.filter((sprint) => {
      const sprintRepoId = toIdString(sprint.sprintRepoId);
      return sprintRepoId ? mappedSprintRepoIdsAfter.has(sprintRepoId) : false;
    }).length;

    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
