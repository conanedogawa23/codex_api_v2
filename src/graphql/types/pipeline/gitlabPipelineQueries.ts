/**
 * GitLab Pipeline GraphQL Queries
 * 5 categories: CORE_DATA, JOBS, TEST_REPORTS, VARIABLES, ARTIFACTS
 */

export const GITLAB_PIPELINE_QUERIES = {
  CORE_DATA: `
    query GetPipelineCoreData($ids: [ID!]!) {
      ciPipelines(ids: $ids) {
        nodes {
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
    query GetPipelineJobs($ids: [ID!]!) {
      ciPipelines(ids: $ids) {
        nodes {
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
    query GetPipelineTestReports($ids: [ID!]!) {
      ciPipelines(ids: $ids) {
        nodes {
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
    query GetPipelineVariables($ids: [ID!]!) {
      ciPipelines(ids: $ids) {
        nodes {
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
    query GetPipelineArtifacts($ids: [ID!]!) {
      ciPipelines(ids: $ids) {
        nodes {
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
    query GetSimplePipelineList($first: Int!, $after: String, $projectPath: ID) {
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

