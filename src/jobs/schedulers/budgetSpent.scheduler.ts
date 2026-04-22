import { budgetSpentQueue } from '../config/queue';
import { logger } from '../../utils/logger';
import type { BudgetSpentJobData } from '../processors/budgetSpent/budgetSpent.processor';

export async function triggerBudgetSpentRecalculation(projectIds?: string[]): Promise<void> {
  const payload: BudgetSpentJobData = { projectIds: projectIds ?? [] };

  await budgetSpentQueue.add('budget-spent-recalc', payload, {
    removeOnComplete: true,
    attempts: 2,
    backoff: {
      type: 'exponential',
      delay: 4000,
    },
  });

  logger.info('Enqueued budget spent recalculation', {
    scopedProjects: projectIds?.length ?? 'all',
  });
}
