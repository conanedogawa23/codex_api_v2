/**
 * GitLab Discussion GraphQL Queries
 * Note: Discussions must be queried in context (MR or Issue)
 * These queries use merge request context as an example
 */

export const GITLAB_DISCUSSION_QUERIES = {
  CORE_DATA: `
    query GetDiscussionCoreData($mergeRequestId: MergeRequestID!) {
      mergeRequest(id: $mergeRequestId) {
        discussions {
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
    }
  `,

  NOTES: `
    query GetDiscussionNotes($mergeRequestId: MergeRequestID!) {
      mergeRequest(id: $mergeRequestId) {
        discussions {
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
    }
  `,

  SIMPLE_LIST: `
    query GetSimpleDiscussionList($first: Int!, $after: String, $mergeRequestId: MergeRequestID!) {
      mergeRequest(id: $mergeRequestId) {
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
    }
  `
};

