import dotenv from 'dotenv';
import { logger } from '../utils/logger';

// Load environment variables
dotenv.config();

export interface EnvironmentConfig {
  port: number;
  nodeEnv: string;
  mongodbUri: string;
  graphqlPlayground: boolean;
  graphqlIntrospection: boolean;
  logLevel: string;
  redis: {
    host: string;
    port: number;
    password?: string;
    db: number;
  };
}

class Environment {
  private config: EnvironmentConfig;

  constructor() {
    this.config = this.loadConfig();
    this.validate();
  }

  private loadConfig(): EnvironmentConfig {
    return {
      port: parseInt(process.env.PORT || '4000', 10),
      nodeEnv: process.env.NODE_ENV || 'development',
      mongodbUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/codex_api_v2',
      graphqlPlayground: process.env.GRAPHQL_PLAYGROUND === 'true',
      graphqlIntrospection: process.env.GRAPHQL_INTROSPECTION === 'true',
      logLevel: process.env.LOG_LEVEL || 'info',
      redis: {
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        password: process.env.REDIS_PASSWORD,
        db: parseInt(process.env.REDIS_DB || '0', 10),
      },
    };
  }

  private validate(): void {
    const required = ['mongodbUri'];
    const missing: string[] = [];

    required.forEach((key) => {
      if (!this.config[key as keyof EnvironmentConfig]) {
        missing.push(key);
      }
    });

    if (missing.length > 0) {
      const message = `Missing required environment variables: ${missing.join(', ')}`;
      logger.error(message);
      throw new Error(message);
    }

    if (this.config.port < 1 || this.config.port > 65535) {
      throw new Error('PORT must be between 1 and 65535');
    }
  }

  public get(): EnvironmentConfig {
    return this.config;
  }

  public isDevelopment(): boolean {
    return this.config.nodeEnv === 'development';
  }

  public isProduction(): boolean {
    return this.config.nodeEnv === 'production';
  }
}

export const environment = new Environment();

