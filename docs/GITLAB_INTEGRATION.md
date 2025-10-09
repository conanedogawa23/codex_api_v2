# GitLab Integration Guide

## Overview

Codex API v2 is fully integrated with GitLab through MCP (Model Context Protocol). The API provides GraphQL endpoints to query and manage GitLab data stored in MongoDB.

## Architecture

```
GitLab (Source) 
    ↓ (via GitLab MCP)
External Sync Service (Separate Project)
    ↓ (writes to)
MongoDB
    ↓ (reads from)
Codex API v2 (GraphQL)
    ↓ (serves to)
Clients
```

**Important**: This API does NOT perform syncing directly. GitLab data synchronization should be handled by a separate sync service that uses:
- **GitLab MCP**: To fetch data from GitLab
- **MongoDB MCP**: To write data to MongoDB

## Available Modules

All modules are fully implemented and registered:

### 1. Project Module
- **Model**: `Project.ts`
- **Module**: `graphql/modules/project/project.module.ts`
- **Queries**:
  - `project(id: ID!)`: Get project by MongoDB ID
  - `projectByGitlabId(gitlabId: Int!)`: Get project by GitLab ID
  - `projects(...)`: List projects with filters
  - `projectsByNamespace(namespacePath: String!)`: Get projects by namespace

- **Mutations**:
  - `updateProject(id: ID!, input: UpdateProjectInput!)`: Update project
  - `updateProjectProgress(id: ID!, progress: Int!)`: Update progress
  - `assignUserToProject(...)`: Assign user to project
  - `unassignUserFromProject(...)`: Remove user from project

### 2. Issue Module
- **Model**: `Issue.ts`
- **Module**: `graphql/modules/issue/issue.module.ts`
- **Queries**:
  - `issue(id: ID!)`: Get issue by ID
  - `issueByGitlabId(gitlabId: Int!)`: Get issue by GitLab ID
  - `issues(...)`: List issues with filters
  - `issuesByProject(projectId: Int!)`: Get issues by project
  - `overdueIssues(limit: Int)`: Get overdue issues

- **Mutations**:
  - `updateIssue(id: ID!, input: UpdateIssueInput!)`: Update issue
  - `updateIssueProgress(id: ID!, percentage: Int!)`: Update progress
  - `addIssueTag(id: ID!, tag: String!)`: Add tag
  - `removeIssueTag(id: ID!, tag: String!)`: Remove tag
  - `closeIssue(id: ID!)`: Close issue
  - `reopenIssue(id: ID!)`: Reopen issue

### 3. MergeRequest Module
- **Model**: `MergeRequest.ts`
- **Module**: `graphql/modules/mergeRequest/mergeRequest.module.ts`
- **Queries**:
  - `mergeRequest(id: ID!)`: Get merge request by ID
  - `mergeRequestByGitlabId(gitlabId: Int!)`: Get MR by GitLab ID
  - `mergeRequests(...)`: List merge requests with filters
  - `mergeRequestsByProject(projectId: Int!)`: Get MRs by project

- **Mutations**:
  - `updateMergeRequest(id: ID!, input: UpdateMergeRequestInput!)`: Update MR

### 4. Pipeline Module
- **Model**: `Pipeline.ts`
- **Module**: `graphql/modules/pipeline/pipeline.module.ts`
- **Queries**:
  - `pipeline(id: ID!)`: Get pipeline by ID
  - `pipelineByGitlabId(gitlabId: Int!)`: Get pipeline by GitLab ID
  - `pipelines(...)`: List pipelines with filters
  - `pipelinesByProject(projectId: String!)`: Get pipelines by project

### 5. Milestone Module
- **Model**: `Milestone.ts`
- **Module**: `graphql/modules/milestone/milestone.module.ts`
- **Queries**:
  - `milestone(id: ID!)`: Get milestone by ID
  - `milestoneByGitlabId(gitlabId: Int!)`: Get milestone by GitLab ID
  - `milestones(...)`: List milestones with filters
  - `milestonesByProject(projectId: String!)`: Get milestones by project

- **Mutations**:
  - `updateMilestone(id: ID!, input: UpdateMilestoneInput!)`: Update milestone

### 6. Label Module
- **Model**: `Label.ts`
- **Module**: `graphql/modules/label/label.module.ts`
- **Queries**:
  - `label(id: ID!)`: Get label by ID
  - `labelByName(projectId: Int!, name: String!)`: Get label by name
  - `labels(...)`: List labels with filters
  - `labelsByProject(projectId: Int!)`: Get labels by project

- **Mutations**:
  - `updateLabel(id: ID!, input: UpdateLabelInput!)`: Update label

