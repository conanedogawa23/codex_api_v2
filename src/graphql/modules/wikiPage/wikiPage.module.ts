import { createModule, gql } from 'graphql-modules';
import { WikiPage } from '../../../models/WikiPage';
import { AppError } from '../../../middleware';
import { GraphQLContext, requireCurrentUser } from '../../../utils/auth';
import { logger } from '../../../utils/logger';
import { requireProjectAccess, withProjectFilter } from '../../../utils/rbac';

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
    WikiPage: {
      id: (parent: any) => parent._id?.toString() || parent.id,
    },
    
    Query: {
      wikiPage: async (_: any, { id }: { id: string }, context: GraphQLContext) => {
        requireCurrentUser(context);
        logger.info('Fetching wiki page by ID', { id });
        
        const page = await WikiPage.findById(id).lean();
        
        if (!page) {
          throw new AppError(`Wiki page with ID ${id} not found`, 404);
        }

        await requireProjectAccess(context, page.projectId, 'gitlab');
        
        return page;
      },

      wikiPageBySlug: async (
        _: any,
        { projectId, slug }: { projectId: string; slug: string },
        context: GraphQLContext
      ) => {
        requireCurrentUser(context);
        logger.info('Fetching wiki page by slug', { projectId, slug });
        
        const page = await WikiPage.findOne({ projectId, slug, isDeleted: false }).lean();
        
        if (!page) {
          throw new AppError(`Wiki page with slug ${slug} not found in project ${projectId}`, 404);
        }

        await requireProjectAccess(context, page.projectId, 'gitlab');
        
        return page;
      },

      wikiPages: async (
        _: any,
        { projectId, limit, offset }: { projectId: string; limit: number; offset: number },
        context: GraphQLContext
      ) => {
        requireCurrentUser(context);
        logger.info('Fetching wiki pages', { projectId, limit, offset });

        const filter = await withProjectFilter(
          context,
          { projectId, isDeleted: false },
          'projectId',
          'gitlab'
        );

        return await WikiPage.find(filter)
          .limit(limit)
          .skip(offset)
          .sort({ title: 1 })
          .lean();
      },
    },
  },
});
