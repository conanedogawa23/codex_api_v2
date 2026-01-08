/**
 * GitLab Note GraphQL Queries
 * Note: Notes must be queried in context (Discussion, MR, or Issue)
 * These queries use merge request context as an example
 */

export const GITLAB_NOTE_QUERIES = {
  CORE_DATA: `
    query GetNoteCoreData($mergeRequestId: MergeRequestID!) {
      mergeRequest(id: $mergeRequestId) {
        notes {
          nodes {
            id
            body
            bodyHtml
            createdAt
            updatedAt
            system
            internal
            author {
              id
              username
              name
              avatarUrl
            }
          }
        }
      }
    }
  `,

  REACTIONS: `
    query GetNoteReactions($mergeRequestId: MergeRequestID!) {
      mergeRequest(id: $mergeRequestId) {
        notes {
          nodes {
            id
            awardEmoji {
              nodes {
                name
                user {
                  id
                  username
                }
              }
            }
          }
        }
      }
    }
  `,

  SIMPLE_LIST: `
    query GetSimpleNoteList($first: Int!, $after: String, $mergeRequestId: MergeRequestID!) {
      mergeRequest(id: $mergeRequestId) {
        notes(first: $first, after: $after) {
          nodes {
            id
            body
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

