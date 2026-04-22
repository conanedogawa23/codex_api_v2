import 'reflect-metadata'; // Required for GraphQL Modules
import { createServer, Server as HTTPServer } from 'http';
import type { IncomingMessage } from 'http';
import cookieParser from 'cookie-parser';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { ApolloArmor } from '@escape.tech/graphql-armor';
import { ApolloServer } from 'apollo-server-express';
import { ApolloServerPluginDrainHttpServer } from 'apollo-server-core';
import { WebSocketServer } from 'ws';

import { database } from './config/database';
import { environment } from './config/environment';
import { createGraphqlOperationLogPlugin } from './graphql/plugins/graphqlOperationLogPlugin';
import { schema, createExecution, createExecutor, createSubscription } from './graphql/application';
import { jobManager } from './jobs';
import {
  corsMiddleware,
  errorHandler,
  graphqlOriginAllowlistMiddleware,
  notFoundHandler,
  requestLogger,
  requireJobServiceToken,
  securityMiddleware,
} from './middleware';
import { isOriginAllowedForGraphql } from './middleware/graphqlAllowlist';
import { handleGitLabWebhook } from './routes/gitlabWebhook.routes';
import { mcpBridge } from './services/MCPBridge';
import { buildGraphQLContext } from './utils/auth';
import { logger } from './utils/logger';

const { useServer } = require('graphql-ws/use/ws');

class Server {
  private app: express.Application;
  private apolloServer: ApolloServer | null = null;
  private httpServer: HTTPServer;

  constructor() {
    this.app = express();
    this.httpServer = createServer(this.app);
  }

  private setupMiddleware(): void {
    this.app.disable('x-powered-by');
    if (environment.isProduction()) {
      this.app.set('trust proxy', 1);
    }
    this.app.use(securityMiddleware);
    this.app.use(corsMiddleware);
    this.app.use(cookieParser());
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
    this.app.use(graphqlOriginAllowlistMiddleware);
    this.app.use(requestLogger);
  }

  private async setupApolloServer(): Promise<void> {
    const config = environment.get();
    const executor = createExecutor();
    const execute = createExecution();
    const subscribe = createSubscription();

    const graphqlLimiter = rateLimit({
      windowMs: 60_000,
      max: 500,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req) => {
        const userId = (req as express.Request & { graphqlUserId?: string }).graphqlUserId;
        return userId || req.ip || 'unknown';
      },
    });

