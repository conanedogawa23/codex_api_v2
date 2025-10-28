import { Job } from 'bull';
import { BaseSyncProcessor, SyncOptions, SyncResult } from '../base/baseSyncProcessor';
import { WikiPage, IWikiPage } from '../../../models/WikiPage';
import { logger } from '../../../utils/logger';
import { gitlabWikiPageProcessor } from './gitlabWikiPageProcessor';
import moment from 'moment-timezone';

class WikiPageSyncProcessor extends BaseSyncProcessor<IWikiPage> {
  readonly entityName = 'wikiPage';
  readonly categories = ['coreData', 'content', 'history'];

  async fetchFromGitLab(options: SyncOptions): Promise<any[]> {
    return [];
  }

  async fetchEntityData(ids: number[]): Promise<any> {
    return await gitlabWikiPageProcessor.fetchWikiPageData(ids);
  }

  async getExisting(gitlabId: number): Promise<any> {
    return await WikiPage.findOne({ gitlabId }).lean();
  }

  mapToModel(gitlabData: any): Partial<IWikiPage> {
    const syncTime = moment().toDate();
    if (!gitlabData || !gitlabData.wikiPages || gitlabData.wikiPages.length === 0) return {};

    const page = gitlabData.wikiPages[0];
    return {
      gitlabId: this.extractGitLabId(page),
      title: page.title || '',
      slug: page.slug || '',
      format: page.format || 'markdown',
      content: page.content || '',
      createdAt: page.createdAt ? new Date(page.createdAt) : syncTime,
      updatedAt: page.updatedAt ? new Date(page.updatedAt) : syncTime,
      lastSyncedAt: syncTime,
      isDeleted: false,
      syncTimestamps: {}
    };
  }

  async updateModel(data: Partial<IWikiPage>): Promise<IWikiPage | null> {
    try {
      if (!data.gitlabId) return null;
      return await WikiPage.findOneAndUpdate(
        { gitlabId: data.gitlabId },
        { $set: data },
        { new: true, upsert: true, runValidators: true }
      );
    } catch (error: unknown) {
      logger.error('Error updating wiki page', { gitlabId: data.gitlabId, error: error instanceof Error ? error.message : 'Unknown error' });
      return null;
    }
  }

  protected isCategoryDataAvailable(gitlabData: any, category: string): boolean {
    if (!gitlabData || !gitlabData.wikiPages || gitlabData.wikiPages.length === 0) return false;
    return true;
  }
}

export const wikiPageSyncProcessor = new WikiPageSyncProcessor();

export const processWikiPageSync = async (job: Job<SyncOptions>): Promise<SyncResult> => {
  try {
    return await wikiPageSyncProcessor.sync(job);
  } catch (error: unknown) {
    logger.error('Wiki page sync failed', { jobId: job.id, error: error instanceof Error ? error.message : 'Unknown error' });
    throw error;
  }
};

