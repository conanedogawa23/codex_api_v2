/**
 * GitLab GraphQL Query Definitions
 * Comprehensive collection of GraphQL queries for fetching user data from GitLab
 */

// Core user identity information
export const CORE_IDENTITY_QUERY = `
  query GetUserCoreIdentity($ids: [ID!]!) {
    users(ids: $ids) {
      nodes {
        id
        username
        email
        name
        avatarUrl
        webUrl
        createdAt
        publicEmail
        location
        bio
        pronouns
        bot
        state
        verificationState
        emailVerified
        phoneVerified
        commitEmail
        canCreateGroup
        canCreateProject
        lastActivityOn
        lastSignInAt
      }
    }
  }
`;

// Contact and social information
export const CONTACT_SOCIAL_QUERY = `
  query GetUserContactSocial($ids: [ID!]!) {
    users(ids: $ids) {
      nodes {
        id
        skype
        linkedin
        twitter
        discord
        websiteUrl
        organization
        jobTitle
        workInformation
        localTime
        status {
          availability
          emoji
          message
          messageHtml
        }
        preferences {
          visibilityLevel
          activityViewLimit
          timezone
        }
        birthday
        hireDate
        terminationDate
        dashboard
        theme
        language
        notificationSettings {
          email
          push
          slack
        }
      }
    }
  }
`;

// Activity statistics
export const ACTIVITY_STATS_QUERY = `
  query GetUserActivityStats($ids: [ID!]!) {
    users(ids: $ids) {
      nodes {
        id
        groupCount
        projectCount
        contributionsCount
        discussionsCount
        issuesCreatedCount
        mergeRequestsCount
        commitsCount
        starredProjects(first: 10) {
          nodes {
            id
            name
            fullPath
            visibility
            lastActivityAt
          }
        }
        snippets(first: 5) {
          nodes {
            id
            title
            description
            visibility
            createdAt
          }
        }
        authoredMergeRequests(first: 5) {
          nodes {
            id
            title
            state
            createdAt
          }
        }
        authoredIssues(first: 5) {
          nodes {
            id
            title
            state
            createdAt
          }
        }
      }
    }
  }
`;

// Social connections
export const SOCIAL_CONNECTIONS_QUERY = `
  query GetUserSocialConnections($ids: [ID!]!) {
    users(ids: $ids) {
      nodes {
        id
        followers(first: 20) {
          nodes {
            id
            username
            name
            avatarUrl
          }
        }
        following(first: 20) {
          nodes {
            id
            username
            name
            avatarUrl
          }
        }
        groups(first: 10) {
          nodes {
            id
            name
            fullPath
            visibility
            createdAt
          }
        }
        authoredDiscussions(first: 5) {
          nodes {
            id
            title
            createdAt
          }
        }
      }
    }
  }
`;

// Security and access control
export const SECURITY_ACCESS_QUERY = `
  query GetUserSecurityAccess($ids: [ID!]!) {
    users(ids: $ids) {
      nodes {
        id
        isLocked
        lockedAt
        unlockAt
        twoFactorEnabled
        userPermissions {
          createSnippet
          adminNote
          adminUser
          createGroup
          createProject
        }
        identities(first: 10) {
          nodes {
            id
            provider
            externUid
            samlProviderId
          }
        }
        namespace {
          id
          name
          path
          fullPath
          visibility
        }
        authorizedProjects(first: 10) {
          nodes {
            id
            name
            fullPath
            permissions {
              readProject
              writeProject
              adminProject
            }
          }
        }
        authenticationType
        samlProvider {
          name
          issuer
        }
        ldapInfo {
          dn
          provider
        }
        oauthApplications {
          nodes {
            name
            scopes
            createdAt
          }
        }
      }
    }
  }
`;

// Development activity
export const DEVELOPMENT_ACTIVITY_QUERY = `
  query GetUserDevelopmentActivity($ids: [ID!]!) {
    users(ids: $ids) {
      nodes {
        id
        authoredMergeRequests(first: 10) {
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
        }
        reviewRequestedMergeRequests(first: 10) {
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
        }
        authoredIssues(first: 10) {
          nodes {
            id
            iid
            title
            description
            state
            createdAt
            updatedAt
            project {
              id
              name
              fullPath
            }
          }
        }
        assignedIssues(first: 10) {
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
        }
      }
    }
  }
`;

