import { Request, Response } from 'express';
import { environment } from '../config/environment';
import { jobManager } from '../jobs';
import { logger } from '../utils/logger';

type GitLabWebhookPayload = {
  object_kind?: string;
  event_type?: string;
  project?: {
    path_with_namespace?: string;
  };
  group?: {
    full_path?: string;
    path?: string;
  };
};

function normalizeEventKind(request: Request, payload: GitLabWebhookPayload): string {
  const headerEvent = request.header('x-gitlab-event');
  const rawEvent = payload.object_kind || payload.event_type || headerEvent || 'unknown';

  return rawEvent
    .toLowerCase()
    .replace(/\s+hook$/, '')
    .replace(/\s+/g, '_');
}

function getProjectPath(payload: GitLabWebhookPayload): string | undefined {
  return payload.project?.path_with_namespace?.trim() || undefined;
}

function getGroupPath(payload: GitLabWebhookPayload, projectPath?: string): string | undefined {
  const explicitGroupPath = payload.group?.full_path?.trim() || payload.group?.path?.trim();
  if (explicitGroupPath) {
    return explicitGroupPath;
  }

  if (!projectPath || !projectPath.includes('/')) {
    return undefined;
  }

  return projectPath.substring(0, projectPath.lastIndexOf('/'));
}

async function triggerJob(
  triggeredJobs: string[],
  label: string,
  trigger: () => Promise<void>
): Promise<void> {
  await trigger();
  triggeredJobs.push(label);
}

export async function handleGitLabWebhook(req: Request, res: Response): Promise<void> {
  try {
    const configuredSecret = environment.get().gitlab.webhookSecret;
    const receivedSecret = req.header('x-gitlab-token');

    if (environment.isProduction() && !configuredSecret?.trim()) {
      logger.error('GitLab webhook rejected: GITLAB_WEBHOOK_SECRET is not set in production');
      res.status(503).json({ success: false, error: 'Webhook is not configured' });
      return;
    }

    if (configuredSecret && receivedSecret !== configuredSecret) {
      logger.warn('Rejected GitLab webhook with invalid token', {
        event: req.header('x-gitlab-event'),
        ip: req.ip,
      });
      res.status(401).json({ success: false, error: 'Invalid GitLab webhook token' });
      return;
    }

    if (!jobManager.getStatus()) {
      res.status(503).json({
        success: false,
        error: 'Background jobs are not initialized',
      });
      return;
    }

    const payload = (req.body || {}) as GitLabWebhookPayload;
    const eventKind = normalizeEventKind(req, payload);
    const projectPath = getProjectPath(payload);
    const explicitGroupPath = payload.group?.full_path?.trim() || payload.group?.path?.trim() || undefined;
    const groupPath = getGroupPath(payload, projectPath);
    const triggeredJobs: string[] = [];

    switch (eventKind) {
      case 'push':
      case 'tag_push':
        if (projectPath) {
          await triggerJob(triggeredJobs, 'commit', () =>
            jobManager.triggerCommitSync({ batchSize: 100, projectPath })
          );
          await triggerJob(triggeredJobs, 'pipeline', () =>
            jobManager.triggerPipelineSync({ batchSize: 100, projectPath })
          );
        }
        break;
      case 'merge_request':
        if (projectPath) {
          await triggerJob(triggeredJobs, 'merge_request', () =>
            jobManager.triggerMergeRequestSync({ batchSize: 100, projectPath })
          );
          await triggerJob(triggeredJobs, 'commit', () =>
            jobManager.triggerCommitSync({ batchSize: 100, projectPath })
          );
          await triggerJob(triggeredJobs, 'label', () =>
            jobManager.triggerLabelSync({ batchSize: 200, projectPath })
          );
          await triggerJob(triggeredJobs, 'milestone', () =>
            jobManager.triggerMilestoneSync({ batchSize: 100, projectPath })
          );
        }
        break;
      case 'issue':
        if (projectPath) {
          await triggerJob(triggeredJobs, 'issue', () =>
            jobManager.triggerIssueSync({ batchSize: 100, projectPath })
          );
          await triggerJob(triggeredJobs, 'label', () =>
            jobManager.triggerLabelSync({ batchSize: 200, projectPath })
          );
          await triggerJob(triggeredJobs, 'milestone', () =>
            jobManager.triggerMilestoneSync({ batchSize: 100, projectPath })
          );
        }
        if (groupPath) {
          await triggerJob(triggeredJobs, 'iteration', () =>
            jobManager.triggerIterationSync({ batchSize: 100, groupPath })
          );
        }
        break;
      case 'pipeline':
      case 'job':
        if (projectPath) {
          await triggerJob(triggeredJobs, 'pipeline', () =>
            jobManager.triggerPipelineSync({ batchSize: 100, projectPath })
          );
        }
        break;
      case 'note':
        if (projectPath) {
          await triggerJob(triggeredJobs, 'issue', () =>
            jobManager.triggerIssueSync({ batchSize: 100, projectPath })
          );
          await triggerJob(triggeredJobs, 'merge_request', () =>
            jobManager.triggerMergeRequestSync({ batchSize: 100, projectPath })
          );
          await triggerJob(triggeredJobs, 'commit', () =>
            jobManager.triggerCommitSync({ batchSize: 100, projectPath })
          );
          await triggerJob(triggeredJobs, 'label', () =>
            jobManager.triggerLabelSync({ batchSize: 200, projectPath })
          );
          await triggerJob(triggeredJobs, 'milestone', () =>
            jobManager.triggerMilestoneSync({ batchSize: 100, projectPath })
          );
        }
        break;
      default:
        break;
    }

    if (explicitGroupPath) {
      await triggerJob(triggeredJobs, 'namespace', () =>
        jobManager.triggerNamespaceSync({ batchSize: 100 })
      );
    }

    logger.info('Processed GitLab webhook', {
      eventKind,
      projectPath,
      groupPath,
      triggeredJobs,
    });

    res.status(202).json({
      success: true,
      eventKind,
      projectPath,
      groupPath,
      triggeredJobs,
      message:
        triggeredJobs.length > 0
          ? 'Webhook accepted and sync jobs queued'
          : 'Webhook accepted with no matching sync handler',
    });
  } catch (error) {
    logger.error('Failed to process GitLab webhook', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