### 7. Task Module
- **Model**: `Task.ts`
- **Module**: `graphql/modules/task/task.module.ts`
- **Queries**:
  - `task(id: ID!)`: Get task by ID
  - `tasks(...)`: List tasks with filters
  - `tasksByProject(projectId: String!)`: Get tasks by project
  - `tasksByIssue(issueId: String!)`: Get tasks by issue

- **Mutations**:
  - `createTask(input: CreateTaskInput!)`: Create new task
  - `updateTask(id: ID!, input: UpdateTaskInput!)`: Update task
  - `deleteTask(id: ID!)`: Delete task
  - `completeTask(id: ID!, actualHours: Float)`: Complete task

### 8. User Module
- **Model**: `User.ts`
- **Module**: `graphql/modules/user/user.module.ts`
- **Queries**:
  - `user(id: ID!)`: Get user by ID
  - `userByEmail(email: String!)`: Get user by email
  - `userByGitlabId(gitlabId: Int!)`: Get user by GitLab ID
  - `users(...)`: List users with filters

- **Mutations**:
  - `updateUser(id: ID!, input: UpdateUserInput!)`: Update user
  - `addUserProject(...)`: Add project to user
  - `removeUserProject(...)`: Remove project from user

## Data Flow

### 1. Syncing Data from GitLab

**Use GitLab MCP** (in separate sync service):

```typescript
// Example sync service (external to this API)
import { mcp_GitLab_list_projects } from '@gitlab-mcp';
import { mcp_MongoDB_insert_many } from '@mongodb-mcp';

async function syncProjects() {
  // Fetch from GitLab using GitLab MCP
  const gitlabProjects = await mcp_GitLab_list_projects({
    per_page: 100
  });
  
  // Transform data
  const projectsData = gitlabProjects.map(gp => ({
    gitlabId: parseInt(gp.id),
    name: gp.name,
    pathWithNamespace: gp.path_with_namespace,
    // ... map all fields
    lastSynced: new Date(),
    isActive: !gp.archived
  }));
  
  // Write to MongoDB using MongoDB MCP
  await mcp_MongoDB_insert_many({
    database: 'codex_api',
    collection: 'projects',
    documents: projectsData
  });
}
```

### 2. Querying Data via GraphQL

Once data is synced to MongoDB, use the GraphQL API:

```graphql
# Get all active projects
query GetProjects {
  projects(status: active, limit: 20) {
    id
    gitlabId
    name
    pathWithNamespace
    status
    progress
    namespace {
      name
      path
    }
    assignedTo {
      name
      role
    }
  }
}

# Get issues for a project
query GetProjectIssues {
  issuesByProject(projectId: 566, state: opened) {
    id
    gitlabId
    iid
    title
    state
    priority
    assignees {
      name
      username
    }
    labels
  }
}

# Get merge requests
query GetMergeRequests {
  mergeRequestsByProject(projectId: 566, state: opened) {
    id
    gitlabId
    iid
    title
    sourceBranch
    targetBranch
    author {
      name
      username
    }
    reviewers {
      name
    }
  }
}

# Get pipelines
query GetPipelines {
  pipelinesByProject(projectId: "566", status: running) {
    id
    gitlabId
    ref
    sha
    status
    duration
    webUrl
  }
}
```

### 3. Updating Data

```graphql
# Update project
mutation UpdateProject {
  updateProject(
    id: "507f1f77bcf86cd799439011"
    input: {
      status: active
      progress: 75
      priority: high
    }
  ) {
    id
    name
    status
    progress
  }
}

# Update issue
mutation UpdateIssue {
  updateIssue(
    id: "507f1f77bcf86cd799439012"
    input: {
      priority: urgent
      estimatedHours: 8
    }
  ) {
    id
    title
    priority
    estimatedHours
  }
}

# Create task
mutation CreateTask {
  createTask(input: {
    title: "Implement feature X"
    description: "Detailed description"
    status: in_progress
    priority: high
    projectId: "507f1f77bcf86cd799439011"
    estimatedHours: 16
  }) {
    id
    title
    status
  }
}
```

## GitLab MCP Tools Available

The following GitLab MCP tools can be used in your sync service:

### Projects
- `mcp_GitLab_list_projects`: List all projects
- `mcp_GitLab_get_project`: Get project details
- `mcp_GitLab_list_group_projects`: List projects in group

### Issues
- `mcp_GitLab_list_issues`: List issues
- `mcp_GitLab_get_issue`: Get issue details
- `mcp_GitLab_my_issues`: Get current user's issues
- `mcp_GitLab_list_issue_discussions`: Get issue discussions

### Merge Requests
- `mcp_GitLab_list_merge_requests`: List merge requests
- `mcp_GitLab_get_merge_request`: Get MR details
- `mcp_GitLab_get_merge_request_diffs`: Get MR diffs
- `mcp_GitLab_mr_discussions`: Get MR discussions

