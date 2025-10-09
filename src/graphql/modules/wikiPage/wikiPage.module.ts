import { createModule, gql } from 'graphql-modules';
import { WikiPage } from '../../../models/WikiPage';
import { AppError } from '../../../middleware';
import { logger } from '../../../utils/logger';

export const wikiPageModule = createModule({
  id: 'wikiPage',
  typeDefs: gql`
    type WikiPage {
      id: ID!
      slug: String!
      projectId: String!
      title: String!
      content: String!
      format: WikiPageFormat!
      encoding: String
      webUrl: String
      authorId: ID
      lastModifiedBy: ID
      createdAt: DateTime!
      updatedAt: DateTime!
      lastSyncedAt: DateTime!
      isDeleted: Boolean!
    }

    enum WikiPageFormat {
      markdown
      rdoc
      asciidoc
      org
    }

    extend type Query {
      wikiPage(id: ID!): WikiPage
      wikiPageBySlug(projectId: String!, slug: String!): WikiPage
      wikiPages(projectId: String!, limit: Int = 20, offset: Int = 0): [WikiPage!]!
    }
  `,
  resolvers: {
    Query: {
      wikiPage: async (_: any, { id }: { id: string }) => {
        logger.info('Fetching wiki page by ID', { id });
        
        const page = await WikiPage.findById(id).lean();
        
        if (!page) {
          throw new AppError(`Wiki page with ID ${id} not found`, 404);
        }
        
        return page;
      },

      wikiPageBySlug: async (_: any, { projectId, slug }: { projectId: string; slug: string }) => {
        logger.info('Fetching wiki page by slug', { projectId, slug });
        
        const page = await WikiPage.findOne({ projectId, slug, isDeleted: false }).lean();
        
        if (!page) {
          throw new AppError(`Wiki page with slug ${slug} not found in project ${projectId}`, 404);
        }
        
        return page;
      },

      wikiPages: async (_: any, { projectId, limit, offset }: { projectId: string; limit: number; offset: number }) => {
        logger.info('Fetching wiki pages', { projectId, limit, offset });
        
        return await WikiPage.find({ projectId, isDeleted: false })
          .limit(limit)
          .skip(offset)
          .sort({ title: 1 })
          .lean();
      },
    },
  },
});
