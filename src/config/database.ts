import mongoose from 'mongoose';
import { logger } from '../utils/logger';

export class DatabaseConfig {
  private static instance: DatabaseConfig;
  private isConnected = false;

  private constructor() {}

  public static getInstance(): DatabaseConfig {
    if (!DatabaseConfig.instance) {
      DatabaseConfig.instance = new DatabaseConfig();
    }
    return DatabaseConfig.instance;
  }

  public async connect(mongoUri: string): Promise<void> {
    if (this.isConnected) {
      return;
    }

    try {
      await mongoose.connect(mongoUri, {
        maxPoolSize: 10,
        minPoolSize: 2,
        socketTimeoutMS: 45000,
        serverSelectionTimeoutMS: 5000,
      });

      this.isConnected = true;
      logger.info('MongoDB connected');

      // Handle connection events
      mongoose.connection.on('error', (error) => {
        logger.error('MongoDB connection error:', error);
        this.isConnected = false;
      });

      mongoose.connection.on('disconnected', () => {
        logger.warn('MongoDB disconnected');
        this.isConnected = false;
      });

    } catch (error) {
      logger.error('MongoDB connection failed:', error);
      this.isConnected = false;
      throw error;
    }
  }

  public async disconnect(): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    try {
      await mongoose.disconnect();
      this.isConnected = false;
    } catch (error) {
      logger.error('MongoDB disconnect error:', error);
      throw error;
    }
  }

  public getConnectionStatus(): boolean {
    return this.isConnected;
  }

  public async healthCheck(): Promise<{ status: string; responseTime: number }> {
    const start = Date.now();
    try {
      if (!this.isConnected) {
        return { status: 'disconnected', responseTime: 0 };
      }

      // Simple ping to check connection
      await mongoose.connection.db.admin().ping();
      const responseTime = Date.now() - start;
      
      return { status: 'connected', responseTime };
    } catch (error) {
      logger.error('Database health check failed:', error);
      return { status: 'error', responseTime: Date.now() - start };
    }
  }
}

export const database = DatabaseConfig.getInstance();

