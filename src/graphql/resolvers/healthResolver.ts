import { database } from '../../config/database';
import pkg from '../../../package.json';

export const healthQuery = {
  health: async () => {
    const dbHealth = await database.healthCheck();
    
    return {
      status: dbHealth.status === 'connected' ? 'OK' : 'ERROR',
      timestamp: new Date().toISOString(),
      database: {
        status: dbHealth.status,
        responseTime: dbHealth.responseTime,
      },
      version: pkg.version,
    };
  },
};

