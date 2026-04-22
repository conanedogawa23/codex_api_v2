import type { Job } from 'bull';
import { logger } from '../../../utils/logger';
import { recalculateBudgetSpentForProjects } from '../../../services/finance/budgetSpent.service';

export interface BudgetSpentJobData {
  projectIds?: string[];
}

export async function processBudgetSpent(job: Job<BudgetSpentJobData>): Promise<void> {
  logger.info('Budget spent recalculation job started', { jobId: job.id, data: job.data });
  const ids = job.data.projectIds?.filter((id) => typeof id === 'string' && id.length > 0);
  await recalculateBudgetSpentForProjects(ids && ids.length > 0 ? ids : undefined);
  logger.info('Budget spent recalculation job finished', { jobId: job.id });
}
