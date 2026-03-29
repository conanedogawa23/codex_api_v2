import dotenv from 'dotenv';
import mongoose from 'mongoose';

import { User } from '../../models/User';
import { ACCESS_ROLE, type AccessRole } from '../accessControl';
import { logger } from '../logger';

dotenv.config();

type CandidateUser = {
  _id: { toString(): string };
  name?: string;
  email?: string;
  username?: string;
  role?: string;
  department?: string;
  userType?: string;
  isActive?: boolean;
  accessRole?: string;
  isSuperAdmin?: boolean;
};

type BackfillOptions = {
  dryRun?: boolean;
};

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
  /settlement/i,
];

const DEFAULT_CLUSTER_SUPER_ADMIN_EMAILS = ['m.salim@oginnovation.com'];
const DEFAULT_CLUSTER_SUPER_ADMIN_USERNAMES: string[] = [];
const DEFAULT_FINANCE_EMAILS: string[] = [];
const DEFAULT_FINANCE_USERNAMES: string[] = [];
const DEFAULT_ADMIN_EMAILS = [
  'i.talaat@casheer.com',
  'm.elmeshtawey@oghub.com',
  'w.khalil@ogmoney.com',
];
const DEFAULT_ADMIN_USERNAMES: string[] = [];

function parseSeedList(value: string | undefined, fallback: string[] = []): string[] {
  const configuredValues = value
    ?.split(',')
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.length > 0);

  return configuredValues && configuredValues.length > 0 ? configuredValues : fallback;
}

const CLUSTER_SUPER_ADMIN_EMAILS = new Set(
  parseSeedList(process.env.RBAC_CLUSTER_SUPER_ADMIN_EMAILS, DEFAULT_CLUSTER_SUPER_ADMIN_EMAILS)
);
const CLUSTER_SUPER_ADMIN_USERNAMES = new Set(
  parseSeedList(process.env.RBAC_CLUSTER_SUPER_ADMIN_USERNAMES, DEFAULT_CLUSTER_SUPER_ADMIN_USERNAMES)
);
const FINANCE_EMAILS = new Set(parseSeedList(process.env.RBAC_FINANCE_EMAILS, DEFAULT_FINANCE_EMAILS));
const FINANCE_USERNAMES = new Set(
  parseSeedList(process.env.RBAC_FINANCE_USERNAMES, DEFAULT_FINANCE_USERNAMES)
);
const ADMIN_EMAILS = new Set(parseSeedList(process.env.RBAC_ADMIN_EMAILS, DEFAULT_ADMIN_EMAILS));
const ADMIN_USERNAMES = new Set(parseSeedList(process.env.RBAC_ADMIN_USERNAMES, DEFAULT_ADMIN_USERNAMES));

function getNormalizedEmail(user: CandidateUser): string {
  return user.email?.trim().toLowerCase() || '';
}

function getNormalizedUsername(user: CandidateUser): string {
  return user.username?.trim().toLowerCase() || '';
}

function getNormalizedRole(user: CandidateUser): string {
  return user.role?.trim().toLowerCase() || '';
}

function isLikelyNonHuman(user: CandidateUser): boolean {
  if (user.userType && user.userType !== 'human') {
    return true;
  }

  const name = user.name?.trim() || '';
  const username = user.username?.trim() || '';
  const email = getNormalizedEmail(user);
  const role = getNormalizedRole(user);

  if (role === 'bot') {
    return true;
  }

  if (email.endsWith('@noreply.codex.oginnovation.com')) {
    return true;
  }

  return BOT_PATTERNS.some((pattern) => {
    return pattern.test(name) || pattern.test(username) || pattern.test(email);
  });
}

function isActiveHuman(user: CandidateUser): boolean {
  return user.isActive === true && !isLikelyNonHuman(user);
}

function isExplicitSeedMatch(user: CandidateUser, emails: Set<string>, usernames: Set<string>): boolean {
  return emails.has(getNormalizedEmail(user)) || usernames.has(getNormalizedUsername(user));
}

function isLegacyAdminSeed(user: CandidateUser): boolean {
  if (isExplicitSeedMatch(user, ADMIN_EMAILS, ADMIN_USERNAMES)) {
    return true;
  }

  return getNormalizedRole(user) === 'admin';
}

