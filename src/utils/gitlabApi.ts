import axios, { AxiosInstance, AxiosError } from 'axios';
import { environment } from '../config/environment';
import { logger } from './logger';
import { AppError } from '../middleware';

interface GitLabProjectResponse {
  id: number;
  name: string;
  name_with_namespace: string;
  description: string | null;
  path: string;
  path_with_namespace: string;
  default_branch: string;
  visibility: 'private' | 'internal' | 'public';
  web_url: string;
  http_url_to_repo: string;
  ssh_url_to_repo: string;
  namespace: {
    id: number;
    name: string;
    path: string;
    kind: string;
    full_path: string;
  };
  created_at: string;
  last_activity_at: string;
}

interface GitLabProjectEventResponse {
  id: number;
  project_id: number;
  action_name: string;
  target_id: number | null;
  target_iid: number | null;
  target_type: string | null;
  author_id: number | null;
  target_title: string | null;
  created_at: string;
  author?: {
    id: number;
    username: string;
    name: string;
    avatar_url?: string;
    web_url?: string;
  };
  push_data?: {
    commit_count: number;
    action: string;
    ref_type: string;
    commit_from?: string;
    commit_to?: string;
    ref?: string;
    commit_title?: string;
  };
}

interface GitLabCommitResponse {
  id: string;
  short_id: string;
  title: string;
  author_name: string;
  author_email: string;
  authored_date: string;
  committer_name: string;
  committer_email: string;
  committed_date: string;
  created_at: string;
  message: string;
  web_url: string;
  parent_ids: string[];
  stats?: {
    additions: number;
    deletions: number;
    total: number;
  };
}

export interface GitLabCommitListPage {
  commits: GitLabCommitResponse[];
  total: number | null;
}

interface GitLabPipelineResponse {
  id: number;
  iid: number;
  project_id: number;
  sha: string;
  ref: string;
  status: string;
  source: string;
  created_at: string;
  updated_at: string;
  web_url: string;
  before_sha?: string;
  tag?: boolean;
  started_at?: string | null;
  finished_at?: string | null;
  committed_at?: string | null;
  duration?: number | null;
  queued_duration?: number | null;
  coverage?: number | null;
}

interface CreateProjectInput {
  name: string;
  description?: string;
  visibility?: 'private' | 'internal' | 'public';
  initialize_with_readme?: boolean;
  namespace_id?: number;
}

class GitLabApiService {
  private client: AxiosInstance;
  private token: string;

  constructor() {
    const config = environment.get();
    
    if (!config.gitlab.token) {
      throw new Error('GitLab Personal Access Token is not configured');
    }

    this.token = config.gitlab.token;
    this.client = axios.create({
      baseURL: config.gitlab.apiUrl,
      headers: {
        'PRIVATE-TOKEN': this.token,
        'Content-Type': 'application/json',
      },
      timeout: 30000, // 30 seconds
    });

    // Add request interceptor for logging
    this.client.interceptors.request.use(
      (config) => {
        logger.debug('GitLab API Request', {
          method: config.method,
          url: config.url,
          data: config.data,
        });
        return config;
      },
      (error) => {
        logger.error('GitLab API Request Error', { error: error.message });
        return Promise.reject(error);
      }
    );

    // Add response interceptor for logging
    this.client.interceptors.response.use(
      (response) => {
        logger.debug('GitLab API Response', {
          status: response.status,
          url: response.config.url,
        });
        return response;
      },
      (error) => {
        this.handleError(error);
        return Promise.reject(error);
      }
    );
  }

  private handleError(error: AxiosError): void {
    if (error.response) {
      logger.error('GitLab API Error Response', {
        status: error.response.status,
        data: error.response.data,
        url: error.config?.url,
      });
    } else if (error.request) {
      logger.error('GitLab API No Response', {
        message: error.message,
        url: error.config?.url,
      });
    } else {
      logger.error('GitLab API Request Setup Error', {
        message: error.message,
      });
    }
  }

