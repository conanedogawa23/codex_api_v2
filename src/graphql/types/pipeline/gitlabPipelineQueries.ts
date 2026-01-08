/**
 * GitLab Pipeline GraphQL Queries
 * 5 categories: CORE_DATA, JOBS, TEST_REPORTS, VARIABLES, ARTIFACTS
 */

export const GITLAB_PIPELINE_QUERIES = {
  CORE_DATA: `
    query GetPipelineCoreData($projectPath: ID!, $iid: ID!) {
      project(fullPath: $projectPath) {
        pipeline(iid: $iid) {
          id
          iid
          status
          detailedStatus {
            text
            label
            icon
            group
          }
          ref
          sha
          beforeSha
          tag
          yaml
          source
          duration
          queuedDuration
          coverage
          createdAt
          updatedAt
          startedAt
          finishedAt
          committedAt
          webPath
          project {
            id
            name
            fullPath
          }
          user {
            id
            username
            name
            avatarUrl
          }
          commit {
            id
            sha
            title
            authoredDate
          }
        }
      }
    }
  `,

  JOBS: `
    query GetPipelineJobs($projectPath: ID!, $iid: ID!) {
      project(fullPath: $projectPath) {
        pipeline(iid: $iid) {
          id
          jobs {
            nodes {
              id
              name
              status
              stage
              duration
              queuedDuration
              createdAt
              startedAt
              finishedAt
              coverage
              webPath
              detailedStatus {
                text
                label
                icon
              }
            }
            count
          }
        }
      }
    }
  `,

  TEST_REPORTS: `
    query GetPipelineTestReports($projectPath: ID!, $iid: ID!) {
      project(fullPath: $projectPath) {
        pipeline(iid: $iid) {
          id
          testReportSummary {
            total {
              count
              success
              failed
              skipped
              error
            }
          }
        }
      }
    }
  `,

  VARIABLES: `
    query GetPipelineVariables($projectPath: ID!, $iid: ID!) {
      project(fullPath: $projectPath) {
        pipeline(iid: $iid) {
          id
          variables {
            nodes {
              id
              key
              value
              variableType
            }
          }
        }
      }
    }
  `,

  ARTIFACTS: `
    query GetPipelineArtifacts($projectPath: ID!, $iid: ID!) {
      project(fullPath: $projectPath) {
        pipeline(iid: $iid) {
          id
          jobs {
            nodes {
              id
              artifacts {
                nodes {
                  id
                  name
                  fileType
                  size
                  downloadPath
                }
              }
            }
          }
        }
      }
    }
  `,

  SIMPLE_LIST: `
    query GetSimplePipelineList($first: Int!, $after: String, $projectPath: ID!) {
      project(fullPath: $projectPath) {
        pipelines(first: $first, after: $after) {
          nodes {
            id
            iid
            status
            ref
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

