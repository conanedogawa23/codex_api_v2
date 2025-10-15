import { logger } from '../../../utils/logger';
import { gitlabApiClient } from '../../../utils/gitlabApiClient';
import { GITLAB_USER_QUERIES } from '../../../graphql/types/users/gitlabUserQueries';

/**
 * GitLab User Data Processor
 * Handles comprehensive user data fetching from GitLab API using multiple validated query streams
 * 
 * Architecture:
 * - Uses 19 parallel queries for comprehensive data coverage
 * - Each query fetches a specific data category with validated fields only
 * - All queries execute in parallel for optimal performance
 * - Results are merged into complete user objects
 */
export class GitlabUserProcessor {

  /**
   * Fetch simple user list from GitLab with pagination support
   * Returns minimal user data for initial discovery
   */
  async fetchSimpleUsers(batchSize: number = 100): Promise<any[]> {
    logger.info('Fetching simple users from GitLab', { batchSize });

    const allUsers: any[] = [];
    let hasNextPage = true;
    let after: string | null = null;

    try {
      while (hasNextPage) {
        const result = await gitlabApiClient.executeQuery(GITLAB_USER_QUERIES.SIMPLE_USERS, {
          first: batchSize,
          after: after
        });

        const usersData: any = (result as any)?.data?.users;
        if (usersData?.nodes) {
          allUsers.push(...usersData.nodes);
          hasNextPage = usersData.pageInfo?.hasNextPage || false;
          after = usersData.pageInfo?.endCursor || null;

          logger.debug('Fetched user batch', {
            batchSize: usersData.nodes.length,
            totalUsers: allUsers.length,
            hasNextPage
          });
        } else {
          logger.warn('No users data in response', { 
            hasNodes: !!usersData?.nodes,
            dataKeys: Object.keys((result as any)?.data || {})
          });
          break;
        }
      }

      logger.info('Completed fetching simple users from GitLab', {
        totalUsers: allUsers.length
      });

      return allUsers;
    } catch (error: unknown) {
      logger.error('Error fetching simple users from GitLab', {
        error: error instanceof Error ? error.message : 'Unknown error',
        batchSize
      });
      throw error;
    }
  }

