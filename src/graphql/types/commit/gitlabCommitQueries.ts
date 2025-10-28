/**
 * GitLab Commit GraphQL Queries
 * 4 categories: CORE_DATA, DIFF_STATS, REFERENCES, SIGNATURES
 */

export const GITLAB_COMMIT_QUERIES = {
  CORE_DATA: `
    query GetCommitCoreData($ids: [ID!]!) {
      commits(ids: $ids) {
        nodes {
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
  `,

  DIFF_STATS: `
    query GetCommitDiffStats($ids: [ID!]!) {
      commits(ids: $ids) {
        nodes {
          id
          stats {
            additions
            deletions
            total
          }
        }
      }
    }
  `,

  REFERENCES: `
    query GetCommitReferences($ids: [ID!]!) {
      commits(ids: $ids) {
        nodes {
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
  `,

  SIGNATURES: `
    query GetCommitSignatures($ids: [ID!]!) {
      commits(ids: $ids) {
        nodes {
          id
          signature {
            gpgKeyId
            verificationStatus
          }
        }
      }
    }
  `,

  SIMPLE_LIST: `
    query GetSimpleCommitList($first: Int!, $after: String, $projectPath: ID!) {
      project(fullPath: $projectPath) {
        repository {
          tree {
            lastCommit {
              id
              sha
            }
          }
        }
      }
    }
  `
};

