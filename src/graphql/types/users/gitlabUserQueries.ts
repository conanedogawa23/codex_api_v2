
// ============================================================================
// CORE IDENTITY - Basic user information
// ============================================================================
export const CORE_IDENTITY_QUERY = `
  query GetUserCoreIdentity($ids: [ID!]!) {
    users(ids: $ids) {
      nodes {
        id
        username
        name
        email
        publicEmail
        avatarUrl
        webUrl
        webPath
        createdAt
        lastActivityOn
        bot
        state
        active
        human
        commitEmail
        groupCount
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

// ============================================================================
// PROFILE & SOCIAL - Extended profile information
// ============================================================================
export const PROFILE_SOCIAL_QUERY = `
  query GetUserProfileSocial($ids: [ID!]!) {
    users(ids: $ids) {
      nodes {
        id
        username
        bio
        location
        pronouns
        organization
        jobTitle
        linkedin
        twitter
        discord
        gitpodEnabled
        preferencesGitpodPath
        profileEnableGitpodPath
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

// ============================================================================
// PERMISSIONS & STATUS - User permissions, status, and preferences
// ============================================================================
export const PERMISSIONS_STATUS_QUERY = `
  query GetUserPermissionsStatus($ids: [ID!]!) {
    users(ids: $ids) {
      nodes {
        id
        username
        userPermissions {
          createSnippet
        }
        status {
          availability
          emoji
          message
          messageHtml
        }
        userPreferences {
          extensionsMarketplaceOptInStatus
          issuesSort
          useWorkItemsView
          visibilityPipelineIdType
        }
        ide {
          codeSuggestionsEnabled
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

// ============================================================================
// NAMESPACE - User namespace information
// ============================================================================
export const NAMESPACE_QUERY = `
  query GetUserNamespace($ids: [ID!]!) {
    users(ids: $ids) {
      nodes {
        id
        username
        namespace {
          id
          name
          path
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
`;

// ============================================================================
// GROUP MEMBERSHIPS - User's group memberships with access levels
// ============================================================================
export const GROUP_MEMBERSHIPS_QUERY = `
  query GetUserGroupMemberships($ids: [ID!]!) {
    users(ids: $ids) {
      nodes {
        id
        username
        groupMemberships(first: 100) {
          nodes {
            id
            accessLevel {
              integerValue
              stringValue
            }
            group {
              id
              name
              fullPath
              visibility
              description
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

// ============================================================================
// PROJECT MEMBERSHIPS - User's project memberships with access levels
// ============================================================================
export const PROJECT_MEMBERSHIPS_QUERY = `
  query GetUserProjectMemberships($ids: [ID!]!) {
    users(ids: $ids) {
      nodes {
        id
        username
        projectMemberships(first: 100) {
          nodes {
            id
            accessLevel {
              integerValue
              stringValue
            }
            project {
              id
              name
              fullPath
              visibility
              description
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

// ============================================================================
// GROUPS - Groups user has access to
// ============================================================================
export const GROUPS_QUERY = `
  query GetUserGroups($ids: [ID!]!) {
    users(ids: $ids) {
      nodes {
        id
        username
        groups(first: 50) {
          nodes {
            id
            name
            fullPath
            visibility
            description
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

// ============================================================================
// AUTHORED MERGE REQUESTS - Merge requests created by user
// ============================================================================
export const AUTHORED_MERGE_REQUESTS_QUERY = `
  query GetUserAuthoredMergeRequests($ids: [ID!]!) {
    users(ids: $ids) {
      nodes {
        id
        username
        authoredMergeRequests(first: 50, sort: UPDATED_DESC) {
          nodes {
            id
            iid
            title
            description
            state
            createdAt
            updatedAt
            mergedAt
            sourceBranch
            targetBranch
            draft
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
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

// ============================================================================
// ASSIGNED MERGE REQUESTS - Merge requests assigned to user
// ============================================================================
export const ASSIGNED_MERGE_REQUESTS_QUERY = `
  query GetUserAssignedMergeRequests($ids: [ID!]!) {
    users(ids: $ids) {
      nodes {
        id
        username
        assignedMergeRequests(first: 50, sort: UPDATED_DESC) {
          nodes {
            id
            iid
            title
            state
            createdAt
            updatedAt
            sourceBranch
            targetBranch
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
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

// ============================================================================
// REVIEW REQUESTED MERGE REQUESTS - MRs where user is requested as reviewer
// ============================================================================
export const REVIEW_REQUESTED_MERGE_REQUESTS_QUERY = `
  query GetUserReviewRequestedMergeRequests($ids: [ID!]!) {
    users(ids: $ids) {
      nodes {
        id
        username
        reviewRequestedMergeRequests(first: 50, sort: UPDATED_DESC) {
          nodes {
            id
            iid
            title
            state
            createdAt
            updatedAt
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
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

// ============================================================================
// STARRED PROJECTS - Projects starred by user
// ============================================================================
export const STARRED_PROJECTS_QUERY = `
  query GetUserStarredProjects($ids: [ID!]!) {
    users(ids: $ids) {
      nodes {
        id
        username
        starredProjects(first: 50, sort: LATEST_ACTIVITY_DESC) {
          nodes {
            id
            name
            fullPath
            description
            visibility
            lastActivityAt
            createdAt
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

// ============================================================================
// CONTRIBUTED PROJECTS - Projects user has contributed to
// ============================================================================
export const CONTRIBUTED_PROJECTS_QUERY = `
  query GetUserContributedProjects($ids: [ID!]!) {
    users(ids: $ids) {
      nodes {
        id
        username
        contributedProjects(first: 50, sort: LATEST_ACTIVITY_DESC) {
          nodes {
            id
            name
            fullPath
            description
            visibility
            lastActivityAt
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

// ============================================================================
// SNIPPETS - Code snippets authored by user
// ============================================================================
export const SNIPPETS_QUERY = `
  query GetUserSnippets($ids: [ID!]!) {
    users(ids: $ids) {
      nodes {
        id
        username
        snippets(first: 50) {
          nodes {
            id
            title
            description
            fileName
            visibilityLevel
            createdAt
            updatedAt
            webUrl
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

// ============================================================================
// TIMELOGS - Time tracking entries by user
// ============================================================================
export const TIMELOGS_QUERY = `
  query GetUserTimelogs($ids: [ID!]!) {
    users(ids: $ids) {
      nodes {
        id
        username
        timelogs(first: 100, sort: SPENT_AT_DESC) {
          nodes {
            id
            timeSpent
            spentAt
            summary
            issue {
              id
              iid
              title
              webUrl
            }
            mergeRequest {
              id
              iid
              title
              webUrl
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

// ============================================================================
// TODOS - User's to-do items
// ============================================================================
export const TODOS_QUERY = `
  query GetUserTodos($ids: [ID!]!) {
    users(ids: $ids) {
      nodes {
        id
        username
        todos(first: 100) {
          nodes {
            id
            state
            action
            targetType
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
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

// ============================================================================
// EMAILS - User's email addresses
// ============================================================================
export const EMAILS_QUERY = `
  query GetUserEmails($ids: [ID!]!) {
    users(ids: $ids) {
      nodes {
        id
        username
        emails(first: 20) {
          nodes {
            id
            email
            confirmedAt
            createdAt
            updatedAt
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

// ============================================================================
// CALLOUTS - User callouts (dismissed notifications)
// ============================================================================
export const CALLOUTS_QUERY = `
  query GetUserCallouts($ids: [ID!]!) {
    users(ids: $ids) {
      nodes {
        id
        username
        callouts(first: 50) {
          nodes {
            featureName
            dismissedAt
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

// ============================================================================
// SAVED REPLIES - User's saved reply templates
// ============================================================================
export const SAVED_REPLIES_QUERY = `
  query GetUserSavedReplies($ids: [ID!]!) {
    users(ids: $ids) {
      nodes {
        id
        username
        savedReplies(first: 50) {
          nodes {
            id
            name
            content
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

// ============================================================================
// NAMESPACE COMMIT EMAILS - Custom commit emails per namespace
// ============================================================================
export const NAMESPACE_COMMIT_EMAILS_QUERY = `
  query GetUserNamespaceCommitEmails($ids: [ID!]!) {
    users(ids: $ids) {
      nodes {
        id
        username
        namespaceCommitEmails(first: 50) {
          nodes {
            id
            email {
              id
              email
              confirmedAt
            }
            namespace {
              id
              name
              fullPath
            }
            createdAt
            updatedAt
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

// ============================================================================
// COMPLETE USER DATA - All available fields in one query
// ============================================================================
export const COMPLETE_USER_QUERY = `
  query GetCompleteUserData($ids: [ID!]!) {
    users(ids: $ids) {
      nodes {
        # Core Identity
        id
        username
        name
        email
        publicEmail
        avatarUrl
        webUrl
        webPath
        createdAt
        lastActivityOn
        bot
        state
        active
        human
        commitEmail
        groupCount
        
        # Profile & Social
        bio
        location
        pronouns
        organization
        jobTitle
        linkedin
        twitter
        discord
        
        # Gitpod
        gitpodEnabled
        preferencesGitpodPath
        profileEnableGitpodPath
        
        # Permissions
        userPermissions {
          createSnippet
        }
        
        # Status
        status {
          availability
          emoji
          message
          messageHtml
        }
        
        # Preferences
        userPreferences {
          extensionsMarketplaceOptInStatus
          issuesSort
          useWorkItemsView
          visibilityPipelineIdType
        }
        
        # IDE Settings
        ide {
          codeSuggestionsEnabled
        }
        
        # Namespace
        namespace {
          id
          name
          path
          fullPath
          visibility
        }
        
        # Group Memberships
        groupMemberships(first: 100) {
          nodes {
            id
            accessLevel {
              integerValue
              stringValue
            }
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
        
        # Project Memberships
        projectMemberships(first: 100) {
          nodes {
            id
            accessLevel {
              integerValue
              stringValue
            }
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
        
        # Groups
        groups(first: 50) {
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
        
        # Merge Requests
        authoredMergeRequests(first: 20) {
          nodes {
            id
            iid
            title
            state
            createdAt
            updatedAt
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
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
        
        # Projects
        starredProjects(first: 20) {
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
        
        contributedProjects(first: 20) {
          nodes {
            id
            name
            fullPath
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
        
        # Content
        snippets(first: 20) {
          nodes {
            id
            title
            visibilityLevel
            createdAt
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
        
        # Time & Tasks
        timelogs(first: 50) {
          nodes {
            id
            timeSpent
            spentAt
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
        
        todos(first: 50) {
          nodes {
            id
            state
            action
            targetType
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
        
        # Settings
        emails(first: 10) {
          nodes {
            id
            email
            confirmedAt
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
        
        callouts(first: 20) {
          nodes {
            featureName
            dismissedAt
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
        
        savedReplies(first: 20) {
          nodes {
            id
            name
            content
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

// ============================================================================
// SIMPLE USERS LIST - Minimal query for listing users
// ============================================================================
export const SIMPLE_USERS_QUERY = `
  query GetSimpleUsers($first: Int, $after: String) {
    users(first: $first, after: $after) {
      nodes {
        id
        username
        name
        email
        state
        avatarUrl
        createdAt
        lastActivityOn
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

// ============================================================================
// SINGLE USER - Optimized query for fetching one user by ID
// ============================================================================
export const SINGLE_USER_QUERY = `
  query GetSingleUser($userId: ID!) {
    user(id: $userId) {
      id
      username
      name
      email
      publicEmail
      avatarUrl
      webUrl
      bio
      location
      pronouns
      organization
      jobTitle
      linkedin
      twitter
      discord
      bot
      state
      active
      createdAt
      lastActivityOn
      commitEmail
      groupCount
      
      userPermissions {
        createSnippet
      }
      
      status {
        availability
        emoji
        message
      }
      
      namespace {
        id
        name
        fullPath
      }
    }
  }
`;

// ============================================================================
// SYNC QUERY - Recommended query for sync service (optimized for performance)
// ============================================================================
export const SYNC_USER_QUERY = `
  query SyncUserData($userId: ID!) {
    user(id: $userId) {
      # Core fields for database
      id
      username
      name
      email
      publicEmail
      avatarUrl
      webUrl
      webPath
      bio
      location
      pronouns
      organization
      jobTitle
      linkedin
      twitter
      discord
      bot
      state
      active
      createdAt
      lastActivityOn
      commitEmail
      groupCount
      
      # Permissions
      userPermissions {
        createSnippet
      }
      
      # Status
      status {
        availability
        emoji
        message
        messageHtml
      }
      
      # Preferences
      userPreferences {
        extensionsMarketplaceOptInStatus
        issuesSort
        useWorkItemsView
        visibilityPipelineIdType
      }
      
      # Namespace
      namespace {
        id
        name
        path
        fullPath
        visibility
      }
      
      # IDE
      ide {
        codeSuggestionsEnabled
      }
      
      # Memberships (limited for performance)
      groupMemberships(first: 100) {
        nodes {
          id
          accessLevel {
            integerValue
            stringValue
          }
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
      
      projectMemberships(first: 100) {
        nodes {
          id
          accessLevel {
            integerValue
            stringValue
          }
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
`;

// ============================================================================
// EXPORT ALL QUERIES
// ============================================================================
export const GITLAB_USER_QUERIES = {
  // Core queries
  CORE_IDENTITY: CORE_IDENTITY_QUERY,
  PROFILE_SOCIAL: PROFILE_SOCIAL_QUERY,
  PERMISSIONS_STATUS: PERMISSIONS_STATUS_QUERY,
  NAMESPACE: NAMESPACE_QUERY,
  
  // Membership queries
  GROUP_MEMBERSHIPS: GROUP_MEMBERSHIPS_QUERY,
  PROJECT_MEMBERSHIPS: PROJECT_MEMBERSHIPS_QUERY,
  GROUPS: GROUPS_QUERY,
  
  // Merge request queries
  AUTHORED_MERGE_REQUESTS: AUTHORED_MERGE_REQUESTS_QUERY,
  ASSIGNED_MERGE_REQUESTS: ASSIGNED_MERGE_REQUESTS_QUERY,
  REVIEW_REQUESTED_MERGE_REQUESTS: REVIEW_REQUESTED_MERGE_REQUESTS_QUERY,
  
  // Project queries
  STARRED_PROJECTS: STARRED_PROJECTS_QUERY,
  CONTRIBUTED_PROJECTS: CONTRIBUTED_PROJECTS_QUERY,
  
  // Content queries
  SNIPPETS: SNIPPETS_QUERY,
  SAVED_REPLIES: SAVED_REPLIES_QUERY,
  
  // Time & task queries
  TIMELOGS: TIMELOGS_QUERY,
  TODOS: TODOS_QUERY,
  
  // Settings queries
  EMAILS: EMAILS_QUERY,
  CALLOUTS: CALLOUTS_QUERY,
  NAMESPACE_COMMIT_EMAILS: NAMESPACE_COMMIT_EMAILS_QUERY,
  
  // Comprehensive queries
  COMPLETE_USER: COMPLETE_USER_QUERY,
  SIMPLE_USERS: SIMPLE_USERS_QUERY,
  SINGLE_USER: SINGLE_USER_QUERY,
  SYNC_USER: SYNC_USER_QUERY,
} as const;

/**
 * Query categories for easy reference
 */
export const QUERY_CATEGORIES = {
  IDENTITY: [
    'CORE_IDENTITY',
    'PROFILE_SOCIAL',
    'PERMISSIONS_STATUS',
    'NAMESPACE',
  ],
  MEMBERSHIPS: [
    'GROUP_MEMBERSHIPS',
    'PROJECT_MEMBERSHIPS',
    'GROUPS',
  ],
  MERGE_REQUESTS: [
    'AUTHORED_MERGE_REQUESTS',
    'ASSIGNED_MERGE_REQUESTS',
    'REVIEW_REQUESTED_MERGE_REQUESTS',
  ],
  PROJECTS: [
    'STARRED_PROJECTS',
    'CONTRIBUTED_PROJECTS',
  ],
  CONTENT: [
    'SNIPPETS',
    'SAVED_REPLIES',
  ],
  TIME_TASKS: [
    'TIMELOGS',
    'TODOS',
  ],
  SETTINGS: [
    'EMAILS',
    'CALLOUTS',
    'NAMESPACE_COMMIT_EMAILS',
  ],
  COMPREHENSIVE: [
    'COMPLETE_USER',
    'SIMPLE_USERS',
    'SINGLE_USER',
    'SYNC_USER',
  ],
} as const;
