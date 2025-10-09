# Modules Gap Analysis

## Date: October 9, 2025

## Overview

Analysis of Mongoose models vs GraphQL modules to identify implementation gaps.

---

## Current Status

### ✅ Implemented Modules (10 total)

| Module | Model | Status | Queries | Mutations |
|--------|-------|--------|---------|-----------|
| Common | - | ✅ Complete | Scalars | - |
| Health | - | ✅ Complete | 1 | - |
| User | User.ts | ✅ Complete | 4 | 3 |
| Project | Project.ts | ✅ Complete | 4 | 4 |
| Issue | Issue.ts | ✅ Complete | 5 | 6 |
| MergeRequest | MergeRequest.ts | ✅ Complete | 4 | 1 |
| Pipeline | Pipeline.ts | ✅ Complete | 4 | - |
| Milestone | Milestone.ts | ✅ Complete | 4 | 1 |
| Label | Label.ts | ✅ Complete | 4 | 1 |
| Task | Task.ts | ✅ Complete | 4 | 4 |

**Total**: 10 modules, 38 queries, 20 mutations

---

## ❌ Missing Modules (9 total)

### Priority 1: Critical for GitLab Integration

#### 1. **Commit Module** (commit/)
**Model**: `Commit.ts` (142 lines)  
**Priority**: HIGH - Essential for GitLab integration

**Key Fields**:
- sha, shortId (unique identifiers)
- projectId (relationship)
- title, message (content)
- authorName, authorEmail
- committedDate, authoredDate
- stats (additions, deletions, total)
- webUrl

**Suggested Queries**:
- `commit(sha: String!)` - Get commit by SHA
- `commits(projectId: String!, limit: Int, offset: Int)` - List commits
- `commitsByProject(projectId: String!)` - Project commits
- `commitsByAuthor(authorEmail: String!)` - Author commits

**Use Cases**:
- View commit history
- Track code changes
- Link commits to issues/MRs
- Show contributor activity

---

#### 2. **Discussion Module** (discussion/)
**Model**: `Discussion.ts` (81 lines)  
**Priority**: HIGH - Essential for collaboration

**Key Fields**:
- gitlabId (unique)
- projectId (relationship)
- noteableType ('Issue' | 'MergeRequest')
- noteableId (polymorphic relationship)
- individualNote (boolean)
- noteIds (array of Note references)

**Suggested Queries**:
- `discussion(id: ID!)` - Get discussion by ID
- `discussionByGitlabId(gitlabId: String!)` - Get by GitLab ID
- `discussions(noteableId: ID!, noteableType: NoteableType!)` - List discussions
- `discussionsByProject(projectId: String!)` - Project discussions

**Use Cases**:
- View issue/MR discussions
- Track conversation threads
- Show collaboration activity

---

#### 3. **Note Module** (note/)
**Model**: `Note.ts` (142 lines)  
**Priority**: HIGH - Essential for comments

**Key Fields**:
- gitlabId (unique)
- discussionId (optional)
- projectId (relationship)
- noteableType ('Issue' | 'MergeRequest' | 'Commit')
- noteableId (polymorphic)
- body (content)
- authorId (user reference)
- system (boolean)
- resolvable, resolved (for code review)
- resolvedBy, resolvedAt
- confidential, internal

**Suggested Queries**:
- `note(id: ID!)` - Get note by ID
- `noteByGitlabId(gitlabId: Int!)` - Get by GitLab ID
- `notes(noteableId: ID!, noteableType: NoteableType!)` - List notes
- `notesByAuthor(authorId: ID!)` - Author notes
- `unresolvedNotes(projectId: String!)` - Unresolved notes

**Use Cases**:
- View comments on issues/MRs
- Code review feedback
- Discussion threads
- Resolve conversations

---

### Priority 2: Important for Operations

#### 4. **Event Module** (event/)
**Model**: `Event.ts` (104 lines)  
**Priority**: MEDIUM - Important for activity tracking

**Key Fields**:
- gitlabId (unique)
- projectId (relationship)
- authorId (user reference)
- actionName (e.g., "pushed", "commented")
- targetType, targetTitle
- createdAt, pushedAt

**Suggested Queries**:
- `event(id: ID!)` - Get event by ID
- `events(projectId: String!, limit: Int)` - List events
- `eventsByUser(userId: ID!)` - User activity
- `recentEvents(limit: Int)` - Recent activity

**Use Cases**:
- Activity feeds
- Audit logs
- User activity tracking
- Project timeline

---

#### 5. **PipelineJob Module** (pipelineJob/)
**Model**: `PipelineJob.ts` (152 lines)  
**Priority**: MEDIUM - Complements pipeline module

**Key Fields**:
- gitlabId (unique)
- pipelineId (relationship)
- projectId (relationship)
- name, stage, status
- createdAt, startedAt, finishedAt
- duration, queuedDuration
- webUrl, artifacts

**Suggested Queries**:
- `pipelineJob(id: ID!)` - Get job by ID
- `pipelineJobs(pipelineId: String!)` - Jobs in pipeline
- `pipelineJobsByStage(pipelineId: String!, stage: String!)` - Stage jobs
- `failedPipelineJobs(projectId: String!)` - Failed jobs

**Use Cases**:
- View pipeline job details
- Track job status
- Debug pipeline failures
- Download artifacts

---

### Priority 3: Organizational Structure

#### 6. **Namespace Module** (namespace/)
**Model**: `Namespace.ts` (132 lines)  
**Priority**: MEDIUM - For organizational structure

**Key Fields**:
- gitlabId (unique)
- name, path, fullPath
- kind ('user' | 'group')
- description
- visibility
- avatarUrl, webUrl

