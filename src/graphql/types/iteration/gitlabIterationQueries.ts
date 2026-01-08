/**
 * GitLab Iteration GraphQL Queries
 * Iterations are group-level entities
 */

export const GITLAB_ITERATION_QUERIES = {
  CORE_DATA: `
    query GetIterationCoreData($groupPath: ID!, $iterationId: IterationID!) {
      group(fullPath: $groupPath) {
        iterations(first: 100) {
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
    }
  `,

  ISSUES: `
    query GetIterationIssues($groupPath: ID!, $iterationId: IterationID!) {
      group(fullPath: $groupPath) {
        iterations(first: 100) {
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
    }
  `,

  SIMPLE_LIST: `
    query GetSimpleIterationList($first: Int!, $after: String, $groupPath: ID!) {
      group(fullPath: $groupPath) {
        iterations(first: $first, after: $after) {
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
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    }
  `
};

