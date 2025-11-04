import { Job } from 'bull';
import { BaseSyncProcessor, SyncOptions, SyncResult } from '../base/baseSyncProcessor';
import { Event, IEvent } from '../../../models/Event';
import { logger } from '../../../utils/logger';
import { gitlabEventProcessor } from './gitlabEventProcessor';
import moment from 'moment-timezone';

class EventSyncProcessor extends BaseSyncProcessor<IEvent> {
  readonly entityName = 'event';
  readonly categories = ['coreData'];

  async fetchFromGitLab(options: SyncOptions): Promise<any[]> {
    return await gitlabEventProcessor.fetchSimpleEvents(options.batchSize || 100);
  }

  async fetchEntityData(ids: number[]): Promise<any> {
    return await gitlabEventProcessor.fetchEventData(ids);
  }

  async getExisting(gitlabId: number): Promise<any> {
    return await Event.findOne({ gitlabId }).lean();
  }

  mapToModel(gitlabData: any): Partial<IEvent> {
    const syncTime = moment().toDate();
    if (!gitlabData || !gitlabData.events || gitlabData.events.length === 0) return {};

    const event = gitlabData.events[0];
    return {
      gitlabId: this.extractGitLabId(event),
      projectId: event.project?.id ? String(this.extractGitLabId(event.project)) : undefined,
      actionName: event.actionName || event.action || '',
      targetType: event.targetType || undefined,
      targetId: event.targetId || undefined,
      targetTitle: event.targetTitle || undefined,
      createdAt: event.createdAt ? new Date(event.createdAt) : syncTime,
      lastSyncedAt: syncTime,
      isDeleted: false,
      syncTimestamps: {}
    };
  }

  async updateModel(data: Partial<IEvent>): Promise<IEvent | null> {
    try {
      if (!data.gitlabId) return null;
      return await Event.findOneAndUpdate(
        { gitlabId: data.gitlabId },
        { $set: data },
        { new: true, upsert: true, runValidators: true }
      );
    } catch (error: unknown) {
      logger.error('Error updating event', { gitlabId: data.gitlabId, error: error instanceof Error ? error.message : 'Unknown error' });
      return null;
    }
  }

  protected isCategoryDataAvailable(gitlabData: any, category: string): boolean {
    if (!gitlabData || !gitlabData.events || gitlabData.events.length === 0) return false;
    return true;
  }
}

export const eventSyncProcessor = new EventSyncProcessor();

export const processEventSync = async (job: Job<SyncOptions>): Promise<SyncResult> => {
  try {
    return await eventSyncProcessor.sync(job);
  } catch (error: unknown) {
    logger.error('Event sync failed', { jobId: job.id, error: error instanceof Error ? error.message : 'Unknown error' });
    throw error;
  }
};

