/**
 * GitLab Milestone GraphQL Queries
 * 4 categories: CORE_DATA, ISSUES, MERGE_REQUESTS, STATISTICS
 */

export const GITLAB_MILESTONE_QUERIES = {
  CORE_DATA: `
    query GetMilestoneCoreData($projectPath: ID!, $id: MilestoneID!) {
      project(fullPath: $projectPath) {
        milestone(id: $id) {
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
    query GetMilestoneIssues($projectPath: ID!, $id: MilestoneID!) {
      project(fullPath: $projectPath) {
        milestone(id: $id) {
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
    query GetMilestoneMergeRequests($projectPath: ID!, $id: MilestoneID!) {
      project(fullPath: $projectPath) {
        milestone(id: $id) {
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
    query GetMilestoneStatistics($projectPath: ID!, $id: MilestoneID!) {
      project(fullPath: $projectPath) {
        milestone(id: $id) {
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
    query GetSimpleMilestoneList($first: Int!, $after: String, $projectPath: ID!) {
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