### Pipelines
- `mcp_GitLab_list_pipelines`: List pipelines
- `mcp_GitLab_get_pipeline`: Get pipeline details
- `mcp_GitLab_list_pipeline_jobs`: List pipeline jobs
- `mcp_GitLab_get_pipeline_job`: Get job details

### Milestones
- `mcp_GitLab_list_milestones`: List milestones
- `mcp_GitLab_get_milestone`: Get milestone details
- `mcp_GitLab_get_milestone_issue`: Get milestone issues
- `mcp_GitLab_get_milestone_merge_requests`: Get milestone MRs

### Labels
- `mcp_GitLab_list_labels`: List labels
- `mcp_GitLab_get_label`: Get label details

### Commits
- `mcp_GitLab_list_commits`: List commits
- `mcp_GitLab_get_commit`: Get commit details
- `mcp_GitLab_get_commit_diff`: Get commit diff

### Users
- `mcp_GitLab_get_users`: Get user details
- `mcp_GitLab_list_project_members`: List project members

### Events
- `mcp_GitLab_list_events`: List user events
- `mcp_GitLab_get_project_events`: Get project events

## MongoDB Collections

All data is stored in the `codex_api` database with the following collections:

- `projects` - GitLab projects
- `issues` - GitLab issues
- `merge_requests` - GitLab merge requests
- `pipelines` - CI/CD pipelines
- `pipeline_jobs` - Pipeline jobs
- `milestones` - Project milestones
- `labels` - Issue/MR labels
- `users` - GitLab users
- `tasks` - Custom tasks (not from GitLab)
- `commits` - Git commits
- `discussions` - Issue/MR discussions
- `notes` - Comments
- `events` - GitLab events
- `attachments` - File attachments
- `wiki_pages` - Wiki pages
- `draft_notes` - Draft comments
- `iterations` - Sprint iterations
- `namespaces` - GitLab namespaces
- `departments` - Custom departments

## Example Sync Service Structure

```typescript
// sync-service/index.ts
import { logger } from './utils/logger';

class GitLabSyncService {
  async syncAll() {
    await this.syncProjects();
    await this.syncIssues();
    await this.syncMergeRequests();
    await this.syncPipelines();
    await this.syncMilestones();
    await this.syncLabels();
    await this.syncUsers();
  }

  async syncProjects() {
    // Use GitLab MCP to fetch
    // Use MongoDB MCP to upsert
  }

  // ... other sync methods
}

// Run sync every hour
setInterval(async () => {
  const service = new GitLabSyncService();
  await service.syncAll();
}, 3600000);
```

## Best Practices

1. **Separate Concerns**: Keep sync logic separate from API logic
2. **Use Upserts**: Always use `upsert: true` to update existing records
3. **Error Handling**: Log errors but continue syncing other entities
4. **Pagination**: Use GitLab MCP pagination for large datasets
5. **Rate Limiting**: Respect GitLab API rate limits
6. **Incremental Sync**: Track last sync time and only fetch updates
7. **Data Validation**: Validate data before inserting into MongoDB
8. **Indexes**: Ensure proper indexes on `gitlabId` fields for performance

## Testing

### 1. Start the API
```bash
npm run dev
```

### 2. Access GraphQL Playground
Navigate to: `http://localhost:4000/graphql`

### 3. Test Queries
```graphql
# Check health
query {
  health
}

# List projects
query {
  projects(limit: 5) {
    id
    name
    gitlabId
  }
}
```

## Troubleshooting

### No Data Returned
- Ensure sync service has run and populated MongoDB
- Check MongoDB connection: `GET /health`
- Verify collection has data using MongoDB MCP

### GitLab ID Not Found
- Sync may not have run for that entity
- Check if entity exists in GitLab
- Verify sync service mapping logic

### Performance Issues
- Add indexes on frequently queried fields
- Use `limit` and `offset` for pagination
- Consider caching frequently accessed data

## Next Steps

1. **Create Sync Service**: Build separate service for GitLab → MongoDB sync
2. **Schedule Syncs**: Set up cron jobs or interval-based syncing
3. **Add Webhooks**: Listen to GitLab webhooks for real-time updates
4. **Implement Caching**: Add Redis caching for frequently accessed data
5. **Add DataLoader**: Implement DataLoader for N+1 query prevention
6. **Add Authentication**: Implement JWT-based authentication
7. **Add Authorization**: Implement role-based access control

## References

- [GraphQL Modules Documentation](https://the-guild.dev/graphql/modules)
- [Mongoose Documentation](https://mongoosejs.com/)
- [GitLab API Documentation](https://docs.gitlab.com/ee/api/)
- [MongoDB MCP Documentation](https://modelcontextprotocol.io/)

---

**Status**: ✅ All modules implemented and tested
**Last Updated**: October 9, 2025
