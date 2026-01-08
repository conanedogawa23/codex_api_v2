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
   * Fetches essential merge request information for a single MR
   */
  CORE_DATA: `
    query GetMergeRequestCoreData($id: MergeRequestID!) {
      mergeRequest(id: $id) {
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
  `,

  /**
   * Reviewers and Assignees Query
   * Fetches people involved with the MR
   */
  REVIEWERS_ASSIGNEES: `
    query GetMergeRequestReviewersAssignees($id: MergeRequestID!) {
      mergeRequest(id: $id) {
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
  `,

  /**
   * Approvals Query
   * Fetches approval status and rules
   */
  APPROVALS: `
    query GetMergeRequestApprovals($id: MergeRequestID!) {
      mergeRequest(id: $id) {
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
      }
    }
  `,

  /**
   * Pipelines Query
   * Fetches associated CI/CD pipelines
   */
  PIPELINES: `
    query GetMergeRequestPipelines($id: MergeRequestID!) {
      mergeRequest(id: $id) {
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
  `,

  /**
   * Diff Stats Query
   * Fetches changes statistics
   */
  DIFF_STATS: `
    query GetMergeRequestDiffStats($id: MergeRequestID!) {
      mergeRequest(id: $id) {
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
  `,

  /**
   * Discussions Query
   * Fetches conversation threads
   */
  DISCUSSIONS: `
    query GetMergeRequestDiscussions($id: MergeRequestID!) {
      mergeRequest(id: $id) {
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
  `,

  /**
   * Commits Query
   * Fetches commits in the MR
   */
  COMMITS: `
    query GetMergeRequestCommits($id: MergeRequestID!) {
      mergeRequest(id: $id) {
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
  `,

  /**
   * Changes Query
   * Fetches file changes (diffs)
   */
  CHANGES: `
    query GetMergeRequestChanges($id: MergeRequestID!) {
      mergeRequest(id: $id) {
        id
        diffRefs {
          baseSha
          headSha
          startSha
        }
        diffHeadSha
      }
    }
  `,

  /**
   * Simple MR List Query
   * Used for fetching MR IDs for batch processing for a specific project
   */
  SIMPLE_LIST: `
    query GetSimpleMergeRequestList($first: Int!, $after: String, $projectPath: ID!) {
      project(fullPath: $projectPath) {
        id
        fullPath
        mergeRequests(first: $first, after: $after, sort: UPDATED_DESC) {
          nodes {
            id
            iid
            title
            state
            updatedAt
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
    }
  `,

  /**
   * Simple MR List Query (All MRs)
   * For fetching MRs across all projects
   * Note: This query may not be supported on all GitLab instances
   */
  SIMPLE_LIST_ALL: `
    query GetAllSimpleMergeRequests($first: Int!, $after: String) {
      mergeRequests(first: $first, after: $after, sort: UPDATED_DESC) {
        nodes {
          id
          iid
          title
          state
          updatedAt
          sourceBranch
          targetBranch
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
  `,

  /**
   * Simple MR List by Projects Query
   * For fetching MRs from multiple specific projects
   */
  SIMPLE_LIST_BY_PROJECTS: `
    query GetMergeRequestsByProjects($projectPath: ID!, $first: Int!, $after: String) {
      project(fullPath: $projectPath) {
        id
        fullPath
        mergeRequests(first: $first, after: $after, sort: UPDATED_DESC) {
          nodes {
            id
            iid
            title
            state
            updatedAt
            sourceBranch
            targetBranch
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