    const graphqlAuthOpLimiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 40,
      standardHeaders: true,
      legacyHeaders: false,
      skip: (req) => {
        if (req.path !== '/graphql' || req.method !== 'POST') {
          return true;
        }
        const op = (req.body as { operationName?: string } | undefined)?.operationName;
        return !op || !['requestOTP', 'verifyOTP', 'login'].includes(op);
      },
    });

    const maxGraphqlWsConnections = Number(process.env.GRAPHQL_WS_MAX_CONNECTIONS || 2500);

    const wsServer = new WebSocketServer({
      server: this.httpServer,
      path: '/graphql',
      verifyClient: (info, callback) => {
        if (wsServer.clients.size >= maxGraphqlWsConnections) {
          callback(false, 503, 'Service Unavailable');
          return;
        }
        const origin = info.origin || '';
        if (!origin || isOriginAllowedForGraphql(origin)) {
          callback(true);
          return;
        }
        callback(false, 403, 'Forbidden');
      },
    });

    // Connection cap limits concurrent WS handshakes; per-subscription abuse is mitigated by auth + HTTP rate limits.
    const wsServerCleanup = useServer(
      {
        schema,
        execute,
        subscribe,
        context: async (ctx: { connectionParams?: Record<string, unknown>; extra?: { request?: IncomingMessage } }) => {
          const request = ctx.extra?.request;
          const cookieHeader =
            typeof request?.headers.cookie === 'string' ? request.headers.cookie : undefined;
          return buildGraphQLContext({
            cookieHeader,
            connectionParams: ctx.connectionParams,
          });
        },
      },
      wsServer
    );

    const productionSafeFormatError = (error: {
      message: string;
      path?: readonly (string | number)[];
      extensions?: Record<string, unknown>;
    }) => {
      logger.error('GraphQL Error:', {
        message: error.message,
        path: error.path,
        extensions: error.extensions,
      });
      if (environment.isProduction()) {
        return {
          message: error.message,
          path: error.path,
          extensions: {
            code: error.extensions?.code,
          },
        };
      }
      return error;
    };

    const graphqlArmor = new ApolloArmor({
      blockFieldSuggestion: { enabled: false },
      costLimit: { maxCost: 75_000 },
      maxAliases: { n: 25 },
      maxDepth: { n: 15 },
    }).protect();

    this.apolloServer = new ApolloServer({
      schema,
      executor,
      introspection: config.graphqlIntrospection && !environment.isProduction(),
      csrfPrevention: true,
      validationRules: graphqlArmor.validationRules,
      context: async ({ req, res }) => {
        const ctx = await buildGraphQLContext({
          req: req as express.Request,
          res: res as express.Response,
        });
        (req as express.Request & { graphqlUserId?: string }).graphqlUserId =
          ctx.currentUser?.userId ?? undefined;
        return ctx;
      },
      formatError: productionSafeFormatError,
      plugins: [
        ApolloServerPluginDrainHttpServer({ httpServer: this.httpServer }),
        ...graphqlArmor.plugins,
        createGraphqlOperationLogPlugin(),
        {
          async serverWillStart() {
            return {
              async drainServer() {
                await wsServerCleanup.dispose();
              },
            };
          },
        },
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

    this.app.use('/graphql', graphqlAuthOpLimiter, graphqlLimiter);

    this.apolloServer.applyMiddleware({
      app: this.app as Parameters<ApolloServer['applyMiddleware']>[0]['app'],
      path: '/graphql',
      cors: false,
    });
  }

  private setupRoutes(): void {
    const jobLimiter = rateLimit({
      windowMs: 60_000,
      max: 10,
      standardHeaders: true,
      legacyHeaders: false,
    });

    this.app.get('/health', (_req, res) => {
      res.json({ status: 'ok' });
    });

    this.app.get('/health/detailed', requireJobServiceToken, jobLimiter, async (_req, res) => {
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

    const jobsRouter = express.Router();
    jobsRouter.use(requireJobServiceToken);
    jobsRouter.use(jobLimiter);

    jobsRouter.get('/status', async (_req, res) => {
      try {
        const status = await jobManager.getUserSyncStatus();
        res.json({
          success: true,
          data: status,
          timestamp: new Date().toISOString(),
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({
          success: false,
          error: message,
        });
      }
    });

    jobsRouter.post('/trigger/user-sync', async (_req, res) => {
      try {
        await jobManager.triggerUserSync();
        res.json({
          success: true,
          message: 'User sync triggered successfully',
          timestamp: new Date().toISOString(),
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({
          success: false,
          error: message,
        });
      }
    });

    jobsRouter.post('/trigger/project-sync', async (_req, res) => {
      try {
        await jobManager.triggerProjectSync();
        res.json({
          success: true,
          message: 'Project sync triggered successfully',
          timestamp: new Date().toISOString(),
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({
          success: false,
          error: message,
        });
      }
    });

    jobsRouter.post('/trigger/merge-request-sync', async (req, res) => {
      try {
        await jobManager.triggerMergeRequestSync(req.body || {});
        res.json({
          success: true,
          message: 'Merge request sync triggered successfully',
          timestamp: new Date().toISOString(),
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({
          success: false,
          error: message,
        });
      }
    });

    jobsRouter.post('/trigger/issue-sync', async (_req, res) => {
      try {
        await jobManager.triggerIssueSync();
        res.json({
          success: true,
          message: 'Issue sync triggered successfully',
          timestamp: new Date().toISOString(),
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({
          success: false,
          error: message,
        });
      }
    });

    jobsRouter.post('/trigger/namespace-sync', async (_req, res) => {
      try {
        await jobManager.triggerNamespaceSync();
        res.json({
          success: true,
          message: 'Namespace sync triggered successfully',
          timestamp: new Date().toISOString(),
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({
          success: false,
          error: message,
        });
      }
    });

    jobsRouter.post('/trigger/pipeline-sync', async (req, res) => {
      try {
        await jobManager.triggerPipelineSync(req.body || {});
        res.json({
          success: true,
          message: 'Pipeline sync triggered successfully',
          timestamp: new Date().toISOString(),
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({
          success: false,
          error: message,
        });
      }
    });

    jobsRouter.post('/trigger/commit-sync', async (req, res) => {
      try {
        await jobManager.triggerCommitSync(req.body || {});
        res.json({
          success: true,
          message: 'Commit sync triggered successfully',
          timestamp: new Date().toISOString(),
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({
          success: false,
          error: message,
        });
      }
    });

    jobsRouter.post('/trigger/label-sync', async (_req, res) => {
      try {
        await jobManager.triggerLabelSync();
        res.json({
          success: true,
          message: 'Label sync triggered successfully',
          timestamp: new Date().toISOString(),
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({
          success: false,
          error: message,
        });
      }
    });

    jobsRouter.post('/trigger/milestone-sync', async (_req, res) => {
      try {
        await jobManager.triggerMilestoneSync();
        res.json({
          success: true,
          message: 'Milestone sync triggered successfully',
          timestamp: new Date().toISOString(),
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({
          success: false,
          error: message,
        });
      }
    });

    jobsRouter.post('/trigger/iteration-sync', async (_req, res) => {
      try {
        await jobManager.triggerIterationSync();
        res.json({
          success: true,
          message: 'Iteration sync triggered successfully',
          timestamp: new Date().toISOString(),
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({
          success: false,
          error: message,
        });
      }
    });

    jobsRouter.post('/trigger/event-sync', async (_req, res) => {
      try {
        await jobManager.triggerEventSync();
        res.json({
          success: true,
          message: 'Event sync triggered successfully',
          timestamp: new Date().toISOString(),
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({
          success: false,
          error: message,
        });
      }
    });

    jobsRouter.post('/trigger/all', async (_req, res) => {
      try {
        await jobManager.triggerUserSync();
        await jobManager.triggerProjectSync();
        await jobManager.triggerMergeRequestSync();
        await jobManager.triggerIssueSync();
        await jobManager.triggerNamespaceSync();
        await jobManager.triggerPipelineSync();
        await jobManager.triggerCommitSync();
        await jobManager.triggerLabelSync();
        await jobManager.triggerMilestoneSync();
        await jobManager.triggerIterationSync();
        await jobManager.triggerEventSync();
        res.json({
          success: true,
          message: 'All syncs triggered successfully',
          timestamp: new Date().toISOString(),
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({
          success: false,
          error: message,
        });
      }
    });

    jobsRouter.post('/pause', async (_req, res) => {
      try {
        await jobManager.pauseUserSync();
        res.json({
          success: true,
          message: 'User sync jobs paused',
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({
          success: false,
          error: message,
        });
      }
    });

    jobsRouter.post('/resume', async (_req, res) => {
      try {
        await jobManager.resumeUserSync();
        res.json({
          success: true,
          message: 'User sync jobs resumed',
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({
          success: false,
          error: message,
        });
      }
    });

    jobsRouter.post('/cleanup', async (req, res) => {
      try {
        const { gracePeriodHours = 24 } = req.body as { gracePeriodHours?: number };
        await jobManager.cleanupJobs(gracePeriodHours);
        res.json({
          success: true,
          message: `Old jobs cleaned up (grace period: ${gracePeriodHours}h)`,
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({
          success: false,
          error: message,
        });
      }
    });

    this.app.use('/jobs', jobsRouter);

    this.app.post('/webhooks/gitlab', handleGitLabWebhook);

    this.app.get('/', (_req, res) => {
      res.json({ status: 'ok' });
    });

    this.app.use(notFoundHandler);

    this.app.use(errorHandler);
  }

  private async connectDatabase(): Promise<void> {
    const config = environment.get();
    await database.connect(config.mongodbUri);
  }

  public async start(): Promise<void> {
    try {
      const config = environment.get();

      await this.connectDatabase();

      this.setupMiddleware();

      await this.setupApolloServer();

      this.setupRoutes();

      this.httpServer.listen(config.port, () => {
        logger.info(`Server running on port ${config.port} [${config.nodeEnv}]`);
      });

      this.setupGracefulShutdown(this.httpServer);
    } catch (error) {
      logger.error('Failed to start server:', error);
      process.exit(1);
    }
  }

  private setupGracefulShutdown(server: HTTPServer): void {
    const shutdown = async (signal: string) => {
      logger.info(`${signal} received, shutting down gracefully...`);

      server.close(async () => {
        logger.info('HTTP server closed');

        try {
          await jobManager.shutdown();
          logger.info('Job manager stopped');
        } catch (error) {
          logger.error('Error stopping job manager:', error);
        }

        try {
          await mcpBridge.dispose();
          logger.info('GitLab MCP bridge stopped');
        } catch (error) {
          logger.error('Error stopping GitLab MCP bridge:', error);
        }

        if (this.apolloServer) {
          await this.apolloServer.stop();
          logger.info('Apollo Server stopped');
        }

        await database.disconnect();
        logger.info('Database disconnected');

        logger.info('Graceful shutdown completed');
        process.exit(0);
      });

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

const server = new Server();
server.start();
