/**
 * GitLab Namespace GraphQL Queries
 * 4 categories: CORE_DATA, PROJECTS, GROUPS, STATISTICS
 */

export const GITLAB_NAMESPACE_QUERIES = {
  CORE_DATA: `
    query GetNamespaceCoreData($ids: [ID!]!) {
      namespaces(ids: $ids) {
        nodes {
          id
          name
          path
          fullName
          fullPath
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
    }
  `,

  PROJECTS: `
    query GetNamespaceProjects($ids: [ID!]!) {
      namespaces(ids: $ids) {
        nodes {
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
    }
  `,

  GROUPS: `
    query GetNamespaceGroups($ids: [ID!]!) {
      namespaces(ids: $ids) {
        nodes {
          id
          ... on Group {
            descendantGroups {
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
      }
    }
  `,

  STATISTICS: `
    query GetNamespaceStatistics($ids: [ID!]!) {
      namespaces(ids: $ids) {
        nodes {
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
    }
  `,

  SIMPLE_LIST: `
    query GetSimpleNamespaceList($first: Int!, $after: String) {
      namespaces(first: $first, after: $after) {
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

