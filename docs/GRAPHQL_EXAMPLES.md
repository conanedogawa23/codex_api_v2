# GraphQL Query & Mutation Examples

Comprehensive examples for Codex API v2 GraphQL operations.

## Table of Contents

- [Health & System](#health--system)
- [User Operations](#user-operations)
- [Project Operations](#project-operations)
- [Issue Operations](#issue-operations)
- [Merge Request Operations](#merge-request-operations)
- [Task Operations](#task-operations)
- [Milestone Operations](#milestone-operations)
- [Pipeline Operations](#pipeline-operations)
- [Label Operations](#label-operations)

---

## Health & System

### Check System Health

```graphql
query SystemHealth {
  health {
    status
    timestamp
    database {
      status
      responseTime
    }
    version
  }
}
```

---

## User Operations

### Get Single User

```graphql
query GetUser {
  user(id: "60d5ec49f1b2c8b4f8e4a1b2") {
    id
    name
    email
    username
    role
    department
    status
    skills
    projects {
      id
      name
      role
    }
    createdAt
    updatedAt
  }
}
```

### List Users

```graphql
query ListUsers {
  users(
    status: active
    department: "Engineering"
    limit: 10
    offset: 0
  ) {
    id
    name
    email
    username
    role
    department
    status
  }
}
```

### Find User by Email

```graphql
query FindUserByEmail {
  userByEmail(email: "john.doe@example.com") {
    id
    name
    email
    department
    projects {
      name
      role
    }
  }
}
```

### Update User

```graphql
mutation UpdateUser {
  updateUser(
    id: "60d5ec49f1b2c8b4f8e4a1b2"
    input: {
      role: "Senior Developer"
      department: "Engineering"
      status: active
      skills: ["TypeScript", "GraphQL", "MongoDB"]
    }
  ) {
    id
    name
    role
    department
    skills
  }
}
```

### Add Project to User

```graphql
mutation AddUserProject {
  addUserProject(
    id: "60d5ec49f1b2c8b4f8e4a1b2"
    projectId: "proj123"
    projectName: "API Development"
    role: "Lead Developer"
  ) {
    id
    name
    projects {
      id
      name
      role
    }
  }
}
```

---

## Project Operations

### Get Single Project

```graphql
query GetProject {
  project(id: "60d5ec49f1b2c8b4f8e4a1b2") {
    id
    gitlabId
    name
    nameWithNamespace
    description
    status
    priority
    progress
    department
    deadline
    assignedTo {
      id
      name
      role
      department
    }
    tasks {
      total
      completed
      inProgress
      pending
    }
    budget {
      allocated
      spent
      currency
    }
    webUrl
    createdAt
    lastActivityAt
  }
}
```

### List Projects

```graphql
query ListProjects {
  projects(
    status: active
    priority: high
    department: "Engineering"
    limit: 20
  ) {
    id
    name
    status
    priority
    progress
    deadline
    tasks {
      total
      completed
    }
  }
}
```

### Find Overdue Projects

```graphql
query OverdueProjects {
  overdueProjects {
    id
    name
    deadline
    status
    progress
    department
  }
}
```

### Update Project

```graphql
mutation UpdateProject {
  updateProject(
    id: "60d5ec49f1b2c8b4f8e4a1b2"
    input: {
      status: active
      priority: high
      progress: 75
      deadline: "2024-12-31T00:00:00.000Z"
    }
  ) {
    id
    name
    status
    priority
    progress
    deadline
  }
}
```

### Update Project Progress

```graphql
mutation UpdateProgress {
  updateProjectProgress(
    id: "60d5ec49f1b2c8b4f8e4a1b2"
    progress: 85
  ) {
    id
    name
    progress
    status
    tasks {
      total
      completed
    }
  }
}
```

### Assign User to Project

```graphql
mutation AssignUser {
  assignUserToProject(
    projectId: "60d5ec49f1b2c8b4f8e4a1b2"
    userId: "user123"
    userName: "John Doe"
    role: "Developer"
    department: "Engineering"
  ) {
    id
    name
    assignedTo {
      id
      name
      role
      department
    }
  }
}
```

---

## Issue Operations

### Get Single Issue

```graphql
query GetIssue {
  issue(id: "60d5ec49f1b2c8b4f8e4a1b2") {
    id
    gitlabId
    iid
    title
    description
    state
    priority
    completionPercentage
    tags
    labels
    estimatedHours
    actualHours
    assignees {
      id
      name
      username
      email
    }
    author {
      name
      username
    }
    milestone {
      id
      title
      dueDate
    }
    webUrl
    dueDate
    createdAt
    updatedAt
  }
}
```

### List Issues

```graphql
query ListIssues {
  issues(
    projectId: 123
    state: opened
    priority: high
    limit: 10
  ) {
    id
    title
    state
    priority
    completionPercentage
    assignees {
      name
      username
    }
    dueDate
    createdAt
  }
}
```

### Find Overdue Issues

```graphql
query OverdueIssues {
  overdueIssues {
    id
    title
    priority
    dueDate
    assignees {
      name
    }
  }
}
```

### Update Issue

```graphql
mutation UpdateIssue {
  updateIssue(
    id: "60d5ec49f1b2c8b4f8e4a1b2"
    input: {
      priority: high
      completionPercentage: 60
      estimatedHours: 8
      actualHours: 5
    }
  ) {
    id
    title
    priority
    completionPercentage
    estimatedHours
    actualHours
  }
}
```

### Add Tag to Issue

```graphql
mutation AddIssueTag {
  addIssueTag(
    id: "60d5ec49f1b2c8b4f8e4a1b2"
    tag: "urgent"
  ) {
    id
    title
    tags
  }
}
```

---

## Task Operations

### Create Task

```graphql
mutation CreateTask {
  createTask(input: {
    title: "Implement user authentication"
    description: "Add JWT-based authentication system"
    projectId: "60d5ec49f1b2c8b4f8e4a1b2"
    priority: high
    status: pending
    estimatedHours: 16
    dueDate: "2024-12-31T00:00:00.000Z"
    tags: ["backend", "security", "authentication"]
  }) {
    id
    title
    status
    priority
    estimatedHours
    dueDate
    tags
    createdAt
  }
}
```

### List Tasks

```graphql
query ListTasks {
  tasks(
    projectId: "60d5ec49f1b2c8b4f8e4a1b2"
    status: in_progress
    priority: high
    limit: 10
  ) {
    id
    title
    status
    priority
    completionPercentage
    estimatedHours
    actualHours
    dueDate
    assignedTo {
      name
      email
    }
  }
}
```

### Update Task

```graphql
mutation UpdateTask {
  updateTask(
    id: "60d5ec49f1b2c8b4f8e4a1b2"
    input: {
      status: in_progress
      completionPercentage: 50
      actualHours: 8
    }
  ) {
    id
    title
    status
    completionPercentage
    actualHours
  }
}
```

### Update Task Progress

```graphql
mutation UpdateTaskProgress {
  updateTaskProgress(
    id: "60d5ec49f1b2c8b4f8e4a1b2"
    percentage: 75
  ) {
    id
    title
    completionPercentage
    status
  }
}
```

---

## Merge Request Operations

### Get Merge Request

```graphql
query GetMergeRequest {
  mergeRequest(id: "60d5ec49f1b2c8b4f8e4a1b2") {
    id
    gitlabId
    iid
    title
    description
    state
    mergeStatus
    sourceBranch
    targetBranch
    labels
    assignees {
      name
      username
    }
    reviewers {
      name
      username
    }
    author {
      name
      username
    }
    webUrl
    createdAt
    updatedAt
    mergedAt
  }
}
```

### List Merge Requests

```graphql
query ListMergeRequests {
  mergeRequests(
    projectId: 123
    state: opened
    limit: 10
  ) {
    id
    title
    state
    mergeStatus
    sourceBranch
    targetBranch
    author {
      name
    }
    reviewers {
      name
    }
    createdAt
  }
}
```

---

## Milestone Operations

### Get Milestone

```graphql
query GetMilestone {
  milestone(id: "60d5ec49f1b2c8b4f8e4a1b2") {
    id
    gitlabId
    title
    description
    state
    dueDate
    startDate
    webUrl
    issueIds
    mergeRequestIds
    createdAt
  }
}
```

### List Milestones

```graphql
query ListMilestones {
  milestones(
    projectId: "60d5ec49f1b2c8b4f8e4a1b2"
    state: active
    limit: 10
  ) {
    id
    title
    state
    dueDate
    issueIds
  }
}
```

---

## Pipeline Operations

### Get Pipeline

```graphql
query GetPipeline {
  pipeline(id: "60d5ec49f1b2c8b4f8e4a1b2") {
    id
    gitlabId
    ref
    sha
    status
    source
    tag
    webUrl
    duration
    coverage
    createdAt
    startedAt
    finishedAt
  }
}
```

### List Pipelines

```graphql
query ListPipelines {
  pipelines(
    projectId: "60d5ec49f1b2c8b4f8e4a1b2"
    status: success
    ref: "main"
    limit: 10
  ) {
    id
    ref
    status
    duration
    coverage
    createdAt
  }
}
```

---

## Label Operations

### Get Label

```graphql
query GetLabel {
  label(id: "60d5ec49f1b2c8b4f8e4a1b2") {
    id
    gitlabId
    name
    color
    description
    priority
    openIssuesCount
    closedIssuesCount
    openMergeRequestsCount
  }
}
```

### List Labels

```graphql
query ListLabels {
  labels(
    projectId: "60d5ec49f1b2c8b4f8e4a1b2"
    limit: 20
  ) {
    id
    name
    color
    description
    openIssuesCount
    closedIssuesCount
  }
}
```

---

## Complex Queries

### Project Dashboard

```graphql
query ProjectDashboard {
  project(id: "60d5ec49f1b2c8b4f8e4a1b2") {
    name
    status
    priority
    progress
    deadline
    assignedTo {
      name
      role
    }
    tasks {
      total
      completed
      inProgress
      pending
    }
  }
  
  issues(projectId: 123, state: opened, limit: 5) {
    title
    priority
    completionPercentage
    assignees {
      name
    }
  }
  
  mergeRequests(projectId: 123, state: opened, limit: 5) {
    title
    state
    author {
      name
    }
  }
}
```

### User Workload

```graphql
query UserWorkload {
  user(id: "60d5ec49f1b2c8b4f8e4a1b2") {
    name
    department
    projects {
      name
      role
    }
  }
  
  tasks(assignedToId: "60d5ec49f1b2c8b4f8e4a1b2", status: in_progress) {
    title
    priority
    completionPercentage
    estimatedHours
    actualHours
  }
  
  issues(assigneeId: 123, state: opened) {
    title
    priority
    dueDate
  }
}
```

---

## Tips

1. **Use Variables:** Instead of hardcoding IDs, use GraphQL variables
2. **Request Only What You Need:** Select only required fields for better performance
3. **Pagination:** Use `limit` and `offset` for large datasets
4. **Error Handling:** Always handle errors in your client application
5. **Caching:** Leverage Apollo Client caching for better UX

For more information, visit the GraphQL Playground at http://localhost:4000/graphql

