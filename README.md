# Codex API v2

> Production-ready GraphQL API powered by Node.js, TypeScript, Apollo Server, and MongoDB via Mongoose

**Status**: ✅ Complete - All 8 GraphQL modules implemented  
**Build**: ✅ Passing  
**Date**: October 9, 2025

## What's New

🎉 **Background Jobs with Bull + Redis** - Automated scheduling for periodic data updates

- ✅ Background job system using Bull queue library
- ✅ Redis integration for job management
- ✅ User sync jobs running every 20 minutes
- ✅ Job monitoring and management REST API
- ✅ Graceful shutdown and error handling

🎉 **Full GitLab Integration Architecture** - Complete API system ready for GitLab MCP integration

- ✅ 8 fully functional GraphQL modules (Project, Issue, MergeRequest, Pipeline, Milestone, Label, Task, User)
- ✅ 55 GraphQL operations (33 queries + 22 mutations)
- ✅ 19 Mongoose models mapped to MongoDB collections
- ✅ Complete TypeScript type safety
- ✅ Comprehensive documentation

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Access GraphQL Playground
open http://localhost:4000/graphql
```

## Documentation

All documentation lives inside the `docs/` directory:

### Core Documentation
- **`docs/README.md`** – Project overview, setup, deployment
- **`docs/SETUP_GUIDE.md`** – Environment configuration
- **`docs/GRAPHQL_EXAMPLES.md`** – Sample queries and mutations
- **`docs/QUICK_REFERENCE.md`** – Handy commands and snippets

### Background Jobs Documentation
- **`docs/BACKGROUND_JOBS.md`** – Complete background jobs guide
- **`docs/JOBS_QUICK_START.md`** – Quick start guide for jobs

### Implementation Docs
- **`docs/GITLAB_INTEGRATION.md`** – Complete GitLab integration guide
- **`docs/IMPLEMENTATION_COMPLETE.md`** – Full implementation summary
- **`docs/ARCHITECTURE_ANALYSIS.md`** – Architecture decisions and verification
- **`docs/ARCHITECTURE_SUMMARY.md`** – Quick reference guide

### Standards
- **`docs/DEVELOPMENT_STANDARDS.md`** – Coding standards and best practices
- **`docs/MODULAR_GRAPHQL_ARCHITECTURE.md`** – GraphQL Modules architecture

## Features

### GraphQL Modules (All Implemented)

| Module | Queries | Mutations | Status |
|--------|---------|-----------|--------|
| Project | 4 | 6 | ✅ Complete |
| Issue | 5 | 6 | ✅ Complete |
| MergeRequest | 4 | 1 | ✅ Complete |
| Pipeline | 4 | 0 | ✅ Complete |
| Milestone | 4 | 1 | ✅ Complete |
| Label | 4 | 1 | ✅ Complete |
| Task | 4 | 4 | ✅ Complete |
| User | 4 | 3 | ✅ Complete |

### 🚀 Architecture
- 📦 **Modular GraphQL** - GraphQL Modules architecture for scalability
- 🔗 **GitLab Integration** - Read from GitLab-synced MongoDB data
- 🎯 **Type Safety** - End-to-end TypeScript with strict mode
- ⚡ **Performance Optimized** - Mongoose `.lean()` for 5-10x faster queries
- 🏗️ **19 Data Models** - Complete domain coverage
- 🔄 **Background Jobs** - Bull + Redis for scheduled tasks (20-minute intervals)
- 📊 **Job Monitoring** - REST API for job status and management

### Integration Architecture

```
GitLab (via MCP) → External Sync Service → MongoDB → Codex API v2 → Clients
```

**Note**: GitLab data sync is handled by a separate service using GitLab MCP. This API provides GraphQL queries and mutations for the synced data.

## Technology Stack

- **Runtime**: Node.js 18+
- **Language**: TypeScript 5.2+
- **API Framework**: Apollo Server Express 3.12+
- **Database**: MongoDB via Mongoose 7.6+
- **Cache/Queue**: Redis with ioredis
- **Job System**: Bull queue library
- **Architecture**: GraphQL Modules 2.3+
- **Process Manager**: PM2 (production)

## Example Queries

```graphql
# Get projects with filters
query {
  projects(status: active, limit: 10) {
    id
    gitlabId
    name
    status
    progress
    assignedTo {
      name
      role
    }
  }
}

