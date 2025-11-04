import 'reflect-metadata';  // Required for GraphQL Modules
import express from 'express';
import { ApolloServer } from 'apollo-server-express';
import { database } from './config/database';
import { environment } from './config/environment';
import { logger } from './utils/logger';
import { schema, createExecutor } from './graphql/application';
import {
  errorHandler,
  notFoundHandler,
  requestLogger,
  securityMiddleware,
  corsMiddleware,
} from './middleware';
import { jobManager } from './jobs';

class Server {
  private app: express.Application;
  private apolloServer: ApolloServer | null = null;

  constructor() {
    this.app = express();
  }

  private setupMiddleware(): void {
    // Security middleware
    this.app.use(securityMiddleware);
    this.app.use(corsMiddleware);

    // Body parsing middleware
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request logging
    this.app.use(requestLogger);
  }

  private async setupApolloServer(): Promise<void> {
    const config = environment.get();
    const executor = createExecutor();

    this.apolloServer = new ApolloServer({
      schema,
      executor,
      introspection: config.graphqlIntrospection,
      context: ({ req }) => ({
        req,
      }),
      formatError: (error) => {
        logger.error('GraphQL Error:', {
          message: error.message,
          path: error.path,
          extensions: error.extensions,
        });
        return error;
      },
      plugins: [
        {
          async requestDidStart() {
            return {
              async didEncounterErrors(requestContext) {
                logger.error('GraphQL request encountered errors:', {
                  query: requestContext.request.query,
                  variables: requestContext.request.variables,
                  errors: requestContext.errors,
                });
              },
            };
          },
        },
      ],
    });

    await this.apolloServer.start();
    this.apolloServer.applyMiddleware({
      app: this.app as any, // Type assertion needed due to Express version mismatch
      path: '/graphql',
      cors: false, // We're handling CORS at the app level
    });
  }

  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', async (req, res) => {
      const dbHealth = await database.healthCheck();
      
      res.json({
        status: dbHealth.status === 'connected' ? 'OK' : 'ERROR',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        database: {
          status: dbHealth.status,
          responseTime: dbHealth.responseTime,
        },
        jobs: {
          initialized: jobManager.getStatus(),
        },
        memory: {
          usage: process.memoryUsage(),
        },
      });
    });

    // Jobs status endpoint
    this.app.get('/jobs/status', async (req, res) => {
      try {
        const status = await jobManager.getUserSyncStatus();
        res.json({
          success: true,
          data: status,
          timestamp: new Date().toISOString(),
        });
      } catch (error: any) {
        res.status(500).json({
          success: false,
          error: error.message,
        });
      }
    });

    // Trigger manual user sync
    this.app.post('/jobs/trigger/user-sync', async (req, res) => {
      try {
        await jobManager.triggerUserSync();
        res.json({
          success: true,
          message: 'User sync triggered successfully',
          timestamp: new Date().toISOString(),
        });
      } catch (error: any) {
        res.status(500).json({
          success: false,
          error: error.message,
        });
      }
    });

    // Pause user sync jobs
    this.app.post('/jobs/pause', async (req, res) => {
      try {
        await jobManager.pauseUserSync();
        res.json({
          success: true,
          message: 'User sync jobs paused',
        });
      } catch (error: any) {
        res.status(500).json({
          success: false,
          error: error.message,
        });
      }
    });

    // Resume user sync jobs
    this.app.post('/jobs/resume', async (req, res) => {
      try {
        await jobManager.resumeUserSync();
        res.json({
          success: true,
          message: 'User sync jobs resumed',
        });
      } catch (error: any) {
        res.status(500).json({
          success: false,
          error: error.message,
        });
      }
    });

    // Clean up old jobs
    this.app.post('/jobs/cleanup', async (req, res) => {
      try {
        const { gracePeriodHours = 24 } = req.body;
        await jobManager.cleanupJobs(gracePeriodHours);
        res.json({
          success: true,
          message: `Old jobs cleaned up (grace period: ${gracePeriodHours}h)`,
        });
      } catch (error: any) {
        res.status(500).json({
          success: false,
          error: error.message,
        });
      }
    });

    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        message: 'Codex API v2 - GraphQL API with TypeScript, MongoDB/Mongoose',
        version: '2.0.0',
        endpoints: {
          graphql: '/graphql',
          health: '/health',
          jobs: {
            status: '/jobs/status',
            triggerUserSync: '/jobs/trigger/user-sync (POST)',
            pause: '/jobs/pause (POST)',
            resume: '/jobs/resume (POST)',
            cleanup: '/jobs/cleanup (POST)',
          },
        },
        documentation: 'Visit /graphql for GraphQL Playground (development only)',
      });
    });

    // 404 handler (must be after all routes)
    this.app.use(notFoundHandler);

    // Error handler (must be last)
    this.app.use(errorHandler);
  }

  private async connectDatabase(): Promise<void> {
    const config = environment.get();
    await database.connect(config.mongodbUri);
  }

  private async initializeJobs(): Promise<void> {
    try {
      await jobManager.initialize();
      logger.info('Background jobs initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize background jobs:', error);
      // Don't exit - jobs are optional, API should still work
    }
  }

  public async start(): Promise<void> {
    try {
      const config = environment.get();

      // Connect to database
      await this.connectDatabase();

      // Setup middleware
      this.setupMiddleware();

      // Setup Apollo Server
      await this.setupApolloServer();

      // Setup routes
      this.setupRoutes();

      // Initialize background jobs
      // await this.initializeJobs();

      // Start listening
      const server = this.app.listen(config.port, () => {
        logger.info(`Server running on port ${config.port} [${config.nodeEnv}]`);
      });

      // Graceful shutdown
      this.setupGracefulShutdown(server);

    } catch (error) {
      logger.error('Failed to start server:', error);
      process.exit(1);
    }
  }

  private setupGracefulShutdown(server: any): void {
    const shutdown = async (signal: string) => {
      logger.info(`${signal} received, shutting down gracefully...`);

      // Stop accepting new connections
      server.close(async () => {
        logger.info('HTTP server closed');

        // Stop background jobs
        try {
          await jobManager.shutdown();
          logger.info('Job manager stopped');
        } catch (error) {
          logger.error('Error stopping job manager:', error);
        }

        // Stop Apollo Server
        if (this.apolloServer) {
          await this.apolloServer.stop();
          logger.info('Apollo Server stopped');
        }

        // Disconnect from database
        await database.disconnect();
        logger.info('Database disconnected');

        logger.info('Graceful shutdown completed');
        process.exit(0);
      });

      // Force shutdown after 10 seconds
      setTimeout(() => {
        logger.error('Forced shutdown due to timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      shutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection:', { reason, promise });
      shutdown('unhandledRejection');
    });
  }
}

// Start the server
const server = new Server();
server.start();

