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
  async getProject(projectId: number): Promise<GitLabProjectResponse> {
    try {
      logger.debug('Fetching project from GitLab', { projectId });

      const response = await this.client.get<GitLabProjectResponse>(`/projects/${projectId}`);

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message = error.response?.data?.message || error.message;
        logger.error('Failed to fetch project from GitLab', {
          error: message,
          status: error.response?.status,
          projectId,
        });
        throw new AppError(`GitLab project fetch failed: ${message}`, error.response?.status || 500);
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
export type { GitLabProjectResponse, CreateProjectInput };

