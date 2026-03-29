/**
 * GitLab Event GraphQL Queries
 * GitLab's GraphQL schema in this deployment does not expose the
 * cross-project event feeds needed by the sync pipeline.
 *
 * Event sync now uses the REST project events endpoint via `gitlabApi.ts`.
 */

export const GITLAB_EVENT_QUERIES = Object.freeze({});

