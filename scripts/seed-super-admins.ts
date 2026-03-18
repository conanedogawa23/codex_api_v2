import mongoose from 'mongoose';

import { environment } from '../src/config/environment';
import { User } from '../src/models/User';
import { logger } from '../src/utils/logger';

const SUPER_ADMIN_EMAILS = [
  'b.subramanyam@oginnovation.com',
  'c.vidya@oginnovation.com',
] as const;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function seedSuperAdmins() {
  const normalizedEmails = SUPER_ADMIN_EMAILS.map((email) => email.trim().toLowerCase());
  const emailFilters = normalizedEmails.map((email) => ({
    email: new RegExp(`^${escapeRegex(email)}$`, 'i'),
  }));

  try {
    const config = environment.get();
    await mongoose.connect(config.mongodbUri);
    logger.info('Connected to MongoDB for super admin seeding');

    const existingUsers = await User.find({ $or: emailFilters })
      .select('name email isSuperAdmin isActive')
      .lean();

    const matchedEmails = new Set(existingUsers.map((user) => user.email.trim().toLowerCase()));
    const missingEmails = normalizedEmails.filter((email) => !matchedEmails.has(email));

    const updateResult = await User.updateMany(
      { $or: emailFilters },
      {
        $set: {
          isSuperAdmin: true,
        },
      }
    );

    const updatedUsers = await User.find({ $or: emailFilters })
      .select('name email isSuperAdmin isActive')
      .sort({ email: 1 })
      .lean();

    logger.info('Super admin seeding completed', {
      requestedEmails: normalizedEmails,
      matchedCount: updateResult.matchedCount,
      modifiedCount: updateResult.modifiedCount,
      missingEmails,
    });

    if (missingEmails.length > 0) {
      logger.warn('Some configured super admin emails were not found', {
        missingEmails,
      });
    }

    console.log('\n=== Super Admin Seeding Summary ===');
    console.log(`Requested: ${normalizedEmails.length}`);
    console.log(`Matched: ${updateResult.matchedCount}`);
    console.log(`Modified: ${updateResult.modifiedCount}`);
    console.log(`Missing: ${missingEmails.length}`);
    console.log('Updated Users:');

    updatedUsers.forEach((user) => {
      console.log(
        `- ${user.email} | ${user.name || 'Unknown'} | isSuperAdmin=${user.isSuperAdmin} | isActive=${user.isActive}`
      );
    });

    if (missingEmails.length > 0) {
      console.log('Missing Emails:');
      missingEmails.forEach((email) => console.log(`- ${email}`));
    }

    console.log('===================================\n');

    return {
      requestedEmails: normalizedEmails,
      matchedCount: updateResult.matchedCount,
      modifiedCount: updateResult.modifiedCount,
      missingEmails,
      updatedUsers,
    };
  } finally {
    await mongoose.disconnect();
    logger.info('Disconnected from MongoDB after super admin seeding');
  }
}

if (require.main === module) {
  seedSuperAdmins()
    .then(() => {
      logger.info('Super admin seeding script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Super admin seeding script failed', {
        error: error instanceof Error ? error.message : error,
      });
      process.exit(1);
    });
}

export { seedSuperAdmins, SUPER_ADMIN_EMAILS };
