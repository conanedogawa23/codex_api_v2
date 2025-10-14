import { logger } from './logger';

interface GitLabGraphQLResponse<T = unknown> {
  data?: T;
  errors?: Array<{
    message: string;
    locations?: Array<{ line: number; column: number }>;
    path?: string[];
  }>;
}

/**
 * GitLab API Client
 * Simple HTTP client for making GraphQL requests to GitLab API
 */
export class GitlabApiClient {
  private readonly apiUrl: string;
  private readonly token: string;

  constructor() {
    this.apiUrl = process.env.GITLAB_GRAPHQL_URL || 'https://gitlab.com/api/graphql';
    this.token = process.env.GITLAB_PERSONAL_ACCESS_TOKEN || '';

    if (!this.token) {
      throw new Error('GITLAB_PERSONAL_ACCESS_TOKEN environment variable is required');
    }
  }

  /**
   * Execute a GraphQL query against GitLab API
   */
  async executeQuery<T = unknown>(query: string, variables: Record<string, unknown> = {}): Promise<GitLabGraphQLResponse<T>> {
    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        },
        body: JSON.stringify({
          query,
          variables
        })
      });

      if (!response.ok) {
        throw new Error(`GitLab API request failed: ${response.statusText}`);
      }

      const result = await response.json();

      if (result.errors) {
        logger.error('GitLab GraphQL errors', { errors: result.errors });
        throw new Error(`GitLab GraphQL errors: ${JSON.stringify(result.errors)}`);
      }

      return result;
    } catch (error: unknown) {
      logger.error('Error executing GitLab GraphQL query', {
        error: error instanceof Error ? error.message : 'Unknown error',
        variables
      });
      throw error;
    }
  }
}

// Export singleton instance
export const gitlabApiClient = new GitlabApiClient();
