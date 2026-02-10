import mongoose from 'mongoose';
import { User } from '../../models/User';
import { Department } from '../../models/Department';
import { logger } from '../logger';

/**
 * Data Migration Script: Fix Department-User Integration
 * 
 * This script fixes critical data integrity issues:
 * 1. Creates missing department documents for all user department values
 * 2. Flags bot/service accounts based on naming patterns
 * 3. Rebuilds department.members[] arrays from users.department as source of truth
 * 4. Validates and fixes department heads
 */

// Patterns to identify non-human accounts
const BOT_PATTERNS = [
  /^no name$/i,
  /api$/i,
  /bot$/i,
  /token$/i,
  /sync/i,
  /check$/i,
  /test\d+$/i,
  /dummy/i,
  /casheer/i,
  /acctk/i,
  /nexus\d+$/i,
  /^private/i,
  /^abc/i,
  /deploy/i,
  /loyalty.*token/i,
  /settlement/i
];

const isLikelyBot = (name: string, username: string): boolean => {
  const lowerName = name.toLowerCase();
  const lowerUsername = username.toLowerCase();
  
  return BOT_PATTERNS.some(pattern => 
    pattern.test(lowerName) || pattern.test(lowerUsername)
  );
};

const determineUserType = (user: any): 'human' | 'bot' | 'service_account' | 'deploy_token' => {
  const name = user.name || '';
  const username = user.username || '';
  
  // Check for deploy tokens
  if (name.includes('token') || name.includes('deploy')) {
    return 'deploy_token';
  }
  
  // Check for service accounts (API, Sync, etc.)
  if (name.includes('API') || name.includes('Sync') || name.includes('Settlement')) {
    return 'service_account';
  }
  
  // Check for bots/test accounts
  if (isLikelyBot(name, username)) {
    return 'bot';
  }
  
  return 'human';
};

