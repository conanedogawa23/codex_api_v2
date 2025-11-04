import { Router, Request, Response } from 'express';
import { jobManager } from '../jobs/index';
import { logger } from '../utils/logger';

const router = Router();

/**
 * GET /api/jobs/status
 * Get status of all job queues
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    const userStatus = await jobManager.getUserSyncStatus();
    const projectStatus = await jobManager.getProjectSyncStatus();

    res.json({
      success: true,
      data: {
        user: userStatus,
        project: projectStatus
      }
    });
  } catch (error) {
    logger.error('Error getting job status', { error: error instanceof Error ? error.message : 'Unknown error' });
    res.status(500).json({
      success: false,
      error: 'Failed to get job status'
    });
  }
});

/**
 * POST /api/jobs/trigger/:entityType
 * Manually trigger a sync job
 */
router.post('/trigger/:entityType', async (req: Request, res: Response) => {
  try {
    const { entityType } = req.params;

    switch (entityType) {
      case 'user':
        await jobManager.triggerUserSync();
        break;
      case 'project':
        await jobManager.triggerProjectSync();
        break;
      case 'issue':
        await jobManager.triggerIssueSync();
        break;
      case 'mergeRequest':
        await jobManager.triggerMergeRequestSync();
        break;
      case 'namespace':
        await jobManager.triggerNamespaceSync();
        break;
      default:
        return res.status(400).json({
          success: false,
          error: `Unknown entity type: ${entityType}`
        });
    }

    return res.json({
      success: true,
      message: `${entityType} sync triggered successfully`
    });
  } catch (error) {
    logger.error('Error triggering sync', {
      entityType: req.params.entityType,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    return res.status(500).json({
      success: false,
      error: 'Failed to trigger sync'
    });
  }
});

/**
 * POST /api/jobs/trigger/all
 * Trigger all sync jobs
 */
router.post('/trigger/all', async (req: Request, res: Response) => {
  try {
    await jobManager.triggerUserSync();
    await jobManager.triggerProjectSync();
    await jobManager.triggerIssueSync();
    await jobManager.triggerMergeRequestSync();
    await jobManager.triggerNamespaceSync();

    res.json({
      success: true,
      message: 'All sync jobs triggered successfully'
    });
  } catch (error) {
    logger.error('Error triggering all syncs', { error: error instanceof Error ? error.message : 'Unknown error' });
    res.status(500).json({
      success: false,
      error: 'Failed to trigger all syncs'
    });
  }
});

/**
 * POST /api/jobs/pause/:entityType
 * Pause a specific sync job
 */
router.post('/pause/:entityType', async (req: Request, res: Response) => {
  try {
    const { entityType } = req.params;

    switch (entityType) {
      case 'user':
        await jobManager.pauseUserSync();
        break;
      case 'project':
        await jobManager.pauseProjectSync();
        break;
      default:
        return res.status(400).json({
          success: false,
          error: `Unknown entity type: ${entityType}`
        });
    }

    return res.json({
      success: true,
      message: `${entityType} sync paused successfully`
    });
  } catch (error) {
    logger.error('Error pausing sync', {
      entityType: req.params.entityType,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    return res.status(500).json({
      success: false,
      error: 'Failed to pause sync'
    });
  }
});

/**
 * POST /api/jobs/resume/:entityType
 * Resume a specific sync job
 */
router.post('/resume/:entityType', async (req: Request, res: Response) => {
  try {
    const { entityType } = req.params;

    switch (entityType) {
      case 'user':
        await jobManager.resumeUserSync();
        break;
      case 'project':
        await jobManager.resumeProjectSync();
        break;
      default:
        return res.status(400).json({
          success: false,
          error: `Unknown entity type: ${entityType}`
        });
    }

    return res.json({
      success: true,
      message: `${entityType} sync resumed successfully`
    });
  } catch (error) {
    logger.error('Error resuming sync', {
      entityType: req.params.entityType,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    return res.status(500).json({
      success: false,
      error: 'Failed to resume sync'
    });
  }
});

/**
 * POST /api/jobs/cleanup
 * Clean up old completed/failed jobs
 */
router.post('/cleanup', async (req: Request, res: Response) => {
  try {
    const { gracePeriodHours = 24 } = req.body;

    await jobManager.cleanupJobs(gracePeriodHours);
    await jobManager.cleanupProjectJobs(gracePeriodHours);

    res.json({
      success: true,
      message: `Old jobs cleaned up (grace period: ${gracePeriodHours} hours)`
    });
  } catch (error) {
    logger.error('Error cleaning up jobs', { error: error instanceof Error ? error.message : 'Unknown error' });
    res.status(500).json({
      success: false,
      error: 'Failed to cleanup jobs'
    });
  }
});

/**
 * GET /api/jobs/health
 * Health check for job system
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    const isInitialized = jobManager.getStatus();

    res.json({
      success: true,
      data: {
        initialized: isInitialized,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('Error checking job health', { error: error instanceof Error ? error.message : 'Unknown error' });
    res.status(500).json({
      success: false,
      error: 'Failed to check job health'
    });
  }
});

export default router;

