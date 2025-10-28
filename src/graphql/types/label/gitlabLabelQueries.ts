/**
 * GitLab Label GraphQL Queries
 * 3 categories: CORE_DATA, USAGE_STATS, RELATED_ISSUES
 */

export const GITLAB_LABEL_QUERIES = {
  CORE_DATA: `
    query GetLabelCoreData($ids: [ID!]!) {
      labels(ids: $ids) {
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
  `,

  USAGE_STATS: `
    query GetLabelUsageStats($ids: [ID!]!) {
      labels(ids: $ids) {
        nodes {
          id
        }
      }
    }
  `,

  RELATED_ISSUES: `
    query GetLabelRelatedIssues($ids: [ID!]!) {
      labels(ids: $ids) {
        nodes {
          id
        }
      }
    }
  `,

  SIMPLE_LIST: `
    query GetSimpleLabelList($first: Int!, $after: String, $projectPath: ID) {
      project(fullPath: $projectPath) {
        labels(first: $first, after: $after) {
          nodes {
            id
            title
            color
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

