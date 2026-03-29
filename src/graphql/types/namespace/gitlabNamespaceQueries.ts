/**
 * GitLab Namespace GraphQL Queries
 * 4 categories: CORE_DATA, PROJECTS, GROUPS, STATISTICS
 */

export const GITLAB_NAMESPACE_QUERIES = {
  CORE_DATA: `
    query GetNamespaceCoreData($fullPath: ID!) {
      group(fullPath: $fullPath) {
        id
        name
        path
        fullName
        fullPath
        webUrl
        description
        descriptionHtml
        visibility
        lfsEnabled
        requestAccessEnabled
        rootStorageStatistics {
          storageSize
          repositorySize
          lfsObjectsSize
          buildArtifactsSize
          packagesSize
          wikiSize
          snippetsSize
        }
      }
    }
  `,

  PROJECTS: `
    query GetNamespaceProjects($fullPath: ID!) {
      group(fullPath: $fullPath) {
        id
        projects {
          nodes {
            id
            name
            path
            fullPath
          }
          count
        }
      }
    }
  `,

  GROUPS: `
    query GetNamespaceGroups($fullPath: ID!) {
      group(fullPath: $fullPath) {
        id
        descendantGroups {
          nodes {
            id
            name
            path
            fullPath
          }
        }
      }
    }
  `,

  STATISTICS: `
    query GetNamespaceStatistics($fullPath: ID!) {
      group(fullPath: $fullPath) {
        id
        rootStorageStatistics {
          storageSize
          repositorySize
          lfsObjectsSize
          buildArtifactsSize
          packagesSize
          wikiSize
          snippetsSize
          uploadsSize
        }
      }
    }
  `,

  SIMPLE_LIST: `
    query GetSimpleNamespaceList($first: Int!, $after: String) {
      groups(first: $first, after: $after) {
        nodes {
          id
          name
          path
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

