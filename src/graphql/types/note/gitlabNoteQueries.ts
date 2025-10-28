/**
 * GitLab Note GraphQL Queries
 * 2 categories: CORE_DATA, REACTIONS
 */

export const GITLAB_NOTE_QUERIES = {
  CORE_DATA: `
    query GetNoteCoreData($ids: [ID!]!) {
      notes(ids: $ids) {
        nodes {
          id
          body
          bodyHtml
          createdAt
          updatedAt
          system
          internal
          noteable {
            __typename
            ... on Issue {
              id
              iid
            }
            ... on MergeRequest {
              id
              iid
            }
          }
          author {
            id
            username
            name
            avatarUrl
          }
        }
      }
    }
  `,

  REACTIONS: `
    query GetNoteReactions($ids: [ID!]!) {
      notes(ids: $ids) {
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
  `,

  SIMPLE_LIST: `
    query GetSimpleNoteList($first: Int!, $after: String) {
      notes(first: $first, after: $after) {
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

