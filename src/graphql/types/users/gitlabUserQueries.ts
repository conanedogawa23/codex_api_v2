/**
 * GitLab GraphQL Query Definitions - CORRECTED VERSION
 * Only includes fields that are actually available in the GitLab instance
 * Generated based on schema introspection on 2025-10-15
 */

// Core user identity information (corrected)
export const CORE_IDENTITY_QUERY = `
  query GetUserCoreIdentity($ids: [ID!]!) {
    users(ids: $ids) {
      nodes {
        id
        username
        publicEmail
        name
        avatarUrl
        webUrl
        webPath
        createdAt
        location
        bio
        pronouns
        bot
        state
        commitEmail
        lastActivityOn
      }
    }
  }
`;

// Contact and social information (corrected)
export const CONTACT_SOCIAL_QUERY = `
  query GetUserContactSocial($ids: [ID!]!) {
    users(ids: $ids) {
      nodes {
        id
        linkedin
        twitter
        discord
        organization
        jobTitle
        status {
          availability
          emoji
          message
          messageHtml
        }
        userPreferences {
          issuesSort
          visibilityPipelineIdType
        }
      }
    }
  }
`;

// Activity statistics (corrected - using available relationships)
export const ACTIVITY_STATS_QUERY = `
  query GetUserActivityStats($ids: [ID!]!) {
    users(ids: $ids) {
      nodes {
        id
        groupCount
        starredProjects(first: 10) {
          nodes {
            id
            name
            fullPath
            visibility
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
        snippets(first: 5) {
          nodes {
            id
            title
            description
            createdAt
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
        authoredMergeRequests(first: 10) {
          nodes {
            id
            iid
            title
            state
            createdAt
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
        contributedProjects(first: 10) {
          nodes {
            id
            name
            fullPath
            visibility
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    }
  }
`;

// Social connections (corrected)
export const SOCIAL_CONNECTIONS_QUERY = `
  query GetUserSocialConnections($ids: [ID!]!) {
    users(ids: $ids) {
      nodes {
        id
        groups(first: 20) {
          nodes {
            id
            name
            fullPath
            visibility
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
        groupMemberships(first: 20) {
          nodes {
            id
            group {
              id
              name
              fullPath
              visibility
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
`;

// Security and access control (corrected)
export const SECURITY_ACCESS_QUERY = `
  query GetUserSecurityAccess($ids: [ID!]!) {
    users(ids: $ids) {
      nodes {
        id
        userPermissions {
          createSnippet
        }
        namespace {
          id
          name
          path
          fullPath
          visibility
        }
        projectMemberships(first: 20) {
          nodes {
            id
            project {
              id
              name
              fullPath
              visibility
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
`;

// Development activity (corrected)
export const DEVELOPMENT_ACTIVITY_QUERY = `
  query GetUserDevelopmentActivity($ids: [ID!]!) {
    users(ids: $ids) {
      nodes {
        id
        authoredMergeRequests(first: 20) {
          nodes {
            id
            iid
            title
            description
            state
            mergeStatus
            sourceBranch
            targetBranch
            createdAt
            updatedAt
            mergedAt
            project {
              id
              name
              fullPath
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
        reviewRequestedMergeRequests(first: 20) {
          nodes {
            id
            iid
            title
            state
            createdAt
            project {
              id
              name
              fullPath
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
        assignedMergeRequests(first: 20) {
          nodes {
            id
            iid
            title
            state
            createdAt
            project {
              id
              name
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
  }
`;

// Time tracking (corrected)
export const TIME_TRACKING_QUERY = `
  query GetUserTimeTracking($ids: [ID!]!) {
    users(ids: $ids) {
      nodes {
        id
        timelogs(first: 20) {
          nodes {
            id
            timeSpent
            spentAt
            summary
            issue {
              id
              title
              iid
            }
            mergeRequest {
              id
              title
              iid
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
`;

// User todos (corrected)
export const USER_TODOS_QUERY = `
  query GetUserTodos($ids: [ID!]!) {
    users(ids: $ids) {
      nodes {
        id
        todos(first: 20) {
          nodes {
            id
            state
            targetType
            createdAt
            project {
              id
              name
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
`;