  /**
   * Fetch comprehensive user data from GitLab using all validated query streams
   */
  async fetchUserData(userIds: number[]): Promise<any> {
    logger.info('Fetching comprehensive user data from GitLab (19 query streams)', { 
      userCount: userIds.length,
      userIds: userIds.slice(0, 3)
    });

    try {
      // Convert numeric IDs to GitLab GraphQL ID format
      const gitlabIds = userIds.map(id => `gid://gitlab/User/${id}`);

      // Execute all 19 validated queries in parallel for maximum performance
      const [
        coreIdentityResults,
        profileSocialResults,
        permissionsStatusResults,
        namespaceResults,
        groupMembershipsResults,
        projectMembershipsResults,
        groupsResults,
        authoredMergeRequestsResults,
        assignedMergeRequestsResults,
        reviewRequestedMergeRequestsResults,
        starredProjectsResults,
        contributedProjectsResults,
        snippetsResults,
        timelogsResults,
        todosResults,
        emailsResults,
        calloutsResults,
        savedRepliesResults,
        namespaceCommitEmailsResults
      ] = await Promise.all([
        // Identity & Profile queries
        gitlabApiClient.executeQuery(GITLAB_USER_QUERIES.CORE_IDENTITY, { ids: gitlabIds }),
        gitlabApiClient.executeQuery(GITLAB_USER_QUERIES.PROFILE_SOCIAL, { ids: gitlabIds }),
        gitlabApiClient.executeQuery(GITLAB_USER_QUERIES.PERMISSIONS_STATUS, { ids: gitlabIds }),
        gitlabApiClient.executeQuery(GITLAB_USER_QUERIES.NAMESPACE, { ids: gitlabIds }),
        
        // Membership queries
        gitlabApiClient.executeQuery(GITLAB_USER_QUERIES.GROUP_MEMBERSHIPS, { ids: gitlabIds }),
        gitlabApiClient.executeQuery(GITLAB_USER_QUERIES.PROJECT_MEMBERSHIPS, { ids: gitlabIds }),
        gitlabApiClient.executeQuery(GITLAB_USER_QUERIES.GROUPS, { ids: gitlabIds }),
        
        // Merge Request queries
        gitlabApiClient.executeQuery(GITLAB_USER_QUERIES.AUTHORED_MERGE_REQUESTS, { ids: gitlabIds }),
        gitlabApiClient.executeQuery(GITLAB_USER_QUERIES.ASSIGNED_MERGE_REQUESTS, { ids: gitlabIds }),
        gitlabApiClient.executeQuery(GITLAB_USER_QUERIES.REVIEW_REQUESTED_MERGE_REQUESTS, { ids: gitlabIds }),
        
        // Project queries
        gitlabApiClient.executeQuery(GITLAB_USER_QUERIES.STARRED_PROJECTS, { ids: gitlabIds }),
        gitlabApiClient.executeQuery(GITLAB_USER_QUERIES.CONTRIBUTED_PROJECTS, { ids: gitlabIds }),
        
        // Content queries
        gitlabApiClient.executeQuery(GITLAB_USER_QUERIES.SNIPPETS, { ids: gitlabIds }),
        gitlabApiClient.executeQuery(GITLAB_USER_QUERIES.SAVED_REPLIES, { ids: gitlabIds }),
        
        // Time & Task queries
        gitlabApiClient.executeQuery(GITLAB_USER_QUERIES.TIMELOGS, { ids: gitlabIds }),
        gitlabApiClient.executeQuery(GITLAB_USER_QUERIES.TODOS, { ids: gitlabIds }),
        
        // Settings queries
        gitlabApiClient.executeQuery(GITLAB_USER_QUERIES.EMAILS, { ids: gitlabIds }),
        gitlabApiClient.executeQuery(GITLAB_USER_QUERIES.CALLOUTS, { ids: gitlabIds }),
        gitlabApiClient.executeQuery(GITLAB_USER_QUERIES.NAMESPACE_COMMIT_EMAILS, { ids: gitlabIds })
      ]);

      logger.info('All 19 GitLab user data query streams completed successfully');

      // Merge all data streams using validated fields only
      const mergedData = this.mergeCompleteUserData(
        (coreIdentityResults as any)?.data?.users?.nodes || [],
        coreIdentityResults,
        profileSocialResults,
        permissionsStatusResults,
        namespaceResults,
        groupMembershipsResults,
        projectMembershipsResults,
        groupsResults,
        authoredMergeRequestsResults,
        assignedMergeRequestsResults,
        reviewRequestedMergeRequestsResults,
        starredProjectsResults,
        contributedProjectsResults,
        snippetsResults,
        savedRepliesResults,
        timelogsResults,
        todosResults,
        emailsResults,
        calloutsResults,
        namespaceCommitEmailsResults
      );

      return { data: { users: mergedData } };

    } catch (error: unknown) {
      logger.error('Error fetching comprehensive user data from GitLab', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userCount: userIds.length
      });
      throw error;
    }
  }

  /**
   * Merge all user data from 19 validated query streams into complete user objects
   * Only includes fields confirmed to be available in GitLab API
   */
  private mergeCompleteUserData(
    originalUsers: any[],
    coreIdentity: any,
    profileSocial: any,
    permissionsStatus: any,
    namespace: any,
    groupMemberships: any,
    projectMemberships: any,
    groups: any,
    authoredMergeRequests: any,
    assignedMergeRequests: any,
    reviewRequestedMergeRequests: any,
    starredProjects: any,
    contributedProjects: any,
    snippets: any,
    savedReplies: any,
    timelogs: any,
    todos: any,
    emails: any,
    callouts: any,
    namespaceCommitEmails: any
  ): any {
    return originalUsers.map(user => {
      const coreData = this.findUserData(coreIdentity, user.id);
      const profileData = this.findUserData(profileSocial, user.id);
      const permissionsData = this.findUserData(permissionsStatus, user.id);
      const namespaceData = this.findUserData(namespace, user.id);
      const groupMembershipsData = this.findUserData(groupMemberships, user.id);
      const projectMembershipsData = this.findUserData(projectMemberships, user.id);
      const groupsData = this.findUserData(groups, user.id);
      const authoredMRData = this.findUserData(authoredMergeRequests, user.id);
      const assignedMRData = this.findUserData(assignedMergeRequests, user.id);
      const reviewRequestedMRData = this.findUserData(reviewRequestedMergeRequests, user.id);
      const starredProjectsData = this.findUserData(starredProjects, user.id);
      const contributedProjectsData = this.findUserData(contributedProjects, user.id);
      const snippetsData = this.findUserData(snippets, user.id);
      const savedRepliesData = this.findUserData(savedReplies, user.id);
      const timelogsData = this.findUserData(timelogs, user.id);
      const todosData = this.findUserData(todos, user.id);
      const emailsData = this.findUserData(emails, user.id);
      const calloutsData = this.findUserData(callouts, user.id);
      const namespaceCommitEmailsData = this.findUserData(namespaceCommitEmails, user.id);

      return {
        // Core Identity (21 fields)
        ...coreData,
        
        // Profile & Social Information
        bio: profileData?.bio,
        location: profileData?.location,
        pronouns: profileData?.pronouns,
        organization: profileData?.organization,
        jobTitle: profileData?.jobTitle,
        linkedin: profileData?.linkedin,
        twitter: profileData?.twitter,
        discord: profileData?.discord,
        gitpodEnabled: profileData?.gitpodEnabled,
        preferencesGitpodPath: profileData?.preferencesGitpodPath,
        profileEnableGitpodPath: profileData?.profileEnableGitpodPath,
        
        // Permissions & Status
        userPermissions: permissionsData?.userPermissions,
        status: permissionsData?.status,
        userPreferences: permissionsData?.userPreferences,
        ide: permissionsData?.ide,
        
        // Namespace
        namespace: namespaceData?.namespace,
        
        // Memberships & Groups
        groupMemberships: groupMembershipsData?.groupMemberships?.nodes || [],
        projectMemberships: projectMembershipsData?.projectMemberships?.nodes || [],
        groups: groupsData?.groups?.nodes || [],
        
        // Merge Requests (3 streams)
        authoredMergeRequests: authoredMRData?.authoredMergeRequests?.nodes || [],
        assignedMergeRequests: assignedMRData?.assignedMergeRequests?.nodes || [],
        reviewRequestedMergeRequests: reviewRequestedMRData?.reviewRequestedMergeRequests?.nodes || [],
        
        // Projects (2 streams)
        starredProjects: starredProjectsData?.starredProjects?.nodes || [],
        contributedProjects: contributedProjectsData?.contributedProjects?.nodes || [],
        
        // Content (2 streams)
        snippets: snippetsData?.snippets?.nodes || [],
        savedReplies: savedRepliesData?.savedReplies?.nodes || [],
        
        // Time & Tasks (2 streams)
        timelogs: timelogsData?.timelogs?.nodes || [],
        todos: todosData?.todos?.nodes || [],
        
        // Settings (3 streams)
        emails: emailsData?.emails?.nodes || [],
        callouts: calloutsData?.callouts?.nodes || [],
        namespaceCommitEmails: namespaceCommitEmailsData?.namespaceCommitEmails?.nodes || []
      };
    });
  }

  /**
   * Find user data from query results by user ID
   */
  private findUserData(queryResult: any, userId: string): any {
    return queryResult?.data?.users?.nodes?.find((user: any) => user?.id === userId);
  }
}

// Export singleton instance
export const gitlabUserProcessor = new GitlabUserProcessor();
