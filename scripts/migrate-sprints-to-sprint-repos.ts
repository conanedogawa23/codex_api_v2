import mongoose from 'mongoose';
import { logger } from '../src/utils/logger';

async function migrateSprints() {
  try {
    // Connect to MongoDB
    const mongoUri = 'mongodb://localhost:27017/codex_api';
    
    await mongoose.connect(mongoUri, {
      maxPoolSize: 10,
      minPoolSize: 2,
      socketTimeoutMS: 45000,
      serverSelectionTimeoutMS: 5000,
    });
    
    logger.info('Connected to MongoDB Atlas');
    console.log('✓ Connected to MongoDB Atlas');

    // Find all sprints with old projectId field
    const sprintsCollection = mongoose.connection.collection('sprints');
    
    // Count documents that need migration
    const needsMigration = await sprintsCollection.countDocuments({ projectId: { $exists: true } });
    console.log(`\nFound ${needsMigration} sprints that need migration...\n`);

    if (needsMigration === 0) {
      console.log('✓ No sprints need migration. All sprints are already using sprintRepoId.');
      return;
    }

    let migrated = 0;
    let errors = 0;

    // Get all sprints with projectId
    const sprintsToMigrate = await sprintsCollection.find({ projectId: { $exists: true } }).toArray();

    for (const sprint of sprintsToMigrate) {
      try {
        // Migrate: rename projectId to sprintRepoId and add new fields
        const updateResult = await sprintsCollection.updateOne(
          { _id: sprint._id },
          {
            $rename: { projectId: 'sprintRepoId' },
            $set: {
              assignees: sprint.assignees || [],
              progress: sprint.progress || {
                totalTasks: 0,
                completedTasks: 0,
                percentage: 0
              }
            }
          }
        );

        if (updateResult.modifiedCount > 0) {
          logger.info(`Migrated sprint: ${sprint.name} (ID: ${sprint._id})`);
          console.log(`✓ Migrated: ${sprint.name}`);
          migrated++;
        }
      } catch (error) {
        logger.error(`Error migrating sprint ${sprint._id}`, { error });
        console.error(`✗ Error migrating sprint: ${sprint.name}`);
        errors++;
      }
    }

    // Summary
    logger.info('Migration completed!', {
      total: needsMigration,
      migrated,
      errors
    });

    console.log('\n=================================');
    console.log('📊 MIGRATION SUMMARY');
    console.log('=================================');
    console.log(`Total sprints needing migration: ${needsMigration}`);
    console.log(`✓ Successfully migrated: ${migrated}`);
    console.log(`✗ Errors: ${errors}`);
    console.log('=================================\n');

    // Verify migration
    const remainingOld = await sprintsCollection.countDocuments({ projectId: { $exists: true } });
    const newCount = await sprintsCollection.countDocuments({ sprintRepoId: { $exists: true } });
    
    console.log('=================================');
    console.log('📋 VERIFICATION');
    console.log('=================================');
    console.log(`Sprints with old projectId field: ${remainingOld}`);
    console.log(`Sprints with new sprintRepoId field: ${newCount}`);
    console.log('=================================\n');

    if (remainingOld === 0) {
      console.log('✅ Migration successful! All sprints now use sprintRepoId.\n');
    } else {
      console.log('⚠️  Warning: Some sprints still have projectId field.\n');
    }

  } catch (error) {
    logger.error('Fatal error during migration', { error });
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    // Close MongoDB connection
    await mongoose.connection.close();
    logger.info('MongoDB connection closed');
    console.log('✓ MongoDB connection closed');
  }
}

// Run the migration
migrateSprints();