// User snippets (corrected)
export const USER_SNIPPETS_QUERY = `
  query GetUserSnippets($ids: [ID!]!) {
    users(ids: $ids) {
      nodes {
        id
        snippets(first: 20) {
          nodes {
            id
            title
            description
            createdAt
            updatedAt
            blobs {
              nodes {
                name
                path
                size
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
`;

// User emails (corrected - alternative to missing 'email' field)
export const USER_EMAILS_QUERY = `
  query GetUserEmails($ids: [ID!]!) {
    users(ids: $ids) {
      nodes {
        id
        publicEmail
        commitEmail
        emails {
          nodes {
            id
            email
            confirmedAt
          }
        }
      }
    }
  }
`;

// Simple user query for fetching basic user information with IDs
export const SIMPLE_USERS_QUERY = `
  query GetSimpleUsers($first: Int, $after: String) {
    users(first: $first, after: $after) {
      nodes {
        id
        username
        publicEmail
        name
        state
        createdAt
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

// Comprehensive user query with all available fields
export const COMPREHENSIVE_USER_QUERY = `
  query GetComprehensiveUser($ids: [ID!]!) {
    users(ids: $ids) {
      nodes {
        id
        username
        name
        publicEmail
        avatarUrl
        webUrl
        webPath
        createdAt
        bot
        human
        active
        state
        bio
        location
        pronouns
        organization
        jobTitle
        linkedin
        twitter
        discord
        commitEmail
        lastActivityOn
        status {
          availability
          emoji
          message
          messageHtml
        }
        groupCount
        userPermissions {
          createSnippet
        }
        userPreferences {
          issuesSort
          visibilityPipelineIdType
        }
        namespace {
          id
          name
          path
          fullPath
          visibility
        }
        emails {
          nodes {
            id
            email
            confirmedAt
          }
        }
        groups(first: 10) {
          nodes {
            id
            name
            fullPath
            visibility
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
        groupMemberships(first: 10) {
          nodes {
            id
            group {
              id
              name
              fullPath
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
        projectMemberships(first: 10) {
          nodes {
            id
            project {
              id
              name
              fullPath
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
        authoredMergeRequests(first: 5) {
          nodes {
            id
            iid
            title
            state
            createdAt
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
        assignedMergeRequests(first: 5) {
          nodes {
            id
            iid
            title
            state
            createdAt
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
        reviewRequestedMergeRequests(first: 5) {
          nodes {
            id
            iid
            title
            state
            createdAt
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
        starredProjects(first: 5) {
          nodes {
            id
            name
            fullPath
            visibility
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
        contributedProjects(first: 5) {
          nodes {
            id
            name
            fullPath
            visibility
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
        snippets(first: 5) {
          nodes {
            id
            title
            description
            createdAt
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
        timelogs(first: 5) {
          nodes {
            id
            timeSpent
            spentAt
            summary
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
        todos(first: 5) {
          nodes {
            id
            state
            targetType
            createdAt
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    }
  }
`;

// Export all queries as a collection
export const GITLAB_USER_QUERIES_CORRECTED = {
  CORE_IDENTITY: CORE_IDENTITY_QUERY,
  CONTACT_SOCIAL: CONTACT_SOCIAL_QUERY,
  ACTIVITY_STATS: ACTIVITY_STATS_QUERY,
  SOCIAL_CONNECTIONS: SOCIAL_CONNECTIONS_QUERY,
  SECURITY_ACCESS: SECURITY_ACCESS_QUERY,
  DEVELOPMENT_ACTIVITY: DEVELOPMENT_ACTIVITY_QUERY,
  TIME_TRACKING: TIME_TRACKING_QUERY,
  USER_TODOS: USER_TODOS_QUERY,
  USER_SNIPPETS: USER_SNIPPETS_QUERY,
  USER_EMAILS: USER_EMAILS_QUERY,
  SIMPLE_USERS: SIMPLE_USERS_QUERY,
  COMPREHENSIVE: COMPREHENSIVE_USER_QUERY,
} as const;
