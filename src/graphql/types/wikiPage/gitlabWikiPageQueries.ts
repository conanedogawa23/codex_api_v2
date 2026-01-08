/**
 * GitLab WikiPage GraphQL Queries
 * WikiPages are project-level and use project context
 */

export const GITLAB_WIKI_PAGE_QUERIES = {
  CORE_DATA: `
    query GetWikiPageCoreData($projectPath: ID!, $slug: String!) {
      project(fullPath: $projectPath) {
        wikiPage(slug: $slug) {
          id
          title
          slug
          format
          createdAt
          updatedAt
        }
      }
    }
  `,

  CONTENT: `
    query GetWikiPageContent($projectPath: ID!, $slug: String!) {
      project(fullPath: $projectPath) {
        wikiPage(slug: $slug) {
          id
          content
        }
      }
    }
  `,

  HISTORY: `
    query GetWikiPageHistory($projectPath: ID!, $slug: String!) {
      project(fullPath: $projectPath) {
        wikiPage(slug: $slug) {
          id
        }
      }
    }
  `,

  SIMPLE_LIST: `
    query GetSimpleWikiPageList($first: Int!, $after: String, $projectPath: ID!) {
      project(fullPath: $projectPath) {
        wikiPages(first: $first, after: $after) {
          nodes {
            id
            title
            slug
            format
            createdAt
            updatedAt
            content
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

