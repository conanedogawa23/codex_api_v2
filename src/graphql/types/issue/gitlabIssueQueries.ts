/**
 * GitLab Issue GraphQL Queries
 * 
 * Organized into 6 independent categories for parallel execution:
 * 1. CORE_DATA - Basic issue information
 * 2. ASSIGNEES_AUTHOR - People involved (assignees, author)
 * 3. LABELS_MILESTONES - Categorization (labels, milestones, epic)
 * 4. RELATED_MRS - Related merge requests
 * 5. ISSUE_LINKS - Linked issues (blocks, blocked by, related)
 * 6. TIME_TRACKING - Time estimates and spent
 */

export const GITLAB_ISSUE_QUERIES = {
  /**
   * Core Issue Data Query
   * Fetches essential issue information for a single issue
   */
  CORE_DATA: `
    query GetIssueCoreData($id: IssueID!) {
      issue(id: $id) {
        id
        iid
        title
        titleHtml
        description
        descriptionHtml
        state
        type
        confidential
        closedAt
        createdAt
        updatedAt
        dueDate
        weight
        healthStatus
        iteration {
          id
          title
          startDate
          dueDate
        }
        taskCompletionStatus {
          count
          completedCount
        }
        webUrl
        relativePosition
        severity
        upvotes
        downvotes
        userNotesCount
        mergeRequestsCount
        discussionLocked
        moved
        movedTo {
          id
          title
        }
      }
    }
  `,

  /**
   * Assignees and Author Query
   * Fetches people involved with the issue
   */
  ASSIGNEES_AUTHOR: `
    query GetIssueAssigneesAuthor($id: IssueID!) {
      issue(id: $id) {
        id
        author {
          id
          username
          name
          avatarUrl
          state
        }
        assignees {
          nodes {
            id
            username
            name
            avatarUrl
            state
          }
        }
      }
    }
  `,

  /**
   * Labels and Milestones Query
   * Fetches categorization information
   */
  LABELS_MILESTONES: `
    query GetIssueLabelsMillestones($id: IssueID!) {
      issue(id: $id) {
        id
        labels {
          nodes {
            id
            title
            description
            color
            textColor
          }
        }
        milestone {
          id
          title
          description
          state
          dueDate
          startDate
          expired
        }
        epic {
          id
          title
          state
          startDate
          dueDate
        }
      }
    }
  `,

  /**
   * Related Merge Requests Query
   * Fetches merge requests related to the issue
   */
  RELATED_MRS: `
    query GetIssueRelatedMRs($id: IssueID!) {
      issue(id: $id) {
        id
        relatedMergeRequests {
          nodes {
            id
            iid
            title
            state
            mergedAt
            createdAt
            updatedAt
            author {
              id
              username
              name
            }
          }
          count
        }
      }
    }
  `,

  /**
   * Issue Links Query
   * Fetches linked issues (blocks, blocked by, related)
   */
  ISSUE_LINKS: `
    query GetIssueLinks($id: IssueID!) {
      issue(id: $id) {
        id
        blockedByIssues {
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
  `,

  /**
   * Time Tracking Query
   * Fetches time estimates and time spent
   */
  TIME_TRACKING: `
    query GetIssueTimeTracking($id: IssueID!) {
      issue(id: $id) {
        id
        timeEstimate
        totalTimeSpent
        humanTimeEstimate
        humanTotalTimeSpent
        timelogs {
          nodes {
            id
            timeSpent
            spentAt
            summary
            note {
              id
              body
            }
            user {
              id
              username
              name
            }
          }
          count
        }
      }
    }
  `,

  /**
   * Simple Issue List Query
   * Used for fetching issue IDs for batch processing
   * Can be filtered by project or other criteria
   */
  SIMPLE_LIST: `
    query GetSimpleIssueList($first: Int!, $after: String, $projectPath: ID!) {
      project(fullPath: $projectPath) {
        issues(first: $first, after: $after) {
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
   * Simple Issue List Query (All Issues)
   * For fetching issues across all projects
   */
  SIMPLE_LIST_ALL: `
    query GetAllSimpleIssues($first: Int!, $after: String) {
      issues(first: $first, after: $after) {
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