  /**
   * Create a new project in GitLab
   * @param input Project creation parameters
   * @returns Created project data from GitLab
   */
  async createProject(input: CreateProjectInput): Promise<GitLabProjectResponse> {
    try {
      logger.info('Creating project in GitLab', { name: input.name });

      const response = await this.client.post<GitLabProjectResponse>('/projects', {
        name: input.name,
        description: input.description || '',
        visibility: input.visibility || 'private',
        initialize_with_readme: input.initialize_with_readme ?? true,
        namespace_id: input.namespace_id,
      });

      logger.info('Project created successfully in GitLab', {
        gitlabId: response.data.id,
        name: response.data.name,
        webUrl: response.data.web_url,
      });

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message = error.response?.data?.message || error.message;
        logger.error('Failed to create project in GitLab', {
          error: message,
          status: error.response?.status,
          input,
        });
        throw new AppError(`GitLab project creation failed: ${message}`, error.response?.status || 500);
      }
      throw error;
    }
  }

  /**
   * Get project details from GitLab by project ID
   * @param projectId GitLab project ID
   * @returns Project data from GitLab
   */
  async getProject(projectRef: number | string): Promise<GitLabProjectResponse> {
    try {
      logger.debug('Fetching project from GitLab', { projectRef });

      const encodedProjectRef =
        typeof projectRef === 'string' ? encodeURIComponent(projectRef) : projectRef;
      const response = await this.client.get<GitLabProjectResponse>(`/projects/${encodedProjectRef}`);

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message = error.response?.data?.message || error.message;
        logger.error('Failed to fetch project from GitLab', {
          error: message,
          status: error.response?.status,
          projectRef,
        });
        throw new AppError(`GitLab project fetch failed: ${message}`, error.response?.status || 500);
      }
      throw error;
    }
  }

  async listProjectCommitsPage(
    projectPath: string,
    page: number = 1,
    perPage: number = 100
  ): Promise<GitLabCommitListPage> {
    try {
      logger.debug('Fetching project commits from GitLab', {
        projectPath,
        page,
        perPage,
      });

      const response = await this.client.get<GitLabCommitResponse[]>(
        `/projects/${encodeURIComponent(projectPath)}/repository/commits`,
        {
          params: {
            page,
            per_page: perPage,
            all: true,
            with_stats: true,
          },
        }
      );

      const rawTotal = response.headers['x-total'];
      let total: number | null = null;
      if (rawTotal !== undefined && rawTotal !== '') {
        const parsed = parseInt(String(rawTotal), 10);
        if (!Number.isNaN(parsed)) {
          total = parsed;
        }
      }

      return { commits: response.data, total };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message = error.response?.data?.message || error.message;
        logger.error('Failed to fetch project commits from GitLab', {
          error: message,
          status: error.response?.status,
          projectPath,
          page,
          perPage,
        });
        throw new AppError(`GitLab project commits fetch failed: ${message}`, error.response?.status || 500);
      }
      throw error;
    }
  }

  async listProjectCommits(
    projectPath: string,
    page: number = 1,
    perPage: number = 100
  ): Promise<GitLabCommitResponse[]> {
    const { commits } = await this.listProjectCommitsPage(projectPath, page, perPage);
    return commits;
  }

  async listProjectPipelines(
    projectPath: string,
    page: number = 1,
    perPage: number = 100
  ): Promise<GitLabPipelineResponse[]> {
    try {
      logger.debug('Fetching project pipelines from GitLab', {
        projectPath,
        page,
        perPage,
      });

      const response = await this.client.get<GitLabPipelineResponse[]>(
        `/projects/${encodeURIComponent(projectPath)}/pipelines`,
        {
          params: {
            page,
            per_page: perPage,
          },
        }
      );

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message = error.response?.data?.message || error.message;
        logger.error('Failed to fetch project pipelines from GitLab', {
          error: message,
          status: error.response?.status,
          projectPath,
          page,
          perPage,
        });
        throw new AppError(`GitLab project pipelines fetch failed: ${message}`, error.response?.status || 500);
      }
      throw error;
    }
  }

  async getProjectPipeline(projectPath: string, pipelineId: number): Promise<GitLabPipelineResponse> {
    try {
      logger.debug('Fetching project pipeline from GitLab', { projectPath, pipelineId });

      const response = await this.client.get<GitLabPipelineResponse>(
        `/projects/${encodeURIComponent(projectPath)}/pipelines/${pipelineId}`
      );

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message = error.response?.data?.message || error.message;
        logger.error('Failed to fetch project pipeline from GitLab', {
          error: message,
          status: error.response?.status,
          projectPath,
          pipelineId,
        });
        throw new AppError(`GitLab project pipeline fetch failed: ${message}`, error.response?.status || 500);
      }
      throw error;
    }
  }

  /**
   * Get recent project events from GitLab by project path.
   * Uses the REST endpoint because GitLab GraphQL does not expose a global event feed.
   */
  async getProjectEvents(projectPath: string, perPage: number = 100): Promise<GitLabProjectEventResponse[]> {
    try {
      logger.debug('Fetching project events from GitLab', { projectPath, perPage });

      const response = await this.client.get<GitLabProjectEventResponse[]>(
        `/projects/${encodeURIComponent(projectPath)}/events`,
        {
          params: {
            per_page: perPage,
          },
        }
      );

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message = error.response?.data?.message || error.message;
        logger.error('Failed to fetch project events from GitLab', {
          error: message,
          status: error.response?.status,
          projectPath,
        });
        throw new AppError(`GitLab project events fetch failed: ${message}`, error.response?.status || 500);
      }
      throw error;
    }
  }

  /**
   * Update project in GitLab
   * @param projectId GitLab project ID
   * @param updates Updates to apply
   * @returns Updated project data
   */
  async updateProject(
    projectId: number,
    updates: Partial<CreateProjectInput>
  ): Promise<GitLabProjectResponse> {
    try {
      logger.info('Updating project in GitLab', { projectId, updates });

      const response = await this.client.put<GitLabProjectResponse>(
        `/projects/${projectId}`,
        updates
      );

      logger.info('Project updated successfully in GitLab', {
        gitlabId: response.data.id,
        name: response.data.name,
      });

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message = error.response?.data?.message || error.message;
        logger.error('Failed to update project in GitLab', {
          error: message,
          status: error.response?.status,
          projectId,
        });
        throw new AppError(`GitLab project update failed: ${message}`, error.response?.status || 500);
      }
      throw error;
    }
  }

  /**
   * Check if GitLab API is accessible
   * @returns true if API is accessible
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.client.get('/version');
      return true;
    } catch (error) {
      logger.error('GitLab API health check failed', { error });
      return false;
    }
  }
}

// Export singleton instance
export const gitlabApi = new GitLabApiService();

// Export types
export type {
  GitLabProjectResponse,
  GitLabProjectEventResponse,
  GitLabCommitResponse,
  GitLabPipelineResponse,
  CreateProjectInput,
};

