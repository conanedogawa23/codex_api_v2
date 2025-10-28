import { logger } from '../../../utils/logger';
import { gitlabApiClient } from '../../../utils/gitlabApiClient';
import { GITLAB_WIKI_PAGE_QUERIES } from '../../../graphql/types/wikiPage/gitlabWikiPageQueries';

export class GitlabWikiPageProcessor {
  async fetchWikiPageData(ids: number[]): Promise<any> {
    const gitlabIds = ids.map(id => `gid://gitlab/WikiPage/${id}`);
    try {
      const results = await Promise.allSettled([
        gitlabApiClient.executeQuery(GITLAB_WIKI_PAGE_QUERIES.CORE_DATA, { ids: gitlabIds }),
        gitlabApiClient.executeQuery(GITLAB_WIKI_PAGE_QUERIES.CONTENT, { ids: gitlabIds }),
        gitlabApiClient.executeQuery(GITLAB_WIKI_PAGE_QUERIES.HISTORY, { ids: gitlabIds })
      ]);

      const [core, content] = results.map((r) => r.status === 'fulfilled' ? r.value : null);
      const corePages = core?.data?.wikiPages?.nodes || [];
      const merged = corePages.map((p: any) => ({
        ...p,
        content: content?.data?.wikiPages?.nodes?.find((c: any) => c.id === p.id)?.content || ''
      }));
      return { data: { wikiPages: merged } };
    } catch (error: unknown) {
      logger.error('Error fetching wiki page data', { error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  }
}

export const gitlabWikiPageProcessor = new GitlabWikiPageProcessor();

