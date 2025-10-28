/**
 * GitLab Milestone GraphQL Queries
 * 4 categories: CORE_DATA, ISSUES, MERGE_REQUESTS, STATISTICS
 */

export const GITLAB_MILESTONE_QUERIES = {
  CORE_DATA: `
    query GetMilestoneCoreData($ids: [ID!]!) {
      milestones(ids: $ids) {
        nodes {
          id
          iid
          title
          description
          state
          webPath
          dueDate
          startDate
          createdAt
          updatedAt
          expired
          project {
            id
            name
            fullPath
          }
        }
      }
    }
  `,

  ISSUES: `
    query GetMilestoneIssues($ids: [ID!]!) {
      milestones(ids: $ids) {
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

  MERGE_REQUESTS: `
    query GetMilestoneMergeRequests($ids: [ID!]!) {
      milestones(ids: $ids) {
        nodes {
          id
          mergeRequests {
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

  STATISTICS: `
    query GetMilestoneStatistics($ids: [ID!]!) {
      milestones(ids: $ids) {
        nodes {
          id
          stats {
            totalIssuesCount
            closedIssuesCount
          }
        }
      }
    }
  `,

  SIMPLE_LIST: `
    query GetSimpleMilestoneList($first: Int!, $after: String, $projectPath: ID) {
      project(fullPath: $projectPath) {
        milestones(first: $first, after: $after) {
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
    }
  `
};

