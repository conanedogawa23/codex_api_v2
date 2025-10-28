/**
 * GitLab Iteration GraphQL Queries
 * 2 categories: CORE_DATA, ISSUES
 */

export const GITLAB_ITERATION_QUERIES = {
  CORE_DATA: `
    query GetIterationCoreData($ids: [ID!]!) {
      iterations(ids: $ids) {
        nodes {
          id
          iid
          title
          description
          state
          startDate
          dueDate
          createdAt
          updatedAt
          webPath
        }
      }
    }
  `,

  ISSUES: `
    query GetIterationIssues($ids: [ID!]!) {
      iterations(ids: $ids) {
        nodes {
          id
          issues {
            nodes {
              id
              iid
              title
              state
            }
            count
          }
        }
      }
    }
  `,

  SIMPLE_LIST: `
    query GetSimpleIterationList($first: Int!, $after: String) {
      iterations(first: $first, after: $after) {
        nodes {
          id
          iid
          title
          state
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  `
};