// Collaboration and communication
export const COLLABORATION_QUERY = `
  query GetUserCollaboration($ids: [ID!]!) {
    users(ids: $ids) {
      nodes {
        id
        authoredNotes(first: 10) {
          nodes {
            id
            body
            noteableType
            createdAt
            project {
              id
              name
            }
          }
        }
        authoredDiscussions(first: 10) {
          nodes {
            id
            title
            replyId
            createdAt
            project {
              id
              name
            }
          }
        }
        authoredCommits(first: 10) {
          nodes {
            id
            title
            message
            authoredDate
            committedDate
            project {
              id
              name
              fullPath
            }
          }
        }
        todos(first: 10) {
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
        }
      }
    }
  }
`;

// Assets and content
export const ASSETS_CONTENT_QUERY = `
  query GetUserAssetsContent($ids: [ID!]!) {
    users(ids: $ids) {
      nodes {
        id
        authoredSnippets(first: 10) {
          nodes {
            id
            title
            description
            visibility
            createdAt
            updatedAt
          }
        }
        authoredEpicNotes(first: 5) {
          nodes {
            id
            body
            createdAt
            epic {
              id
              title
            }
          }
        }
        authoredVulnerabilityNotes(first: 5) {
          nodes {
            id
            body
            createdAt
            vulnerability {
              id
              title
            }
          }
        }
        awardEmojis(first: 10) {
          nodes {
            id
            name
            description
            unicode
            awardableType
            awardableId
          }
        }
      }
    }
  }
`;

// Time tracking and productivity
export const TIME_TRACKING_QUERY = `
  query GetUserTimeTracking($ids: [ID!]!) {
    users(ids: $ids) {
      nodes {
        id
        timelogs(first: 10) {
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
        }
        authoredTimelogs(first: 10) {
          nodes {
            id
            timeSpent
            spentAt
            summary
          }
        }
        recentActivity(first: 15) {
          nodes {
            id
            action
            targetType
            targetTitle
            createdAt
          }
        }
      }
    }
  }
`;

// Advanced relationships
export const ADVANCED_RELATIONSHIPS_QUERY = `
  query GetUserAdvancedRelationships($ids: [ID!]!) {
    users(ids: $ids) {
      nodes {
        id
        authoredEpics(first: 5) {
          nodes {
            id
            iid
            title
            description
            state
            createdAt
            group {
              id
              name
              fullPath
            }
          }
        }
        assignedEpics(first: 5) {
          nodes {
            id
            iid
            title
            state
            group {
              id
              name
              fullPath
            }
          }
        }
        authoredRequirements(first: 5) {
          nodes {
            id
            iid
            title
            state
            project {
              id
              name
            }
          }
        }
        assignedRequirements(first: 5) {
          nodes {
            id
            iid
            title
            state
            project {
              id
              name
            }
          }
        }
        authoredTestCases(first: 5) {
          nodes {
            id
            title
            state
            project {
              id
              name
            }
          }
        }
        assignedTestCases(first: 5) {
          nodes {
            id
            title
            state
            project {
              id
              name
            }
          }
        }
      }
    }
  }
`;

// Deployment and release activity
export const DEPLOYMENT_RELEASE_QUERY = `
  query GetUserDeploymentRelease($ids: [ID!]!) {
    users(ids: $ids) {
      nodes {
        id
        authoredReleases(first: 5) {
          nodes {
            id
            tagName
            name
            description
            createdAt
            project {
              id
              name
              fullPath
            }
          }
        }
        deployments(first: 10) {
          nodes {
            id
            iid
            ref
            sha
            status
            createdAt
            updatedAt
            environment {
              id
              name
              tier
            }
            project {
              id
              name
            }
          }
        }
        authoredPackages(first: 5) {
          nodes {
            id
            name
            packageType
            createdAt
            project {
              id
              name
            }
          }
        }
        authoredVulnerabilities(first: 5) {
          nodes {
            id
            title
            state
            severity
            createdAt
            project {
              id
              name
            }
          }
        }
      }
    }
  }
`;

