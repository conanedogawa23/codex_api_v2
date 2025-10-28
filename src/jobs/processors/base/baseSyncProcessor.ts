import { Job } from 'bull';
import { logger } from '../../../utils/logger';
import moment from 'moment-timezone';

/**
 * Sync options for controlling sync behavior
 */
export interface SyncOptions {
  batchSize?: number;
  fullSync?: boolean;
  categoryFilter?: string[];
}

/**
 * Sync result for tracking success/failure per category
 */
export interface CategorySyncResult {
  success: number;
  failures: number;
  lastSyncedAt?: Date;
}

/**
 * Comprehensive sync result interface
 */
export interface SyncResult {
  success: boolean;
  processed: number;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  duration: number;
  timestamp: string;
  categorySyncResults: {
    [category: string]: CategorySyncResult;
  };
}

/**
 * Base Sync Processor
 * Abstract class providing common sync logic for all entity types
 */
export abstract class BaseSyncProcessor<T> {
  /**
   * Entity name for logging and identification
   */
  abstract readonly entityName: string;

  /**
   * Category names for this entity type
   */
  abstract readonly categories: string[];

  /**
   * Fetch entities from GitLab API
   * @param options - Sync options including batch size, filters, etc.
   * @returns Array of GitLab entity data
   */
  abstract fetchFromGitLab(options: SyncOptions): Promise<any[]>;

  /**
   * Fetch detailed data for a specific entity
   * @param ids - Entity IDs to fetch
   * @returns Detailed entity data with all categories
   */
  abstract fetchEntityData(ids: number[]): Promise<any>;

  /**
   * Map GitLab data to MongoDB model format
   * @param gitlabData - Raw data from GitLab API
   * @returns Partial model data ready for database update
   */
  abstract mapToModel(gitlabData: any): Partial<T>;

  /**
   * Update or create entity in database
   * @param data - Entity data to persist
   * @returns Updated/created entity
   */
  abstract updateModel(data: Partial<T>): Promise<T | null>;

  /**
   * Get existing entity from database
   * @param gitlabId - GitLab ID of the entity
   * @returns Existing entity or null
   */
  abstract getExisting(gitlabId: number): Promise<any>;

