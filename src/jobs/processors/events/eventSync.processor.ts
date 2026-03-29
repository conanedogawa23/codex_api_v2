import { Job } from 'bull';
import { BaseSyncProcessor, CategorySyncResult, SyncOptions, SyncResult } from '../base/baseSyncProcessor';
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
    const createdAt = event.createdAt || event.created_at;
    const pushData = event.pushData || event.push_data;

    return {
      gitlabId: this.extractGitLabId(event),
      projectId: event.project?.id
        ? String(this.extractGitLabId(event.project))
        : event.project_id
          ? String(event.project_id)
          : undefined,
      actionName: event.actionName || event.action_name || event.action || '',
      targetType: event.targetType || event.target_type || undefined,
      targetId: event.targetId || event.target_id || undefined,
      targetTitle: event.targetTitle || event.target_title || undefined,
      createdAt: createdAt ? new Date(createdAt) : syncTime,
      pushData: pushData
        ? {
            commitCount: pushData.commitCount ?? pushData.commit_count ?? 0,
            action: pushData.action || '',
            refType: pushData.refType || pushData.ref_type || '',
            commitFrom: pushData.commitFrom || pushData.commit_from || undefined,
            commitTo: pushData.commitTo || pushData.commit_to || undefined,
            ref: pushData.ref || undefined,
            commitTitle: pushData.commitTitle || pushData.commit_title || undefined,
          }
        : undefined,
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

  protected async processEntity(
    entity: any,
    categorySyncResults: { [category: string]: CategorySyncResult }
  ): Promise<{ created: boolean; updated: boolean; skipped: boolean }> {
    const gitlabId = this.extractGitLabId(entity);
    const existingEntity = await this.getExisting(gitlabId);

    if (existingEntity && this.shouldSkipSync(existingEntity)) {
      logger.debug('Skipping event sync', {
        entityId: gitlabId,
        reason: 'Manual or non-syncable entity'
      });
      return { created: false, updated: false, skipped: true };
    }

    const wrappedData = { events: [entity] };
    const modelData = this.mapToModel(wrappedData);
    this.updateCategoryTimestamps(modelData, wrappedData, categorySyncResults);

    const savedEvent = await this.updateModel(modelData);
    if (!savedEvent) {
      return { created: false, updated: false, skipped: true };
    }

    if (existingEntity) {
      logger.debug('event updated', { entityId: gitlabId });
      return { created: false, updated: true, skipped: false };
    }

    logger.info('event created', { entityId: gitlabId });
    return { created: true, updated: false, skipped: false };
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

