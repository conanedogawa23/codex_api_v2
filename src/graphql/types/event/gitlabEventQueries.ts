/**
 * GitLab Event GraphQL Queries
 * 1 category: CORE_DATA (simple entity)
 */

export const GITLAB_EVENT_QUERIES = {
  CORE_DATA: `
    query GetEventCoreData($ids: [ID!]!) {
      events(ids: $ids) {
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
  `,

  SIMPLE_LIST: `
    query GetSimpleEventList($first: Int!, $after: String) {
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
  `
};