**Suggested Queries**:
- `namespace(id: ID!)` - Get namespace by ID
- `namespaceByGitlabId(gitlabId: Int!)` - Get by GitLab ID
- `namespaces(kind: String)` - List namespaces
- `namespaceByPath(path: String!)` - Get by path

**Use Cases**:
- Organization structure
- Group management
- Access control
- Project organization

---

#### 7. **Iteration Module** (iteration/)
**Model**: `Iteration.ts` (106 lines)  
**Priority**: MEDIUM - For sprint/iteration management

**Key Fields**:
- gitlabId (unique)
- groupId (relationship)
- title, description
- state ('upcoming' | 'started' | 'closed')
- startDate, dueDate
- webUrl

**Suggested Queries**:
- `iteration(id: ID!)` - Get iteration by ID
- `iterationByGitlabId(gitlabId: Int!)` - Get by GitLab ID
- `iterations(groupId: String!, state: IterationState)` - List iterations
- `activeIterations(groupId: String!)` - Active sprints

**Use Cases**:
- Sprint planning
- Iteration tracking
- Milestone management
- Agile workflows

---

#### 8. **Department Module** (department/)
**Model**: `Department.ts` (131 lines)  
**Priority**: LOW - For custom organization

**Key Fields**:
- name, description
- code (unique)
- budget (allocated, spent, currency)
- teamSize
- isActive

**Suggested Queries**:
- `department(id: ID!)` - Get department by ID
- `departmentByCode(code: String!)` - Get by code
- `departments(isActive: Boolean)` - List departments

**Use Cases**:
- Department management
- Budget tracking
- Team organization
- Resource allocation

---

### Priority 4: Supporting Features

#### 9. **Attachment Module** (attachment/)
**Model**: `Attachment.ts` (97 lines)  
**Priority**: LOW - File management

**Key Fields**:
- filename, filesize
- url, downloadUrl
- attachableType, attachableId
- contentType

**Suggested Queries**:
- `attachment(id: ID!)` - Get attachment
- `attachments(attachableId: ID!)` - List attachments

**Use Cases**:
- File management
- Download links
- Attachment tracking

---

#### 10. **WikiPage Module** (wikiPage/)
**Model**: `WikiPage.ts` (91 lines)  
**Priority**: LOW - Documentation

**Key Fields**:
- slug, title
- content, format
- projectId
- webUrl

**Suggested Queries**:
- `wikiPage(id: ID!)` - Get wiki page
- `wikiPageBySlug(projectId: String!, slug: String!)` - Get by slug
- `wikiPages(projectId: String!)` - List wiki pages

**Use Cases**:
- Documentation
- Project wiki
- Knowledge base

---

#### 11. **DraftNote Module** (draftNote/)
**Model**: `DraftNote.ts` (84 lines)  
**Priority**: LOW - Draft functionality

**Key Fields**:
- gitlabId (unique)
- projectId
- authorId
- note (content)
- noteableType, noteableId

**Suggested Queries**:
- `draftNote(id: ID!)` - Get draft note
- `draftNotes(authorId: ID!)` - User drafts

**Use Cases**:
- Save draft comments
- Pending feedback
- Work in progress

---

## Implementation Recommendation

### Phase 1: Critical GitLab Features (Immediate)
Implement these 3 modules for complete GitLab integration:

1. **Commit** - Essential for version control integration
2. **Discussion** - Essential for collaboration
3. **Note** - Essential for comments and feedback

**Estimated Effort**: 6-8 hours  
**Impact**: High - Completes core GitLab feature set

---

### Phase 2: Operational Features (Short-term)
Implement these 2 modules for better operations:

4. **Event** - Activity tracking and audit logs
5. **PipelineJob** - Complete CI/CD monitoring

**Estimated Effort**: 4-6 hours  
**Impact**: Medium - Improves visibility and debugging

---

### Phase 3: Organizational Structure (Mid-term)
Implement these 2 modules for better organization:

6. **Namespace** - Organizational hierarchy
7. **Iteration** - Sprint/iteration management

**Estimated Effort**: 4-6 hours  
**Impact**: Medium - Better project organization

---

### Phase 4: Supporting Features (Future)
Implement these 3 modules as needed:

8. **Department** - Custom organization
9. **Attachment** - File management
10. **WikiPage** - Documentation
11. **DraftNote** - Draft functionality

**Estimated Effort**: 6-8 hours  
**Impact**: Low - Nice to have features

---

## Module Implementation Template

Each module should include:

```typescript
// ✅ Type definitions with GitLab fields
// ✅ Queries: byId, byGitlabId, list, byProject
// ✅ Mutations: update operations
// ✅ Error handling with AppError
// ✅ Winston logging (NO console.log)
// ✅ .lean() for all read-only queries
// ✅ Pagination (limit, offset)
// ✅ Proper indexes on models
```

---

## Next Steps

1. **Immediate**: Implement Phase 1 (Commit, Discussion, Note)
2. **Document**: Update GITLAB_INTEGRATION.md with new modules
3. **Test**: Verify all queries and mutations
4. **Update**: Register new modules in application.ts
5. **Optimize**: Ensure .lean() usage on all queries

---

## Statistics

**Current Coverage**: 10/19 models (52.6%)  
**Missing Coverage**: 9/19 models (47.4%)  
**Phase 1 Target**: 13/19 models (68.4%)  
**Phase 2 Target**: 15/19 models (78.9%)  
**Full Coverage**: 19/19 models (100%)

---

**Status**: Analysis Complete  
**Priority**: Implement Phase 1 (3 modules)  
**Expected Impact**: Complete core GitLab integration

---

*Analysis completed: October 9, 2025*
