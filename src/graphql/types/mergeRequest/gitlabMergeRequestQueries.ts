/**
 * GitLab Merge Request GraphQL Queries
 * 
 * Organized into 8 independent categories for parallel execution:
 * 1. CORE_DATA - Basic MR information
 * 2. REVIEWERS_ASSIGNEES - People involved (reviewers, assignees, author)
 * 3. APPROVALS - Approval status and rules
 * 4. PIPELINES - Associated pipelines
 * 5. DIFF_STATS - Changes statistics
 * 6. DISCUSSIONS - Conversation threads
 * 7. COMMITS - Commits in MR
 * 8. CHANGES - File changes
 */

export const GITLAB_MERGE_REQUEST_QUERIES = {
  /**
   * Core MR Data Query
   * Fetches essential merge request information
   */
  CORE_DATA: `
    query GetMergeRequestCoreData($ids: [ID!]!) {
      mergeRequests(ids: $ids) {
        nodes {
          id
          iid
          title
          titleHtml
          description
          descriptionHtml
          state
          mergedAt
          createdAt
          updatedAt
          targetBranch
          sourceBranch
          upvotes
          downvotes
          userNotesCount
          draft
          workInProgress
          mergeWhenPipelineSucceeds
          shouldRemoveSourceBranch
          forceRemoveSourceBranch
          squash
          squashOnMerge
          rebaseInProgress
          mergeError
          mergeStatus
          detailedMergeStatus
          webUrl
          reference
          references {
            full
            short
          }
          hasConflicts
          conflictResolutionStatus
          divergedFromTargetBranch
          mergeable
          mergeableDiscussionsState
          userDiscussionsCount
          project {
            id
            name
            fullPath
          }
          milestone {
            id
            title
          }
          labels {
            nodes {
              id
              title
              color
            }
          }
        }
      }
    }
  `,

  /**
   * Reviewers and Assignees Query
   * Fetches people involved with the MR
   */
  REVIEWERS_ASSIGNEES: `
    query GetMergeRequestReviewersAssignees($ids: [ID!]!) {
      mergeRequests(ids: $ids) {
        nodes {
          id
          author {
            id
            username
            name
            avatarUrl
            webUrl
            state
          }
          assignees {
            nodes {
              id
              username
              name
              avatarUrl
              webUrl
              state
            }
          }
          reviewers {
            nodes {
              id
              username
              name
              avatarUrl
              webUrl
              state
            }
          }
          mergedBy {
            id
            username
            name
            avatarUrl
          }
        }
      }
    }
  `,

  /**
   * Approvals Query
   * Fetches approval status and rules
   */
  APPROVALS: `
    query GetMergeRequestApprovals($ids: [ID!]!) {
      mergeRequests(ids: $ids) {
        nodes {
          id
          approved
          approvedBy {
            nodes {
              id
              username
              name
              avatarUrl
            }
          }
          approvalsLeft
          approvalsRequired
          approvalState {
            rules {
              nodes {
                id
                name
                type
                approvalsRequired
                approved
                eligibleApprovers {
                  nodes {
                    id
                    username
                    name
                  }
                }
                approvedBy {
                  nodes {
                    id
                    username
                    name
                  }
                }
              }
            }
          }
        }
      }
    }
  `,

  /**
   * Pipelines Query
   * Fetches associated CI/CD pipelines
   */
  PIPELINES: `
    query GetMergeRequestPipelines($ids: [ID!]!) {
      mergeRequests(ids: $ids) {
        nodes {
          id
          headPipeline {
            id
            iid
            status
            detailedStatus {
              text
              label
              icon
            }
            createdAt
            updatedAt
            startedAt
            finishedAt
            duration
            queuedDuration
            coverage
            ref
            sha
            beforeSha
            webPath
          }
          pipelines {
            nodes {
              id
              iid
              status
              ref
              sha
              createdAt
              updatedAt
            }
            count
          }
        }
      }
    }
  `,

  /**
   * Diff Stats Query
   * Fetches changes statistics
   */
  DIFF_STATS: `
    query GetMergeRequestDiffStats($ids: [ID!]!) {
      mergeRequests(ids: $ids) {
        nodes {
          id
          diffStats {
            additions
            deletions
            fileCount
          }
          diffStatsSummary {
            additions
            deletions
            changes
            fileCount
          }
        }
      }
    }
  `,

  /**
   * Discussions Query
   * Fetches conversation threads
   */
  DISCUSSIONS: `
    query GetMergeRequestDiscussions($ids: [ID!]!) {
      mergeRequests(ids: $ids) {
        nodes {
          id
          discussions {
            nodes {
              id
              createdAt
              resolved
              resolvable
              resolvedAt
              resolvedBy {
                id
                username
                name
              }
              notes {
                nodes {
                  id
                  body
                  bodyHtml
                  createdAt
                  updatedAt
                  system
                  author {
                    id
                    username
                    name
                  }
                }
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      }
    }
  `,

  /**
   * Commits Query
   * Fetches commits in the MR
   */
  COMMITS: `
    query GetMergeRequestCommits($ids: [ID!]!) {
      mergeRequests(ids: $ids) {
        nodes {
          id
          commits {
            nodes {
              id
              sha
              shortId
              title
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
            count
          }
          commitCount
        }
      }
    }
  `,

  /**
   * Changes Query
   * Fetches file changes (diffs)
   */
  CHANGES: `
    query GetMergeRequestChanges($ids: [ID!]!) {
      mergeRequests(ids: $ids) {
        nodes {
          id
          diffRefs {
            baseSha
            headSha
            startSha
          }
          diffHeadSha
        }
      }
    }
  `,

  /**
   * Simple MR List Query
   * Used for fetching MR IDs for batch processing
   */
  SIMPLE_LIST: `
    query GetSimpleMergeRequestList($first: Int!, $after: String, $projectPath: ID) {
      project(fullPath: $projectPath) {
        mergeRequests(first: $first, after: $after) {
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
  `,

  /**
   * Simple MR List Query (All MRs)
   * For fetching MRs across all projects
   */
  SIMPLE_LIST_ALL: `
    query GetAllSimpleMergeRequests($first: Int!, $after: String) {
      mergeRequests(first: $first, after: $after) {
        nodes {
          id
          iid
          title
          state
          project {
            id
            fullPath
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  `
};

