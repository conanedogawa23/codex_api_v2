import { logger } from '../../../utils/logger';
import { gitlabApiClient } from '../../../utils/gitlabApiClient';
import { GITLAB_USER_QUERIES } from '../../../graphql/types/users/gitlabUserQueries';

/**
 * GitLab User Data Processor
 * Handles comprehensive user data fetching and processing from GitLab API
 */
export class GitlabUserProcessor {

  /**
   * Fetch comprehensive user data from GitLab
   */
  async fetchUserData(userIds: number[]): Promise<any> {
    logger.info('Fetching comprehensive user data from GitLab', { userCount: userIds.length });

    try {
      // Execute all queries in parallel for better performance
      const [
        coreIdentityResults,
        contactSocialResults,
        activityStatsResults,
        socialConnectionsResults,
        securityAccessResults,
        developmentActivityResults,
        collaborationResults,
        assetsContentResults,
        timeTrackingResults,
        advancedRelationshipsResults,
        deploymentReleaseResults,
        organizationPermissionsResults,
        userInteractionsResults,
        userReviewsResults,
        userProductivityResults
      ] = await Promise.all([
        gitlabApiClient.executeQuery(GITLAB_USER_QUERIES.CORE_IDENTITY, { ids: userIds }),
        gitlabApiClient.executeQuery(GITLAB_USER_QUERIES.CONTACT_SOCIAL, { ids: userIds }),
        gitlabApiClient.executeQuery(GITLAB_USER_QUERIES.ACTIVITY_STATS, { ids: userIds }),
        gitlabApiClient.executeQuery(GITLAB_USER_QUERIES.SOCIAL_CONNECTIONS, { ids: userIds }),
        gitlabApiClient.executeQuery(GITLAB_USER_QUERIES.SECURITY_ACCESS, { ids: userIds }),
        gitlabApiClient.executeQuery(GITLAB_USER_QUERIES.DEVELOPMENT_ACTIVITY, { ids: userIds }),
        gitlabApiClient.executeQuery(GITLAB_USER_QUERIES.COLLABORATION, { ids: userIds }),
        gitlabApiClient.executeQuery(GITLAB_USER_QUERIES.ASSETS_CONTENT, { ids: userIds }),
        gitlabApiClient.executeQuery(GITLAB_USER_QUERIES.TIME_TRACKING, { ids: userIds }),
        gitlabApiClient.executeQuery(GITLAB_USER_QUERIES.ADVANCED_RELATIONSHIPS, { ids: userIds }),
        gitlabApiClient.executeQuery(GITLAB_USER_QUERIES.DEPLOYMENT_RELEASE, { ids: userIds }),
        gitlabApiClient.executeQuery(GITLAB_USER_QUERIES.ORGANIZATION_PERMISSIONS, { ids: userIds }),
        gitlabApiClient.executeQuery(GITLAB_USER_QUERIES.USER_INTERACTIONS, { ids: userIds }),
        gitlabApiClient.executeQuery(GITLAB_USER_QUERIES.USER_REVIEWS, { ids: userIds }),
        gitlabApiClient.executeQuery(GITLAB_USER_QUERIES.USER_PRODUCTIVITY, { ids: userIds })
      ]);

      logger.info('All GitLab user data queries completed successfully');

      // Merge all data using the merge function
      const mergedData = this.mergeCompleteUserData(
        coreIdentityResults.data?.users?.nodes || [],
        coreIdentityResults,
        contactSocialResults,
        activityStatsResults,
        socialConnectionsResults,
        securityAccessResults,
        developmentActivityResults,
        collaborationResults,
        assetsContentResults,
        timeTrackingResults,
        advancedRelationshipsResults,
        deploymentReleaseResults,
        organizationPermissionsResults,
        userInteractionsResults,
        userReviewsResults,
        userProductivityResults
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
   * Merge all user data from 15 query groups into complete user objects
   */
  private mergeCompleteUserData(
    originalUsers: any[],
    coreIdentity: any,
    contactSocial: any,
    activityStats: any,
    socialConnections: any,
    securityAccess: any,
    developmentActivity: any,
    collaboration: any,
    assetsContent: any,
    timeTracking: any,
    advancedRelationships: any,
    deploymentRelease: any,
    organizationPermissions: any,
    userInteractions: any,
    userReviews: any,
    userProductivity: any
  ): any[] {
    return originalUsers.map(user => {
      const coreData = this.findUserData(coreIdentity, user.id);
      const contactData = this.findUserData(contactSocial, user.id);
      const activityData = this.findUserData(activityStats, user.id);
      const socialData = this.findUserData(socialConnections, user.id);
      const securityData = this.findUserData(securityAccess, user.id);
      const devActivityData = this.findUserData(developmentActivity, user.id);
      const collabData = this.findUserData(collaboration, user.id);
      const assetsData = this.findUserData(assetsContent, user.id);
      const timeData = this.findUserData(timeTracking, user.id);
      const advancedData = this.findUserData(advancedRelationships, user.id);
      const deploymentData = this.findUserData(deploymentRelease, user.id);
      const orgData = this.findUserData(organizationPermissions, user.id);
      const interactionData = this.findUserData(userInteractions, user.id);
      const reviewData = this.findUserData(userReviews, user.id);
      const productivityData = this.findUserData(userProductivity, user.id);

      return {
        ...user,
        ...coreData,

        // Contact & Social Information
        skype: contactData?.skype,
        linkedin: contactData?.linkedin,
        twitter: contactData?.twitter,
        discord: contactData?.discord,
        websiteUrl: contactData?.websiteUrl,
        organization: contactData?.organization,
        jobTitle: contactData?.jobTitle,
        workInformation: contactData?.workInformation,
        localTime: contactData?.localTime,
        status: contactData?.status,
        preferences: contactData?.preferences,
        birthday: contactData?.birthday,
        hireDate: contactData?.hireDate,
        terminationDate: contactData?.terminationDate,
        dashboard: contactData?.dashboard,
        theme: contactData?.theme,
        language: contactData?.language,
        notificationSettings: contactData?.notificationSettings,

        // Activity Statistics
        groupCount: activityData?.groupCount,
        projectCount: activityData?.projectCount,
        contributionsCount: activityData?.contributionsCount,
        discussionsCount: activityData?.discussionsCount,
        issuesCreatedCount: activityData?.issuesCreatedCount,
        mergeRequestsCount: activityData?.mergeRequestsCount,
        commitsCount: activityData?.commitsCount,
        starredProjects: activityData?.starredProjects?.nodes || [],
        snippets: activityData?.snippets?.nodes || [],
        authoredMergeRequests: activityData?.authoredMergeRequests?.nodes || [],
        authoredIssues: activityData?.authoredIssues?.nodes || [],

        // Social Connections
        followers: socialData?.followers?.nodes || [],
        following: socialData?.following?.nodes || [],
        groups: socialData?.groups?.nodes || [],
        authoredDiscussions: socialData?.authoredDiscussions?.nodes || [],
        blockedUsers: interactionData?.blockedUsers?.nodes || [],
        mutedUsers: interactionData?.mutedUsers?.nodes || [],
        watchedProjects: interactionData?.watchedProjects?.nodes || [],
        followedGroups: interactionData?.followedGroups?.nodes || [],

        // Security & Access Control
        isLocked: securityData?.isLocked,
        lockedAt: securityData?.lockedAt,
        unlockAt: securityData?.unlockAt,
        twoFactorEnabled: securityData?.twoFactorEnabled,
        userPermissions: securityData?.userPermissions,
        identities: securityData?.identities?.nodes || [],
        namespace: securityData?.namespace,
        authorizedProjects: securityData?.authorizedProjects?.nodes || [],
        authenticationType: securityData?.authenticationType,
        samlProvider: securityData?.samlProvider,
        ldapInfo: securityData?.ldapInfo,
        oauthApplications: securityData?.oauthApplications?.nodes || [],

        // Development Activity
        reviewRequestedMergeRequests: devActivityData?.reviewRequestedMergeRequests?.nodes || [],
        assignedIssues: devActivityData?.assignedIssues?.nodes || [],
        reviewedMergeRequests: reviewData?.reviewedMergeRequests?.nodes || [],
        approvedMergeRequests: reviewData?.approvedMergeRequests?.nodes || [],
        rejectedMergeRequests: reviewData?.rejectedMergeRequests?.nodes || [],
        commentedMergeRequests: reviewData?.commentedMergeRequests?.nodes || [],

        // Collaboration & Communication
        authoredNotes: collabData?.authoredNotes?.nodes || [],
        authoredCommits: collabData?.authoredCommits?.nodes || [],
        todos: collabData?.todos?.nodes || [],
        mentionedInNotes: interactionData?.mentionedInNotes?.nodes || [],
        mentionedInIssues: interactionData?.mentionedInIssues?.nodes || [],

        // Assets & Content
        authoredSnippets: assetsData?.authoredSnippets?.nodes || [],
        authoredEpicNotes: assetsData?.authoredEpicNotes?.nodes || [],
        authoredVulnerabilityNotes: assetsData?.authoredVulnerabilityNotes?.nodes || [],
        awardEmojis: assetsData?.awardEmojis?.nodes || [],

        // Time Tracking & Productivity
        timelogs: timeData?.timelogs?.nodes || [],
        authoredTimelogs: timeData?.authoredTimelogs?.nodes || [],
        recentActivity: timeData?.recentActivity?.nodes || [],
        timeTrackingEnabled: productivityData?.timeTrackingEnabled,
        weeklyHours: productivityData?.weeklyHours,
        overtimeHours: productivityData?.overtimeHours,
        vacationDays: productivityData?.vacationDays,
        sickDays: productivityData?.sickDays,
        personalDays: productivityData?.personalDays,
        workSchedule: productivityData?.workSchedule,

        // Advanced Relationships
        authoredEpics: advancedData?.authoredEpics?.nodes || [],
        assignedEpics: advancedData?.assignedEpics?.nodes || [],
        authoredRequirements: advancedData?.authoredRequirements?.nodes || [],
        assignedRequirements: advancedData?.assignedRequirements?.nodes || [],
        authoredTestCases: advancedData?.authoredTestCases?.nodes || [],
        assignedTestCases: advancedData?.assignedTestCases?.nodes || [],

        // Deployment & Release Activity
        authoredReleases: deploymentData?.authoredReleases?.nodes || [],
        deployments: deploymentData?.deployments?.nodes || [],
        authoredPackages: deploymentData?.authoredPackages?.nodes || [],
        authoredVulnerabilities: deploymentData?.authoredVulnerabilities?.nodes || [],

        // Organization & Permissions
        groupMemberships: orgData?.groupMemberships?.nodes || [],
        projectMemberships: orgData?.projectMemberships?.nodes || [],
        impersonationTokens: orgData?.impersonationTokens?.nodes || [],
        manager: orgData?.manager,
        reportsTo: orgData?.reportsTo,
        department: orgData?.department,
        costCenter: orgData?.costCenter,
        employeeNumber: orgData?.employeeNumber
      };
    });
  }

  /**
   * Find user data from query results by user ID
   */
  private findUserData(queryResult: any, userId: string): any {
    return queryResult?.data?.users?.nodes?.find((user: any) => user.id === userId);
  }
}

// Export singleton instance
export const gitlabUserProcessor = new GitlabUserProcessor();
