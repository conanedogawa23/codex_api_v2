/**
 * GitLab Commit GraphQL Queries
 * 4 categories: CORE_DATA, DIFF_STATS, REFERENCES, SIGNATURES
 */

export const GITLAB_COMMIT_QUERIES = {
  CORE_DATA: `
    query GetCommitCoreData($projectPath: ID!, $sha: String!) {
      project(fullPath: $projectPath) {
        repository {
          commit(sha: $sha) {
            id
            sha
            shortId
            title
            fullTitle
            message
            authoredDate
            committedDate
            webUrl
            author {
              id
              username
              name
              avatarUrl
            }
            committer {
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

  DIFF_STATS: `
    query GetCommitDiffStats($projectPath: ID!, $sha: String!) {
      project(fullPath: $projectPath) {
        repository {
          commit(sha: $sha) {
            id
            stats {
              additions
              deletions
              total
            }
          }
        }
      }
    }
  `,

  REFERENCES: `
    query GetCommitReferences($projectPath: ID!, $sha: String!) {
      project(fullPath: $projectPath) {
        repository {
          commit(sha: $sha) {
            id
            pipelines {
              nodes {
                id
                iid
                status
              }
            }
          }
        }
      }
    }
  `,

  SIGNATURES: `
    query GetCommitSignatures($projectPath: ID!, $sha: String!) {
      project(fullPath: $projectPath) {
        repository {
          commit(sha: $sha) {
            id
            signature {
              gpgKeyId
              verificationStatus
            }
          }
        }
      }
    }
  `,

  SIMPLE_LIST: `
    query GetSimpleCommitList($projectPath: ID!) {
      project(fullPath: $projectPath) {
        repository {
          tree {
            lastCommit {
              id
              sha
              shortId
              title
              authoredDate
            }
          }
        }
      }
    }
  `
};