  /**
   * Execute sync process with comprehensive error handling
   * @param job - Bull job instance
   * @returns Sync result with detailed statistics
   */
  async sync(job: Job<SyncOptions>): Promise<SyncResult> {
    const startTime = Date.now();
    const options = job.data || {};
    const { batchSize = 100 } = options;

    logger.info(`Starting ${this.entityName} sync job`, {
      jobId: job.id,
      entityName: this.entityName,
      batchSize,
      categories: this.categories.length
    });

    let processed = 0;
    let created = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;

    // Initialize category sync results
    const categorySyncResults: { [category: string]: CategorySyncResult } = {};
    this.categories.forEach(category => {
      categorySyncResults[category] = { success: 0, failures: 0 };
    });

    try {
      // Fetch entities from GitLab
      const entities = await this.fetchFromGitLab(options);

      if (entities.length === 0) {
        logger.info(`No ${this.entityName} entities to process`);
        await job.progress(100);

        const duration = Date.now() - startTime;
        return {
          success: true,
          processed: 0,
          created: 0,
          updated: 0,
          skipped: 0,
          errors: 0,
          duration,
          timestamp: moment().format('YYYY-MM-DDTHH:mm:ss.SSS'),
          categorySyncResults
        };
      }

      logger.info(`Fetched ${entities.length} ${this.entityName} entities from GitLab`);

      // Update progress for preparation phase
      await job.progress(5);

      const totalEntities = entities.length;

      // Process entities in batches
      for (let i = 0; i < entities.length; i += batchSize) {
        const batch = entities.slice(i, i + batchSize);
        const progress = Math.round(5 + ((i + batch.length) / totalEntities) * 95);
        await job.progress(progress);

        logger.debug(`Processing ${this.entityName} batch`, {
          batchSize: batch.length,
          totalEntities
        });

        // Process each entity in the batch
        for (const entity of batch) {
          try {
            const result = await this.processEntity(entity, categorySyncResults);

            if (result.created) {
              created++;
            } else if (result.updated) {
              updated++;
            } else if (result.skipped) {
              skipped++;
            }

            processed++;
          } catch (error: unknown) {
            errors++;
            logger.error(`Error processing ${this.entityName}`, {
              entityId: entity.gitlabId,
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
        }
      }

      // Mark job as 100% complete
      await job.progress(100);

      const duration = Date.now() - startTime;
      const result: SyncResult = {
        success: true,
        processed,
        created,
        updated,
        skipped,
        errors,
        duration,
        timestamp: moment().format('YYYY-MM-DDTHH:mm:ss.SSS'),
        categorySyncResults
      };

      logger.info(`${this.entityName} sync job completed successfully`, {
        ...result,
        message: `Processed ${processed} entities: ${created} created, ${updated} updated, ${skipped} skipped, ${errors} errors`
      });

      return result;
    } catch (error: unknown) {
      logger.error(`${this.entityName} sync job failed`, {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        processed,
        created,
        updated,
        skipped,
        errors
      });

      throw error;
    }
  }

  /**
   * Process a single entity with category-level error handling
   * @param entity - Entity data from GitLab
   * @param categorySyncResults - Results tracker for categories
   * @returns Processing result indicating created/updated/skipped
   */
  protected async processEntity(
    entity: any,
    categorySyncResults: { [category: string]: CategorySyncResult }
  ): Promise<{ created: boolean; updated: boolean; skipped: boolean }> {
    const gitlabId = this.extractGitLabId(entity);

    // Check if entity exists
    const existingEntity = await this.getExisting(gitlabId);

    if (existingEntity) {
      // Check if entity should be skipped (e.g., manual entities)
      if (this.shouldSkipSync(existingEntity)) {
        logger.debug(`Skipping ${this.entityName} sync`, {
          entityId: gitlabId,
          reason: 'Manual or non-syncable entity'
        });
        return { created: false, updated: false, skipped: true };
      }

      // Fetch detailed data with all categories
      const detailedData = await this.fetchEntityData([gitlabId]);

      if (!detailedData || !detailedData.data) {
        logger.warn(`No detailed data found for ${this.entityName}`, { gitlabId });
        return { created: false, updated: false, skipped: true };
      }

      // Map GitLab data to model format
      const modelData = this.mapToModel(detailedData.data);

      // Update syncTimestamps for successful categories
      this.updateCategoryTimestamps(modelData, detailedData.data, categorySyncResults);

      // Update entity in database
      const updatedEntity = await this.updateModel(modelData);

      if (updatedEntity) {
        logger.debug(`${this.entityName} updated`, { entityId: gitlabId });
        return { created: false, updated: true, skipped: false };
      }

      return { created: false, updated: false, skipped: true };
    } else {
      // Create new entity
      const detailedData = await this.fetchEntityData([gitlabId]);

      if (!detailedData || !detailedData.data) {
        logger.warn(`No detailed data found for new ${this.entityName}`, { gitlabId });
        return { created: false, updated: false, skipped: true };
      }

      const modelData = this.mapToModel(detailedData.data);

      // Set initial syncTimestamps
      this.updateCategoryTimestamps(modelData, detailedData.data, categorySyncResults);

      // Create entity in database
      const createdEntity = await this.updateModel(modelData);

      if (createdEntity) {
        logger.info(`${this.entityName} created`, { entityId: gitlabId });
        return { created: true, updated: false, skipped: false };
      }

      return { created: false, updated: false, skipped: true };
    }
  }

  /**
   * Extract GitLab ID from entity data
   * @param entity - Entity data
   * @returns GitLab ID
   */
  protected extractGitLabId(entity: any): number {
    // Handle both direct gitlabId and GraphQL global ID format
    if (entity.gitlabId) return entity.gitlabId;
    if (entity.id && typeof entity.id === 'string') {
      const match = entity.id.match(/\d+$/);
      return match ? parseInt(match[0]) : parseInt(entity.id);
    }
    return parseInt(entity.id);
  }

  /**
   * Check if entity should skip sync (e.g., manual entities)
   * Override in subclasses for entity-specific logic
   * @param existingEntity - Existing entity from database
   * @returns true if sync should be skipped
   */
  protected shouldSkipSync(existingEntity: any): boolean {
    // Default implementation - can be overridden
    return false;
  }

  /**
   * Update category timestamps based on successful data fetches
   * Override in subclasses for entity-specific category tracking
   * @param modelData - Model data being prepared for update
   * @param gitlabData - Raw GitLab data
   * @param categorySyncResults - Results tracker
   */
  protected updateCategoryTimestamps(
    modelData: any,
    gitlabData: any,
    categorySyncResults: { [category: string]: CategorySyncResult }
  ): void {
    const syncTime = moment().toDate();

    if (!modelData.syncTimestamps) {
      modelData.syncTimestamps = {};
    }

    // Track successful category syncs
    this.categories.forEach(category => {
      if (this.isCategoryDataAvailable(gitlabData, category)) {
        modelData.syncTimestamps[category] = syncTime;
        categorySyncResults[category].success++;
        categorySyncResults[category].lastSyncedAt = syncTime;
      } else {
        categorySyncResults[category].failures++;
      }
    });
  }

  /**
   * Check if category data is available in GitLab response
   * Override in subclasses for entity-specific category validation
   * @param gitlabData - Raw GitLab data
   * @param category - Category name
   * @returns true if data is available
   */
  protected isCategoryDataAvailable(gitlabData: any, category: string): boolean {
    // Default implementation - assumes data exists if not null/undefined
    return gitlabData && gitlabData[category] !== null && gitlabData[category] !== undefined;
  }

  /**
   * Execute a category query with error handling
   * @param categoryName - Name of the category
   * @param queryPromise - Promise executing the query
   * @returns Query result or null on error
   */
  protected async executeCategoryQuery(
    categoryName: string,
    queryPromise: Promise<any>
  ): Promise<any> {
    try {
      return await queryPromise;
    } catch (error: unknown) {
      logger.error(`Failed to execute ${categoryName} query for ${this.entityName}`, {
        error: error instanceof Error ? error.message : 'Unknown error',
        category: categoryName
      });
      return null;
    }
  }
}

