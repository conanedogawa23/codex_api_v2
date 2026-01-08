/**
 * GitLab Label GraphQL Queries
 * Labels are fetched from project context
 * Note: GitLab API doesn't support individual label queries, so we fetch from project lists
 */

export const GITLAB_LABEL_QUERIES = {
  CORE_DATA: `
    query GetLabelCoreData($projectPath: ID!, $labelId: ID!) {
      project(fullPath: $projectPath) {
        labels(first: 100) {
          nodes {
            id
            title
            description
            descriptionHtml
            color
            textColor
            createdAt
            updatedAt
          }
        }
      }
    }
  `,

  USAGE_STATS: `
    query GetLabelUsageStats($projectPath: ID!, $labelId: ID!) {
      project(fullPath: $projectPath) {
        labels(first: 100) {
          nodes {
            id
          }
        }
      }
    }
  `,

  RELATED_ISSUES: `
    query GetLabelRelatedIssues($projectPath: ID!, $labelId: ID!) {
      project(fullPath: $projectPath) {
        labels(first: 100) {
          nodes {
            id
          }
        }
      }
    }
  `,

  SIMPLE_LIST: `
    query GetSimpleLabelList($first: Int!, $after: String, $projectPath: ID!) {
      project(fullPath: $projectPath) {
        labels(first: $first, after: $after) {
          nodes {
            id
            title
            description
            descriptionHtml
            color
            textColor
            createdAt
            updatedAt
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