// Organization and permissions
export const ORGANIZATION_PERMISSIONS_QUERY = `
  query GetUserOrganizationPermissions($ids: [ID!]!) {
    users(ids: $ids) {
      nodes {
        id
        namespace {
          id
          name
          path
          fullPath
          visibility
          kind
          members {
            nodes {
              id
              accessLevel
              expiresAt
            }
          }
        }
        groupMemberships(first: 20) {
          nodes {
            id
            accessLevel
            expiresAt
            group {
              id
              name
              fullPath
              visibility
            }
          }
        }
        projectMemberships(first: 20) {
          nodes {
            id
            accessLevel
            expiresAt
            project {
              id
              name
              fullPath
              visibility
            }
          }
        }
        impersonationTokens(first: 10) {
          nodes {
            id
            name
            scopes
            expiresAt
            active
          }
        }
        manager {
          id
          username
          name
        }
        reportsTo {
          id
          username
          name
        }
        department
        costCenter
        employeeNumber
      }
    }
  }
`;

// User interactions
export const USER_INTERACTIONS_QUERY = `
  query GetUserInteractions($ids: [ID!]!) {
    users(ids: $ids) {
      nodes {
        id
        blockedUsers(first: 10) {
          nodes {
            id
            username
            name
          }
        }
        mutedUsers(first: 10) {
          nodes {
            id
            username
            name
          }
        }
        watchedProjects(first: 10) {
          nodes {
            id
            name
            fullPath
          }
        }
        followedGroups(first: 10) {
          nodes {
            id
            name
            fullPath
          }
        }
        mentionedInNotes(first: 10) {
          nodes {
            id
            body
            createdAt
            project {
              id
              name
            }
          }
        }
        mentionedInIssues(first: 10) {
          nodes {
            id
            title
            createdAt
            project {
              id
              name
            }
          }
        }
      }
    }
  }
`;

// User reviews
export const USER_REVIEWS_QUERY = `
  query GetUserReviews($ids: [ID!]!) {
    users(ids: $ids) {
      nodes {
        id
        reviewedMergeRequests(first: 10) {
          nodes {
            id
            iid
            title
            state
            reviewState
            createdAt
            project {
              id
              name
            }
          }
        }
        approvedMergeRequests(first: 10) {
          nodes {
            id
            iid
            title
            state
            approvedAt
            project {
              id
              name
            }
          }
        }
        rejectedMergeRequests(first: 10) {
          nodes {
            id
            iid
            title
            state
            rejectedAt
            project {
              id
              name
            }
          }
        }
        commentedMergeRequests(first: 10) {
          nodes {
            id
            iid
            title
            state
            createdAt
            project {
              id
              name
            }
          }
        }
      }
    }
  }
`;

// User productivity and work schedule
export const USER_PRODUCTIVITY_QUERY = `
  query GetUserProductivity($ids: [ID!]!) {
    users(ids: $ids) {
      nodes {
        id
        timeTrackingEnabled
        weeklyHours
        overtimeHours
        vacationDays
        sickDays
        personalDays
        workSchedule {
          monday
          tuesday
          wednesday
          thursday
          friday
          saturday
          sunday
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
        email
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

// Export all queries as a collection
export const GITLAB_USER_QUERIES = {
  CORE_IDENTITY: CORE_IDENTITY_QUERY,
  CONTACT_SOCIAL: CONTACT_SOCIAL_QUERY,
  ACTIVITY_STATS: ACTIVITY_STATS_QUERY,
  SOCIAL_CONNECTIONS: SOCIAL_CONNECTIONS_QUERY,
  SECURITY_ACCESS: SECURITY_ACCESS_QUERY,
  DEVELOPMENT_ACTIVITY: DEVELOPMENT_ACTIVITY_QUERY,
  COLLABORATION: COLLABORATION_QUERY,
  ASSETS_CONTENT: ASSETS_CONTENT_QUERY,
  TIME_TRACKING: TIME_TRACKING_QUERY,
  ADVANCED_RELATIONSHIPS: ADVANCED_RELATIONSHIPS_QUERY,
  DEPLOYMENT_RELEASE: DEPLOYMENT_RELEASE_QUERY,
  ORGANIZATION_PERMISSIONS: ORGANIZATION_PERMISSIONS_QUERY,
  USER_INTERACTIONS: USER_INTERACTIONS_QUERY,
  USER_REVIEWS: USER_REVIEWS_QUERY,
  USER_PRODUCTIVITY: USER_PRODUCTIVITY_QUERY,
  SIMPLE_USERS: SIMPLE_USERS_QUERY,
} as const;
