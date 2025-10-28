import { Job } from 'bull';
import { BaseSyncProcessor, SyncOptions, SyncResult } from '../base/baseSyncProcessor';
import { Note, INote } from '../../../models/Note';
import { logger } from '../../../utils/logger';
import { gitlabNoteProcessor } from './gitlabNoteProcessor';
import moment from 'moment-timezone';

class NoteSyncProcessor extends BaseSyncProcessor<INote> {
  readonly entityName = 'note';
  readonly categories = ['coreData', 'reactions'];

  async fetchFromGitLab(options: SyncOptions): Promise<any[]> {
    return [];
  }

  async fetchEntityData(ids: number[]): Promise<any> {
    return await gitlabNoteProcessor.fetchNoteData(ids);
  }

  async getExisting(gitlabId: number): Promise<any> {
    return await Note.findOne({ gitlabId }).lean();
  }

  mapToModel(gitlabData: any): Partial<INote> {
    const syncTime = moment().toDate();
    if (!gitlabData || !gitlabData.notes || gitlabData.notes.length === 0) return {};

    const note = gitlabData.notes[0];
    return {
      gitlabId: this.extractGitLabId(note),
      body: note.body || '',
      system: note.system || false,
      internal: note.internal || false,
      createdAt: note.createdAt ? new Date(note.createdAt) : syncTime,
      updatedAt: note.updatedAt ? new Date(note.updatedAt) : syncTime,
      lastSyncedAt: syncTime,
      isDeleted: false,
      syncTimestamps: {}
    };
  }

  async updateModel(data: Partial<INote>): Promise<INote | null> {
    try {
      if (!data.gitlabId) return null;
      return await Note.findOneAndUpdate(
        { gitlabId: data.gitlabId },
        { $set: data },
        { new: true, upsert: true, runValidators: true }
      );
    } catch (error: unknown) {
      logger.error('Error updating note', { gitlabId: data.gitlabId, error: error instanceof Error ? error.message : 'Unknown error' });
      return null;
    }
  }

  protected isCategoryDataAvailable(gitlabData: any, category: string): boolean {
    if (!gitlabData || !gitlabData.notes || gitlabData.notes.length === 0) return false;
    return true;
  }
}

export const noteSyncProcessor = new NoteSyncProcessor();

export const processNoteSync = async (job: Job<SyncOptions>): Promise<SyncResult> => {
  try {
    return await noteSyncProcessor.sync(job);
  } catch (error: unknown) {
    logger.error('Note sync failed', { jobId: job.id, error: error instanceof Error ? error.message : 'Unknown error' });
    throw error;
  }
};

