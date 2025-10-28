/**
 * GitLab Project GraphQL Queries
 * 
 * Organized into 8 independent categories for parallel execution:
 * 1. CORE_DATA - Basic project information
 * 2. MEMBERS - Project members and their roles
 * 3. STATISTICS - Project statistics (issues, MRs, commits count)
 * 4. REPOSITORY - Repository information (default branch, languages)
 * 5. CICD_SETTINGS - CI/CD settings and runners
 * 6. CONTAINER_REGISTRY - Container registry info
 * 7. RELEASES - Releases and tags
 * 8. MR_SETTINGS - Merge request settings
 */

export const GITLAB_PROJECT_QUERIES = {
  /**
   * Core Project Data Query
   * Fetches essential project information
   */
  CORE_DATA: `
    query GetProjectCoreData($ids: [ID!]!) {
      projects(ids: $ids) {
        nodes {
          id
          name
          fullPath
          path
          description
          descriptionHtml
          visibility
          archived
          createdAt
          lastActivityAt
          httpUrlToRepo
          sshUrlToRepo
          webUrl
          starCount
          forksCount
          avatarUrl
          emptyRepo
          publicJobs
          onlyAllowMergeIfPipelineSucceeds
          onlyAllowMergeIfAllDiscussionsAreResolved
          printingMergeRequestLinkEnabled
          removeSourceBranchAfterMerge
          requestAccessEnabled
          tagList
          topics
          sharedRunnersEnabled
          lfsEnabled
          mergeRequestsEnabled
          issuesEnabled
          snippetsEnabled
          wikiEnabled
          jobsEnabled
          containerRegistryEnabled
          serviceDeskEnabled
          serviceDeskAddress
          autoDevopsEnabled
          autoDevopsDeployStrategy
          autocloseReferencedIssues
          suggestionCommitMessage
          squashOption
          namespace {
            id
            name
            path
            fullPath
          }
          group {
            id
            name
            path
            fullPath
          }
        }
      }
    }
  `,

  /**
   * Project Members Query
   * Fetches project members and their access levels
   */
  MEMBERS: `
    query GetProjectMembers($ids: [ID!]!) {
      projects(ids: $ids) {
        nodes {
          id
          projectMembers {
            nodes {
              id
              accessLevel {
                integerValue
                stringValue
              }
              createdAt
              updatedAt
              expiresAt
              user {
                id
                username
                name
                avatarUrl
                state
                webUrl
              }
            }
          }
        }
      }
    }
  `,

  /**
   * Project Statistics Query
   * Fetches project statistics and counts
   */
  STATISTICS: `
    query GetProjectStatistics($ids: [ID!]!) {
      projects(ids: $ids) {
        nodes {
          id
          statistics {
            commitCount
            storageSize
            repositorySize
            lfsObjectsSize
            buildArtifactsSize
            packagesSize
            wikiSize
            snippetsSize
            uploadsSize
          }
          issuesCount: issues {
            count
          }
          openIssuesCount: issues(state: opened) {
            count
          }
          mergeRequestsCount: mergeRequests {
            count
          }
          openMergeRequestsCount: mergeRequests(state: opened) {
            count
          }
        }
      }
    }
  `,

  /**
   * Repository Information Query
   * Fetches repository details, branches, and languages
   */
  REPOSITORY: `
    query GetProjectRepository($ids: [ID!]!) {
      projects(ids: $ids) {
        nodes {
          id
          repository {
            rootRef
            empty
            exists
            tree {
              lastCommit {
                id
                sha
                message
                authoredDate
                committedDate
                author {
                  id
                  username
                  name
                  avatarUrl
                }
              }
            }
          }
          languages {
            name
            share
            color
          }
        }
      }
    }
  `,

  /**
   * CI/CD Settings Query
   * Fetches CI/CD configuration and runners
   */
  CICD_SETTINGS: `
    query GetProjectCicdSettings($ids: [ID!]!) {
      projects(ids: $ids) {
        nodes {
          id
          ciConfigPath
          ciCdSettings {
            mergePipelinesEnabled
            mergeTrainsEnabled
            keepLatestArtifact
            jobTokenScopeEnabled
            inboundJobTokenScopeEnabled
          }
          runners {
            nodes {
              id
              description
              active
              paused
              runnerType
              tagList
              version
              accessLevel
            }
          }
        }
      }
    }
  `,

  /**
   * Container Registry Query
   * Fetches container registry information
   */
  CONTAINER_REGISTRY: `
    query GetProjectContainerRegistry($ids: [ID!]!) {
      projects(ids: $ids) {
        nodes {
          id
          containerRegistryEnabled
          containerExpirationPolicy {
            enabled
            cadence
            keepN
            olderThan
            nameRegex
            nameRegexKeep
            nextRunAt
          }
          containerRepositories {
            nodes {
              id
              name
              path
              location
              createdAt
              updatedAt
              expirationPolicyStartedAt
              status
            }
            count
          }
        }
      }
    }
  `,

  /**
   * Releases and Tags Query
   * Fetches project releases and tags
   */
  RELEASES: `
    query GetProjectReleases($ids: [ID!]!) {
      projects(ids: $ids) {
        nodes {
          id
          releases {
            nodes {
              id
              name
              tagName
              tagPath
              description
              descriptionHtml
              createdAt
              releasedAt
              upcomingRelease
              author {
                id
                username
                name
                avatarUrl
              }
              commit {
                id
                sha
                title
              }
              assets {
                count
                links {
                  nodes {
                    id
                    name
                    url
                    directAssetUrl
                    linkType
                  }
                }
              }
            }
            count
          }
        }
      }
    }
  `,

  /**
   * Merge Request Settings Query
   * Fetches merge request specific settings and approvals
   */
  MR_SETTINGS: `
    query GetProjectMrSettings($ids: [ID!]!) {
      projects(ids: $ids) {
        nodes {
          id
          mergeRequestsEnabled
          onlyAllowMergeIfPipelineSucceeds
          onlyAllowMergeIfAllDiscussionsAreResolved
          allowMergeOnSkippedPipeline
          mergeCommitTemplate
          squashCommitTemplate
          removeSourceBranchAfterMerge
          printingMergeRequestLinkEnabled
          squashOption
          approvalRules {
            nodes {
              id
              name
              type
              approvalsRequired
              eligibleApprovers {
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
  `,

  /**
   * Simple Project List Query
   * Used for fetching project IDs for batch processing
   */
  SIMPLE_LIST: `
    query GetSimpleProjectList($first: Int!, $after: String) {
      projects(first: $first, after: $after) {
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
    }
  `
};

