import { logger } from '../../../utils/logger';
import { gitlabApiClient } from '../../../utils/gitlabApiClient';
import { GITLAB_NOTE_QUERIES } from '../../../graphql/types/note/gitlabNoteQueries';

export class GitlabNoteProcessor {
  async fetchNoteData(ids: number[]): Promise<any> {
    const gitlabIds = ids.map(id => `gid://gitlab/Note/${id}`);
    try {
      const results = await Promise.allSettled([
        gitlabApiClient.executeQuery(GITLAB_NOTE_QUERIES.CORE_DATA, { ids: gitlabIds }),
        gitlabApiClient.executeQuery(GITLAB_NOTE_QUERIES.REACTIONS, { ids: gitlabIds })
      ]);

      const [core, reactions] = results.map((r) => r.status === 'fulfilled' ? r.value : null);
      const coreNotes = core?.data?.notes?.nodes || [];
      const merged = coreNotes.map((n: any) => ({
        ...n,
        awardEmoji: reactions?.data?.notes?.nodes?.find((r: any) => r.id === n.id)?.awardEmoji || { nodes: [] }
      }));
      return { data: { notes: merged } };
    } catch (error: unknown) {
      logger.error('Error fetching note data', { error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  }
}

export const gitlabNoteProcessor = new GitlabNoteProcessor();