export async function fixDepartmentData() {
  try {
    logger.info('Starting department data migration...');
    
    // Step 1: Flag bot/service accounts
    logger.info('Step 1: Identifying and flagging non-human accounts...');
    const allUsers = await User.find({});
    
    let botCount = 0;
    let serviceAccountCount = 0;
    let deployTokenCount = 0;
    let humanCount = 0;
    
    for (const user of allUsers) {
      const userType = determineUserType(user);
      
      if (user.userType !== userType) {
        await User.findByIdAndUpdate(user._id, { userType });
        
        switch (userType) {
          case 'bot':
            botCount++;
            break;
          case 'service_account':
            serviceAccountCount++;
            break;
          case 'deploy_token':
            deployTokenCount++;
            break;
          case 'human':
            humanCount++;
            break;
        }
        
        logger.info(`Flagged ${user.name} (${user.email}) as ${userType}`);
      }
    }
    
    logger.info(`Flagged accounts: ${botCount} bots, ${serviceAccountCount} service accounts, ${deployTokenCount} deploy tokens, ${humanCount} humans`);
    
    // Step 2: Get all unique department values from users (only humans)
    logger.info('Step 2: Identifying all unique department values from human users...');
    const departmentAggregation = await User.aggregate([
      { $match: { userType: 'human', isActive: true } },
      { $group: { _id: '$department', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    
    logger.info(`Found ${departmentAggregation.length} unique departments in user data`);
    
    // Step 3: Create missing departments
    logger.info('Step 3: Creating missing department documents...');
    for (const deptData of departmentAggregation) {
      const deptName = deptData._id;
      const userCount = deptData.count;
      
      const existingDept = await Department.findOne({ name: deptName });
      
      if (!existingDept) {
        // Find a suitable department head (first human user in department with most projects or senior role)
        const potentialHeads = await User.find({ 
          department: deptName, 
          userType: 'human',
          isActive: true 
        }).sort({ 'projects.length': -1 }).limit(5);
        
        const head = potentialHeads[0];
        
        const newDept = new Department({
          name: deptName,
          description: `${deptName} department`,
          isActive: true,
          members: [],
          projects: [],
          head: head ? {
            id: head.gitlabId?.toString() || head._id.toString(),
            name: head.name,
            email: head.email
          } : undefined
        });
        
        await newDept.save();
        logger.info(`Created department: ${deptName} with ${userCount} users`);
      } else {
        logger.info(`Department ${deptName} already exists with ${existingDept.members.length} members in array`);
      }
    }
    
    // Step 4: Rebuild department member arrays from users.department (only humans)
    logger.info('Step 4: Rebuilding department member arrays...');
    const allDepartments = await Department.find({});
    
    for (const dept of allDepartments) {
      // Find all HUMAN users in this department
      const deptUsers = await User.find({ 
        department: dept.name, 
        userType: 'human',
        isActive: true 
      });
      
      // Build member array using gitlabId as string
      const memberIds = deptUsers
        .filter(user => user.gitlabId)
        .map(user => user.gitlabId!.toString());
      
      // Update department with correct members
      dept.members = memberIds;
      
      // Validate department head is human
      if (dept.head?.id) {
        let headUser = null;
        
        // Try to find by gitlabId first (most likely)
        const headGitlabId = parseInt(dept.head.id);
        if (!isNaN(headGitlabId)) {
          headUser = await User.findOne({ gitlabId: headGitlabId });
        }
        
        // If not found and looks like ObjectId, try by _id
        if (!headUser && dept.head.id.match(/^[0-9a-fA-F]{24}$/)) {
          headUser = await User.findById(dept.head.id);
        }
        
        if (headUser && headUser.userType !== 'human') {
          // Replace with a real human
          const newHead = deptUsers[0];
          if (newHead) {
            dept.head = {
              id: newHead.gitlabId?.toString() || newHead._id.toString(),
              name: newHead.name,
              email: newHead.email
            };
            logger.info(`Replaced non-human head in ${dept.name} with ${newHead.name}`);
          }
        } else if (!headUser && deptUsers.length > 0) {
          // Head user not found, assign first available human
          const newHead = deptUsers[0];
          dept.head = {
            id: newHead.gitlabId?.toString() || newHead._id.toString(),
            name: newHead.name,
            email: newHead.email
          };
          logger.info(`Assigned new head to ${dept.name}: ${newHead.name}`);
        }
      } else if (deptUsers.length > 0 && !dept.head) {
        // No head assigned, assign first available human
        const newHead = deptUsers[0];
        dept.head = {
          id: newHead.gitlabId?.toString() || newHead._id.toString(),
          name: newHead.name,
          email: newHead.email
        };
        logger.info(`Assigned new head to ${dept.name}: ${newHead.name}`);
      }
      
      await dept.save();
      logger.info(`Updated ${dept.name}: ${memberIds.length} human members`);
    }
    
    // Step 5: Remove GitLab-group-based departments that have no matching users
    logger.info('Step 5: Checking GitLab-group-based departments...');
    const gitlabGroupDepts = ['DevOps_Sample', 'Katalon', 'og-invoicing', 'og-core'];
    
    for (const deptName of gitlabGroupDepts) {
      const dept = await Department.findOne({ name: deptName });
      if (dept) {
        const userCount = await User.countDocuments({ 
          department: deptName, 
          userType: 'human',
          isActive: true 
        });
        
        if (userCount === 0) {
          logger.info(`Department ${deptName} has no human users - marking as inactive (namespace-only entity)`);
          dept.isActive = false;
          dept.description = `${dept.description || ''} (GitLab namespace group - no direct human members)`;
          await dept.save();
        }
      }
    }
    
    // Step 6: Generate summary report
    logger.info('Step 6: Generating summary report...');
    const finalDepartments = await Department.find({ isActive: true });
    const finalUserCounts = await Promise.all(
      finalDepartments.map(async (dept) => {
        const count = await User.countDocuments({ 
          department: dept.name, 
          userType: 'human',
          isActive: true 
        });
        return { name: dept.name, arraySize: dept.members.length, actualUsers: count };
      })
    );
    
    logger.info('=== Migration Summary ===');
    logger.info(`Total active departments: ${finalDepartments.length}`);
    logger.info('Department synchronization status:');
    finalUserCounts.forEach(({ name, arraySize, actualUsers }) => {
      const status = arraySize === actualUsers ? '✓' : '✗';
      logger.info(`  ${status} ${name}: ${arraySize} in array, ${actualUsers} actual users`);
    });
    
    const totalHumans = await User.countDocuments({ userType: 'human', isActive: true });
    const totalBots = await User.countDocuments({ userType: { $ne: 'human' } });
    logger.info(`Total human users: ${totalHumans}`);
    logger.info(`Total non-human accounts: ${totalBots}`);
    
    logger.info('Department data migration completed successfully!');
    
    return {
      success: true,
      departments: finalDepartments.length,
      humanUsers: totalHumans,
      nonHumanAccounts: totalBots,
      details: finalUserCounts
    };
    
  } catch (error) {
    logger.error('Error during department data migration:', error);
    throw error;
  }
}

// Allow running as standalone script
async function runStandalone() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/codex_api';
  
  try {
    await mongoose.connect(mongoUri);
    logger.info('Connected to MongoDB');
    await fixDepartmentData();
    await mongoose.disconnect();
    logger.info('Disconnected from MongoDB');
    process.exit(0);
  } catch (error) {
    logger.error('Failed to run migration:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  runStandalone();
}
