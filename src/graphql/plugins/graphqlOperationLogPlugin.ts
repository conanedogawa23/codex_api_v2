import type { ApolloServerPlugin } from 'apollo-server-plugin-base';
import type { GraphQLRequestContext } from 'apollo-server-types';

import { getRequestClientIp } from '../../utils/auditLogWrite';
import type { GraphQLContext } from '../../utils/auth';
import { logger } from '../../utils/logger';

export function createGraphqlOperationLogPlugin(): ApolloServerPlugin<GraphQLContext> {
  return {
    async requestDidStart(requestContext: GraphQLRequestContext<GraphQLContext>) {
      const start = Date.now();
      return {
        async willSendResponse(ctx: GraphQLRequestContext<GraphQLContext>) {
          const durationMs = Date.now() - start;
          const gqlCtx = ctx.context;
          const errorCount = ctx.errors?.length ?? 0;
          const firstError = errorCount > 0 ? ctx.errors?.[0] : undefined;
          const errorCode =
            firstError && typeof firstError.extensions?.code === 'string'
              ? firstError.extensions.code
              : firstError
                ? 'GRAPHQL_ERROR'
                : undefined;
          const userAgent = gqlCtx?.req?.headers['user-agent'];
          const userAgentStr = typeof userAgent === 'string' ? userAgent : undefined;

          logger.info('graphql_operation', {
            durationMs,
            errorCode: errorCode ?? null,
            errorCount,
            ip: getRequestClientIp(gqlCtx?.req) ?? null,
            operationName: requestContext.request.operationName,
            pluginService: gqlCtx?.pluginServiceAuthenticated === true,
            status: errorCount > 0 ? 'error' : 'ok',
            userAgent: userAgentStr ?? null,
            userId: gqlCtx?.currentUser?.userId ?? null,
          });
        },
      };
    },
  };
}
