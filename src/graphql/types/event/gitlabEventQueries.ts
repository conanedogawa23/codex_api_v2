/**
 * GitLab Event GraphQL Queries
 * Events are project-level and use project context
 */

export const GITLAB_EVENT_QUERIES = {
  CORE_DATA: `
    query GetEventCoreData($projectPath: ID!) {
      project(fullPath: $projectPath) {
        events {
          nodes {
            id
            action
            createdAt
            author {
              id
              username
              name
            }
          }
        }
      }
    }
  `,

  SIMPLE_LIST: `
    query GetSimpleEventList($first: Int!, $after: String, $projectPath: ID!) {
      project(fullPath: $projectPath) {
        events(first: $first, after: $after) {
          nodes {
            id
            action
            createdAt
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    }
  `
};

