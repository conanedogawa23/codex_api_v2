/**
 * GitLab Discussion GraphQL Queries
 * 2 categories: CORE_DATA, NOTES
 */

export const GITLAB_DISCUSSION_QUERIES = {
  CORE_DATA: `
    query GetDiscussionCoreData($ids: [ID!]!) {
      discussions(ids: $ids) {
        nodes {
          id
          createdAt
          resolved
          resolvable
          resolvedAt
          resolvedBy {
            id
            username
            name
          }
        }
      }
    }
  `,

  NOTES: `
    query GetDiscussionNotes($ids: [ID!]!) {
      discussions(ids: $ids) {
        nodes {
          id
          notes {
            nodes {
              id
              body
              createdAt
              updatedAt
              system
              author {
                id
                username
                name
              }
            }
          }
        }
      }
    }
  `,

  SIMPLE_LIST: `
    query GetSimpleDiscussionList($first: Int!, $after: String) {
      discussions(first: $first, after: $after) {
        nodes {
          id
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