# Get issues for a project
query {
  issuesByProject(projectId: 566, state: opened) {
    id
    title
    state
    priority
    assignees {
      name
    }
  }
}

# Update project progress
mutation {
  updateProjectProgress(id: "507f...", progress: 75) {
    id
    name
    progress
  }
}
```

See `docs/GRAPHQL_EXAMPLES.md` for more examples.

## Environment Setup

Create a `.env` file in the project root:

```env
NODE_ENV=development
PORT=4000
MONGODB_URI=mongodb://localhost:27017/codex_api
GRAPHQL_PLAYGROUND=true
GRAPHQL_INTROSPECTION=true
LOG_LEVEL=debug
```

See `docs/SETUP_GUIDE.md` for complete configuration details.

## Development Commands

```bash
npm run dev         # Start development server with hot reload
npm run build       # Compile TypeScript to JavaScript
npm start           # Run production build
npm run lint        # Run ESLint
npm run clean       # Remove dist folder
```

## Production Deployment

```bash
# Build and start with PM2
npm run build
npm run pm2:start

# Monitor
npm run pm2:status
npm run pm2:logs
npm run pm2:monit
```

## Project Structure

```
codex_api_v2/
├── src/
│   ├── graphql/
│   │   ├── modules/           # 8 GraphQL modules
│   │   │   ├── project/
│   │   │   ├── issue/
│   │   │   ├── mergeRequest/
│   │   │   ├── pipeline/
│   │   │   ├── milestone/
│   │   │   ├── label/
│   │   │   ├── task/
│   │   │   └── user/
│   │   └── application.ts     # Module registration
│   ├── models/                # 19 Mongoose models
│   ├── middleware/            # Express middleware
│   ├── utils/                 # Utility functions
│   └── server.ts              # Application entry point
├── docs/                      # Complete documentation
└── dist/                      # Compiled JavaScript
```

## MongoDB Collections

19 collections in the `codex_api` database:

- projects, issues, merge_requests, pipelines, pipeline_jobs
- milestones, labels, users, tasks, commits
- discussions, notes, events, attachments, wiki_pages
- draft_notes, iterations, namespaces, departments

## Health Check

```bash
# API health
curl http://localhost:4000/health

# Response
{
  "status": "OK",
  "timestamp": "2025-10-09T...",
  "database": {
    "status": "connected",
    "responseTime": 2
  }
}
```

## Contributing

1. Follow the coding standards in `docs/DEVELOPMENT_STANDARDS.md`
2. Use the modular architecture pattern in `docs/MODULAR_GRAPHQL_ARCHITECTURE.md`
3. Add tests for new features
4. Update documentation as needed

## Documentation

### Key Documents
- **[GitLab Integration](docs/GITLAB_INTEGRATION.md)** - GitLab integration architecture
- **[Implementation Complete](docs/IMPLEMENTATION_COMPLETE.md)** - Feature summary
- **[Complete Optimization Summary](docs/COMPLETE_OPTIMIZATION_SUMMARY.md)** - Performance optimization details
- **[Lean Optimization](docs/LEAN_OPTIMIZATION.md)** - Mongoose `.lean()` guide
- **[Legacy Cleanup](docs/LEGACY_CLEANUP.md)** - Architecture cleanup details
- **[GraphQL Architecture](docs/MODULAR_GRAPHQL_ARCHITECTURE.md)** - Modular design
- **[Development Standards](docs/DEVELOPMENT_STANDARDS.md)** - Coding guidelines

## Support

For questions or issues:
1. Check `docs/GITLAB_INTEGRATION.md` for integration details
2. Review `docs/COMPLETE_OPTIMIZATION_SUMMARY.md` for performance details
3. See `docs/IMPLEMENTATION_COMPLETE.md` for feature summary
4. See GraphQL Playground for schema introspection
5. Check server logs for debugging

## License

MIT

---

**Built with GraphQL Modules for maximum scalability and maintainability** 🚀