function resolveAccessRole(user: CandidateUser): AccessRole | null {
  if (!isActiveHuman(user)) {
    return null;
  }

  if (isExplicitSeedMatch(user, CLUSTER_SUPER_ADMIN_EMAILS, CLUSTER_SUPER_ADMIN_USERNAMES)) {
    return ACCESS_ROLE.CLUSTER_SUPER_ADMIN;
  }

  if (isExplicitSeedMatch(user, FINANCE_EMAILS, FINANCE_USERNAMES)) {
    return ACCESS_ROLE.FINANCE;
  }

  if (isLegacyAdminSeed(user)) {
    return ACCESS_ROLE.ADMIN;
  }

  return ACCESS_ROLE.STANDARD_USER;
}

export async function backfillAccessRoles(options: BackfillOptions = {}) {
  const dryRun = options.dryRun === true;

  logger.info('Starting access role backfill', {
    dryRun,
    clusterSuperAdminEmails: [...CLUSTER_SUPER_ADMIN_EMAILS],
    clusterSuperAdminUsernames: [...CLUSTER_SUPER_ADMIN_USERNAMES],
    financeEmails: [...FINANCE_EMAILS],
    financeUsernames: [...FINANCE_USERNAMES],
    adminEmails: [...ADMIN_EMAILS],
    adminUsernames: [...ADMIN_USERNAMES],
  });

  const users = await User.find({})
    .select('_id name email username role department userType isActive accessRole isSuperAdmin')
    .lean<CandidateUser[]>();

  const updatesByRole = new Map<AccessRole, string[]>();
  for (const accessRole of Object.values(ACCESS_ROLE)) {
    updatesByRole.set(accessRole, []);
  }

  const nonHumanUserIds: string[] = [];
  let inactiveCount = 0;
  let missingDepartmentCount = 0;

  for (const user of users) {
    if (user.isActive !== true) {
      inactiveCount += 1;
      continue;
    }

    if (isLikelyNonHuman(user)) {
      nonHumanUserIds.push(user._id.toString());
      continue;
    }

    if (!user.department?.trim()) {
      missingDepartmentCount += 1;
    }

    const nextAccessRole = resolveAccessRole(user);
    if (!nextAccessRole) {
      continue;
    }

    updatesByRole.get(nextAccessRole)?.push(user._id.toString());
  }

  const summary = {
    totalUsers: users.length,
    activeHumanUsers: [...updatesByRole.values()].reduce((sum, ids) => sum + ids.length, 0),
    inactiveUsers: inactiveCount,
    nonHumanUsers: nonHumanUserIds.length,
    missingDepartmentUsers: missingDepartmentCount,
    accessRoleCounts: Object.fromEntries(
      [...updatesByRole.entries()].map(([accessRole, userIds]) => [accessRole, userIds.length])
    ),
  };

  if (dryRun) {
    logger.info('Dry run completed for access role backfill', summary);
    return summary;
  }

  for (const [accessRole, userIds] of updatesByRole.entries()) {
    if (userIds.length === 0) {
      continue;
    }

    await User.updateMany(
      { _id: { $in: userIds.map((userId) => new mongoose.Types.ObjectId(userId)) } },
      { $set: { accessRole } }
    );
  }

  if (nonHumanUserIds.length > 0) {
    await User.updateMany(
      { _id: { $in: nonHumanUserIds.map((userId) => new mongoose.Types.ObjectId(userId)) } },
      { $unset: { accessRole: '' } }
    );
  }

  const postBackfillCounts = await User.aggregate([
    {
      $match: {
        isActive: true,
        accessRole: { $exists: true, $ne: null },
      },
    },
    {
      $group: {
        _id: '$accessRole',
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  logger.info('Completed access role backfill', {
    ...summary,
    postBackfillCounts,
  });

  return {
    ...summary,
    postBackfillCounts,
  };
}

async function runStandalone() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/codex_api';
  const dryRun = process.env.RBAC_DRY_RUN === 'true';

  try {
    await mongoose.connect(mongoUri);
    logger.info('Connected to MongoDB for access role backfill', { dryRun });
    await backfillAccessRoles({ dryRun });
    await mongoose.disconnect();
    logger.info('Disconnected from MongoDB after access role backfill');
    process.exit(0);
  } catch (error) {
    logger.error('Failed to backfill access roles', { error });
    process.exit(1);
  }
}

if (require.main === module) {
  runStandalone();
}
