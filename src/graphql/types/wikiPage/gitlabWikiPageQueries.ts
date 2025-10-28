/**
 * GitLab WikiPage GraphQL Queries
 * 3 categories: CORE_DATA, CONTENT, HISTORY
 */

export const GITLAB_WIKI_PAGE_QUERIES = {
  CORE_DATA: `
    query GetWikiPageCoreData($ids: [ID!]!) {
      wikiPages(ids: $ids) {
        nodes {
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
    query GetWikiPageContent($ids: [ID!]!) {
      wikiPages(ids: $ids) {
        nodes {
          id
          content
        }
      }
    }
  `,

  HISTORY: `
    query GetWikiPageHistory($ids: [ID!]!) {
      wikiPages(ids: $ids) {
        nodes {
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

