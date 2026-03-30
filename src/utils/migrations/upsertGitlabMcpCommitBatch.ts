import 'dotenv/config';
import 'reflect-metadata';

import mongoose from 'mongoose';

import { Commit } from '../../models/Commit';
import { Project } from '../../models/Project';
import { User } from '../../models/User';

interface GitLabCommitStats {
  additions?: number;
  deletions?: number;
  total?: number;
}

interface GitLabCommitPayload {
  id: string;
  short_id?: string;
  title?: string;
  message?: string;
  author_name?: string;
  author_email?: string;
  authored_date?: string;
  committer_name?: string;
  committer_email?: string;
  committed_date?: string;
  created_at?: string;
  web_url?: string;
  parent_ids?: string[];
  stats?: GitLabCommitStats;
}

interface ProjectCommitBatch {
  gitlabProjectId?: number | string;
  projectPath?: string;
  commits?: GitLabCommitPayload[];
}

const normalizeEmail = (value?: string): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : undefined;
};

const readStdin = async (): Promise<string> =>
  await new Promise((resolve, reject) => {
    let data = '';

    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });

const toValidDate = (value?: string): Date | undefined => {
  if (!value) {
    return undefined;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

async function resolveProject(batch: ProjectCommitBatch) {
  const filters: Record<string, unknown>[] = [];
  const gitlabProjectId = Number(batch.gitlabProjectId);

  if (Number.isFinite(gitlabProjectId) && gitlabProjectId > 0) {
    filters.push({ gitlabId: gitlabProjectId });
  }

  if (typeof batch.projectPath === 'string' && batch.projectPath.trim()) {
    filters.push({ pathWithNamespace: batch.projectPath.trim() });
  }

  if (filters.length === 0) {
    return null;
  }

  return await Project.findOne({ $or: filters })
    .select('gitlabId pathWithNamespace')
    .lean();
}

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is required');
  }

  const rawInput = (await readStdin()).trim();
  if (!rawInput) {
    throw new Error('No MCP commit payload was provided on stdin');
  }

  const parsed = JSON.parse(rawInput);
  const batches = Array.isArray(parsed) ? parsed : [parsed];

  await mongoose.connect(process.env.MONGODB_URI);

  const summary = {
    batchesReceived: batches.length,
    projectsMatched: 0,
    projectsSkipped: 0,
    commitsSeen: 0,
    commitWritesAttempted: 0,
    usersMatched: 0,
  };

  try {
    for (const batch of batches as ProjectCommitBatch[]) {
      const project = await resolveProject(batch);
      const commits = Array.isArray(batch.commits) ? batch.commits : [];

      summary.commitsSeen += commits.length;

      if (!project) {
        summary.projectsSkipped += 1;
        console.warn(JSON.stringify({
          level: 'warn',
          reason: 'project_not_found',
          gitlabProjectId: batch.gitlabProjectId,
          projectPath: batch.projectPath,
          commitCount: commits.length,
        }));
        continue;
      }

      if (commits.length === 0) {
        summary.projectsMatched += 1;
        console.log(JSON.stringify({
          level: 'info',
          gitlabProjectId: project.gitlabId,
          projectPath: project.pathWithNamespace,
          commitCount: 0,
          written: 0,
        }));
        continue;
      }

      const emails = Array.from(new Set(
        commits.flatMap((commit) => [
          normalizeEmail(commit.author_email),
          normalizeEmail(commit.committer_email),
        ]).filter((value): value is string => !!value)
      ));

      const matchedUsers = emails.length > 0
        ? await User.find({ email: { $in: emails } }).select('_id email').lean()
        : [];

      const userIdByEmail = new Map(
        matchedUsers
          .map((user) => {
            const email = normalizeEmail(user.email);
            return email ? [email, user._id] : null;
          })
          .filter((entry): entry is [string, unknown] => entry !== null)
      );

      const syncTime = new Date();
      let batchUserMatches = 0;

      const operations = commits
        .filter((commit) => typeof commit.id === 'string' && commit.id.trim().length > 0)
        .map((commit) => {
          const authorEmail = normalizeEmail(commit.author_email);
          const committerEmail = normalizeEmail(commit.committer_email);
          const matchedUserId = (authorEmail && userIdByEmail.get(authorEmail))
            || (committerEmail && userIdByEmail.get(committerEmail));

          if (matchedUserId) {
            batchUserMatches += 1;
          }

          const authoredDate = toValidDate(commit.authored_date) || syncTime;
          const committedDate = toValidDate(commit.committed_date)
            || toValidDate(commit.created_at)
            || authoredDate;
          const update: Record<string, unknown> = {
            sha: commit.id.trim(),
            projectId: String(project.gitlabId),
            shortId: commit.short_id?.trim() || commit.id.trim().slice(0, 8),
            title: commit.title?.trim() || commit.message?.trim() || commit.id.trim(),
            message: commit.message || commit.title || commit.id,
            authorName: commit.author_name?.trim() || 'Unknown',
            authorEmail: authorEmail || commit.author_email || 'unknown@example.com',
            authoredDate,
            committerName: commit.committer_name?.trim() || commit.author_name?.trim() || 'Unknown',
            committerEmail: committerEmail || commit.committer_email || authorEmail || 'unknown@example.com',
            committedDate,
            webUrl: commit.web_url || `${project.pathWithNamespace}/-/commit/${commit.id.trim()}`,
            parentIds: Array.isArray(commit.parent_ids) ? commit.parent_ids : [],
            lastSyncedAt: syncTime,
            isDeleted: false,
            syncTimestamps: {
              coreData: syncTime,
              diffStats: commit.stats ? syncTime : undefined,
            },
          };

          if (commit.stats) {
            update.stats = {
              additions: Number(commit.stats.additions) || 0,
              deletions: Number(commit.stats.deletions) || 0,
              total: Number(commit.stats.total) || 0,
            };
          }

          if (matchedUserId) {
            update.userId = matchedUserId;
          }

          return {
            updateOne: {
              filter: {
                sha: commit.id.trim(),
                projectId: String(project.gitlabId),
              },
              update: {
                $set: update,
                $setOnInsert: {
                  createdAt: syncTime,
                },
              },
              upsert: true,
            },
          };
        });

      if (operations.length > 0) {
        await Commit.bulkWrite(operations, { ordered: false });
      }

      summary.projectsMatched += 1;
      summary.commitWritesAttempted += operations.length;
      summary.usersMatched += batchUserMatches;

      console.log(JSON.stringify({
        level: 'info',
        gitlabProjectId: project.gitlabId,
        projectPath: project.pathWithNamespace,
        commitCount: commits.length,
        written: operations.length,
        matchedUsers: batchUserMatches,
      }));
    }
  } finally {
    await mongoose.disconnect();
  }

  console.log(JSON.stringify({
    level: 'info',
    summary,
  }));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
