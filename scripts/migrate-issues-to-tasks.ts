import mongoose from 'mongoose';
import { Issue } from '../src/models/Issue';
import { Task } from '../src/models/Task';
import { Project } from '../src/models/Project';
import { logger } from '../src/utils/logger';
import { environment } from '../src/config/environment';

interface MigrationStats {
  totalIssues: number;
  migratedIssues: number;
  skippedIssues: number;
  errors: number;
  issuesWithoutProject: string[];
}

async function migrateIssuesToTasks(): Promise<void> {
  const stats: MigrationStats = {
    totalIssues: 0,
    migratedIssues: 0,
    skippedIssues: 0,
    errors: 0,
    issuesWithoutProject: [],
  };

  try {
    // Connect to MongoDB
    const config = environment.get();
    await mongoose.connect(config.mongodbUri);
    logger.info('Connected to MongoDB for migration');

    // Fetch all issues
    const issues = await Issue.find({}).lean();
    stats.totalIssues = issues.length;

    logger.info(`Found ${stats.totalIssues} issues to migrate`);

    for (const issue of issues) {
      try {
        // Check if this issue was already migrated
        const existingTask = await Task.findOne({ gitlabIssueId: issue.gitlabId });
        if (existingTask) {
          logger.debug(`Issue ${issue.gitlabId} already migrated, skipping`, {
            taskId: existingTask._id,
          });
          stats.skippedIssues++;
          continue;
        }

        // Find the project by gitlabId
        const project = await Project.findOne({ gitlabId: issue.projectId }).lean();
        
        if (!project) {
          logger.warn(`No project found for issue ${issue.gitlabId}`, {
            issueId: issue._id,
            projectGitlabId: issue.projectId,
          });
          stats.issuesWithoutProject.push(issue.gitlabId.toString());
          stats.skippedIssues++;
          continue;
        }

        // Map issue priority to task priority
        let taskPriority = issue.priority?.toLowerCase() || 'medium';
        if (!['low', 'medium', 'high', 'urgent'].includes(taskPriority)) {
          taskPriority = 'medium';
        }

        // Map issue state to task status
        let taskStatus = 'pending';
        if (issue.state === 'closed') {
          taskStatus = 'completed';
        } else if (issue.completionPercentage > 0 && issue.completionPercentage < 100) {
          taskStatus = 'in-progress';
        }

        // Create task from issue data
        const taskData = {
          gitlabIssueId: issue.gitlabId,
          title: issue.title,
          description: issue.description || '',
          status: taskStatus,
          priority: taskPriority,
          projectId: project._id.toString(), // MongoDB ObjectId as string
          assignedTo: issue.assignees?.[0] ? {
            id: issue.assignees[0].id.toString(),
            name: issue.assignees[0].name,
            email: issue.assignees[0].email || '',
          } : undefined,
          assignedBy: issue.author ? {
            id: issue.author.id.toString(),
            name: issue.author.name,
            email: issue.author.email || '',
          } : undefined,
          dueDate: issue.dueDate,
          completionPercentage: issue.completionPercentage || 0,
          tags: issue.tags || [],
          comments: 0,
          estimatedHours: issue.estimatedHours,
          actualHours: issue.actualHours,
          dependencies: [],
          subtasks: [],
          attachments: [],
          lastSynced: issue.lastSynced || new Date(),
          isActive: issue.isActive !== false,
          createdAt: issue.createdAt,
          updatedAt: issue.updatedAt,
        };

        // Create the task
        const task = new Task(taskData);
        await task.save();

        logger.info(`Migrated issue ${issue.gitlabId} to task ${task._id}`, {
          issueTitle: issue.title,
          projectName: project.name,
        });

        stats.migratedIssues++;
      } catch (error: any) {
        logger.error(`Error migrating issue ${issue.gitlabId}`, {
          error: error.message,
          issueId: issue._id,
        });
        stats.errors++;
      }
    }

    // Print migration summary
    logger.info('Migration completed', {
      stats: {
        totalIssues: stats.totalIssues,
        migratedIssues: stats.migratedIssues,
        skippedIssues: stats.skippedIssues,
        errors: stats.errors,
        issuesWithoutProjectCount: stats.issuesWithoutProject.length,
      },
    });

    if (stats.issuesWithoutProject.length > 0) {
      logger.warn('Issues without matching projects:', {
        gitlabIds: stats.issuesWithoutProject,
      });
    }

    console.log('\n=== Migration Summary ===');
    console.log(`Total Issues: ${stats.totalIssues}`);
    console.log(`Migrated: ${stats.migratedIssues}`);
    console.log(`Skipped: ${stats.skippedIssues}`);
    console.log(`Errors: ${stats.errors}`);
    console.log(`Issues without project: ${stats.issuesWithoutProject.length}`);
    console.log('========================\n');

  } catch (error: any) {
    logger.error('Migration failed', { error: error.message, stack: error.stack });
    throw error;
  } finally {
    await mongoose.disconnect();
    logger.info('Disconnected from MongoDB');
  }
}

// Run migration
if (require.main === module) {
  migrateIssuesToTasks()
    .then(() => {
      logger.info('Migration script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Migration script failed', { error });
      process.exit(1);
    });
}

export { migrateIssuesToTasks };

