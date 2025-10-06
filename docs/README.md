# Codex API v2

> 🚀 A production-ready GraphQL API built with Node.js, TypeScript, Apollo Server, and Mongoose ORM for MongoDB

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Configuration](#configuration)
- [API Documentation](#api-documentation)
- [Development](#development)
- [Development Standards](#development-standards)
- [Deployment](#deployment)
- [Contributing](#contributing)

## 🌟 Overview

Codex API v2 is a comprehensive GraphQL API designed for GitLab project management. It provides a robust, type-safe interface for managing projects, issues, merge requests, pipelines, milestones, labels, tasks, and users with MongoDB as the data store using Mongoose ORM.

## ✨ Features

### Core Features
- ✅ **GraphQL API** - Type-safe, efficient data fetching with Apollo Server
- ✅ **TypeScript** - Full type safety across the entire codebase
- ✅ **Mongoose ORM** - Elegant MongoDB object modeling with TypeScript support
- ✅ **Schema-First Design** - GraphQL schema defined in SDL format
- ✅ **Apollo Rover Integration** - Schema management and validation with Rover CLI

### Data Models
- 📦 **Projects** - Complete project management with status, priority, budget tracking
- 🐛 **Issues** - Issue tracking with tags, estimates, completion tracking
- 🔀 **Merge Requests** - PR/MR management with reviewers and status tracking
- 👥 **Users** - User profiles with roles, departments, and project assignments
- 🏁 **Milestones** - Milestone tracking with due dates and progress
- 🔧 **Pipelines** - CI/CD pipeline monitoring and status tracking
- 🏷️ **Labels** - Flexible labeling system for organization
- ✅ **Tasks** - Detailed task management with dependencies and subtasks

### Production-Ready Features
- 🔒 **Security** - Helmet.js for secure HTTP headers
- 🌐 **CORS** - Configurable cross-origin resource sharing
- 📊 **Health Checks** - Comprehensive health monitoring endpoints
- 📝 **Logging** - Structured logging with Winston
- ⚡ **Performance** - Optimized MongoDB queries with indexes
- 🛡️ **Error Handling** - Comprehensive error handling and validation
- 🔄 **Graceful Shutdown** - Clean resource cleanup on termination
- 🚀 **PM2 Integration** - Production process management with cluster mode

## 🛠 Tech Stack

| Category | Technologies |
|----------|-------------|
| **Runtime** | Node.js 18+ |
| **Language** | TypeScript 5.2+ |
| **API** | GraphQL, Apollo Server Express |
| **Database** | MongoDB 5.0+ |
| **ORM** | Mongoose 7.6+ |
| **Process Manager** | PM2 5.3+ |
| **Tools** | Apollo Rover CLI |
| **Security** | Helmet, CORS |
| **Logging** | Winston |
| **Dev Tools** | ts-node, nodemon, ESLint |

## 📁 Project Structure

```
codex_api_v2/
├── src/
│   ├── config/              # Configuration files
│   │   ├── database.ts      # MongoDB connection config
│   │   └── environment.ts   # Environment variables
│   ├── graphql/
│   │   ├── resolvers/       # GraphQL resolvers
│   │   │   ├── index.ts
│   │   │   ├── userResolver.ts
│   │   │   ├── projectResolver.ts
│   │   │   ├── issueResolver.ts
│   │   │   ├── mergeRequestResolver.ts
│   │   │   ├── taskResolver.ts
│   │   │   ├── milestoneResolver.ts
│   │   │   ├── pipelineResolver.ts
│   │   │   ├── labelResolver.ts
│   │   │   └── healthResolver.ts
│   │   └── schema.graphql   # GraphQL schema definition
│   ├── middleware/          # Express middleware
│   │   ├── errorHandler.ts
│   │   ├── logging.ts
│   │   ├── security.ts
│   │   └── index.ts
│   ├── models/              # Mongoose models
│   │   ├── User.ts
│   │   ├── Project.ts
│   │   ├── Issue.ts
│   │   ├── MergeRequest.ts
│   │   ├── Task.ts
│   │   ├── Milestone.ts
│   │   ├── Pipeline.ts
│   │   ├── PipelineJob.ts
│   │   ├── Label.ts
│   │   ├── Commit.ts
│   │   ├── Discussion.ts
│   │   ├── Note.ts
│   │   ├── Event.ts
│   │   ├── Iteration.ts
│   │   ├── Attachment.ts
│   │   ├── Department.ts
│   │   ├── Namespace.ts
│   │   ├── DraftNote.ts
│   │   └── WikiPage.ts
│   ├── utils/               # Utility functions
│   │   └── logger.ts        # Winston logger setup
│   └── server.ts            # Application entry point
├── logs/                    # Application logs
├── .env.example             # Environment variables template
├── .gitignore
├── package.json
├── tsconfig.json
└── README.md
```

## 🚀 Getting Started

### Prerequisites

- **Node.js** 18.0.0 or higher
- **MongoDB** 5.0 or higher (running locally or accessible remotely)
- **npm** or **yarn** package manager
- **Apollo Rover CLI** (optional, for schema management)

### Installation

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd codex_api_v2
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up environment variables:**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` with your configuration (see [Configuration](#configuration))

4. **Start MongoDB** (if running locally):
   ```bash
   mongod
   ```

5. **Run the development server:**
   ```bash
   npm run dev
   ```

6. **Verify the installation:**
   - Open http://localhost:4000 in your browser
   - Access GraphQL Playground at http://localhost:4000/graphql
   - Check health status at http://localhost:4000/health

## ⚙️ Configuration

Create a `.env` file in the root directory with the following variables:

```env
# Server Configuration
PORT=4000
NODE_ENV=development

# MongoDB Configuration (REQUIRED)
MONGODB_URI=mongodb://localhost:27017/codex_api_v2

# GraphQL Configuration (optional)
GRAPHQL_PLAYGROUND=true
GRAPHQL_INTROSPECTION=true

# Logging (optional)
LOG_LEVEL=info
```

### Environment Variables Reference

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `PORT` | Server port | 4000 | No |
| `NODE_ENV` | Environment (development/production) | development | No |
| `MONGODB_URI` | MongoDB connection string | - | **Yes** |
| `GRAPHQL_PLAYGROUND` | Enable GraphQL Playground | true | No |
| `GRAPHQL_INTROSPECTION` | Enable schema introspection | true | No |
| `LOG_LEVEL` | Logging level (error/warn/info/debug) | info | No |

**Note**: CORS is configured to allow all origins (`*`). See `docs/CORS_CONFIGURATION.md` for details.

## 📖 API Documentation

### GraphQL Endpoint

```
POST http://localhost:4000/graphql
```

### Sample Queries

#### 1. Health Check
```graphql
query {
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

#### 2. List Projects
```graphql
query {
  projects(limit: 10, status: active, priority: high) {
    id
    name
    nameWithNamespace
    status
    priority
    progress
    department
    deadline
    assignedTo {
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
  }
}
```

#### 3. Get User Details
```graphql
query {
  user(id: "60d5ec49f1b2c8b4f8e4a1b2") {
    id
    name
    email
    username
    role
    department
    status
    projects {
      id
      name
      role
    }
  }
}
```

#### 4. List Issues
```graphql
query {
  issues(projectId: 123, state: opened, priority: high, limit: 10) {
    id
    title
    state
    priority
    completionPercentage
    assignees {
      name
      username
    }
    author {
      name
      username
    }
    dueDate
  }
}
```

#### 5. Create Task
```graphql
mutation {
  createTask(input: {
    title: "Implement authentication"
    description: "Add JWT authentication to API"
    projectId: "60d5ec49f1b2c8b4f8e4a1b2"
    priority: high
    status: pending
    estimatedHours: 8
    dueDate: "2024-12-31T00:00:00.000Z"
    tags: ["backend", "security"]
  }) {
    id
    title
    status
    priority
    createdAt
  }
}
```

#### 6. Update Project Progress
```graphql
mutation {
  updateProjectProgress(
    id: "60d5ec49f1b2c8b4f8e4a1b2"
    progress: 75
  ) {
    id
    name
    progress
    status
    tasks {
      completed
      total
    }
  }
}
```

#### 7. Get Merge Requests
```graphql
query {
  mergeRequests(projectId: 123, state: opened, limit: 5) {
    id
    title
    state
    mergeStatus
    sourceBranch
    targetBranch
    author {
      name
      username
    }
    reviewers {
      name
      username
    }
    createdAt
  }
}
```

### REST Endpoints

#### Health Check
```bash
GET /health

Response:
{
  "status": "OK",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 12345,
  "database": {
    "status": "connected",
    "responseTime": 5
  },
  "memory": {
    "usage": { ... }
  }
}
```

## 💻 Development

### Available Scripts

```bash
# Development server with hot-reload
npm run dev

# Build TypeScript to JavaScript
npm run build

# Run production build
npm start

# Lint code
npm run lint

# Clean build artifacts
npm run clean

# Rover CLI - Check schema
npm run rover:check

# Rover CLI - Publish schema
npm run rover:publish

# PM2 - Production process management
npm run pm2:start           # Start in production mode (cluster)
npm run pm2:start:dev       # Start in development mode with watch
npm run pm2:stop            # Stop all instances
npm run pm2:restart         # Restart all instances
npm run pm2:reload          # Zero-downtime reload (cluster mode)
npm run pm2:logs            # View logs
npm run pm2:monit           # Monitor CPU/Memory
npm run pm2:status          # Check status

# Quick PM2 production deployment
npm run deploy:prod         # Build and reload with zero downtime
```

### Using Apollo Rover CLI

Apollo Rover is a CLI tool for managing GraphQL schemas:

1. **Install Rover globally:**
   ```bash
   npm install -g @apollo/rover
   ```

2. **Check your schema for errors:**
   ```bash
   rover graph check --schema ./src/graphql/schema.graphql
   ```

3. **Publish schema to Apollo Studio:**
   ```bash
   rover graph publish my-graph@my-variant --schema ./src/graphql/schema.graphql
   ```

For more information, visit [Apollo Rover Documentation](https://www.apollographql.com/docs/rover/)

### Code Quality

- **TypeScript** - Strict mode enabled for maximum type safety
- **ESLint** - Configured with TypeScript rules
- **Prettier** - Code formatting (recommended to install)

### Database Indexes

The application uses optimized MongoDB indexes for better query performance:

- Projects: `gitlabId`, `pathWithNamespace`, `status`, `priority`, `department`
- Issues: `gitlabId`, `projectId`, `state`, `priority`, `assignees.id`
- Users: `gitlabId`, `email`, `username`, `department`
- Tasks: `projectId`, `status`, `priority`, `assignedTo.id`
- And more...

## 📏 Development Standards

Refer to `docs/DEVELOPMENT_STANDARDS.md` for the canonical coding standards covering Node.js, TypeScript, GraphQL, and MongoDB best practices. The document outlines expectations for schema-first workflows, error handling, testing, security, and collaboration. Review it before proposing architectural changes or introducing new dependencies.

## 🚢 Deployment

### PM2 Production Deployment (Recommended)

PM2 is a production process manager that provides:
- **Zero-downtime deployments** with graceful reload
- **Cluster mode** utilizing all CPU cores
- **Auto-restart** on crashes or high memory
- **Load balancing** across instances
- **Process monitoring** and logging

#### Quick Start with PM2

```bash
# 1. Build the application
npm run build

# 2. Start with PM2 (cluster mode, all CPU cores)
npm run pm2:start

# 3. Save process list for auto-start on reboot
npm run pm2:save

# 4. Setup startup script (run once)
npm run pm2:startup
# Follow the instructions to enable auto-start
```

#### PM2 Management Commands

```bash
# View logs
npm run pm2:logs

# Monitor processes
npm run pm2:monit

# Check status
npm run pm2:status

# Zero-downtime reload (for deployments)
npm run pm2:reload

# Restart all
npm run pm2:restart

# Stop all
npm run pm2:stop
```

#### Quick Deployment Script

Use the provided startup script for automated deployment:

```bash
# Make script executable (first time only)
chmod +x scripts/start-pm2.sh

# Run deployment script
./scripts/start-pm2.sh production

# Or for staging
./scripts/start-pm2.sh staging
```

For complete PM2 documentation, see [`docs/PM2_GUIDE.md`](./PM2_GUIDE.md)

### Production Build (Manual)

1. **Build the application:**
   ```bash
   npm run build
   ```

2. **Set production environment:**
   ```bash
   export NODE_ENV=production
   export GRAPHQL_PLAYGROUND=false
   export GRAPHQL_INTROSPECTION=false
   export LOG_LEVEL=warn
   ```

3. **Start the server:**
   ```bash
   npm start
   ```

### Docker Deployment (Optional)

Create a `Dockerfile`:

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 4000

CMD ["npm", "start"]
```

Build and run:
```bash
docker build -t codex-api-v2 .
docker run -p 4000:4000 --env-file .env codex-api-v2
```

### Environment Considerations

**Production checklist:**
- ✅ Set `NODE_ENV=production`
- ✅ Disable GraphQL Playground (`GRAPHQL_PLAYGROUND=false`)
- ✅ Disable introspection (`GRAPHQL_INTROSPECTION=false`)
- ✅ Use secure MongoDB connection string with authentication
- ✅ Configure proper CORS origins
- ✅ Set appropriate log levels
- ✅ Enable SSL/TLS for MongoDB connections
- ✅ Use process manager (PM2, systemd, etc.)
- ✅ Set up reverse proxy (nginx, Apache)
- ✅ Configure monitoring and alerting

## 📊 Monitoring

### Health Checks

The API provides comprehensive health check endpoints:

- **REST:** `GET /health`
- **GraphQL:** `query { health { ... } }`

Monitor these endpoints for:
- Application status
- Database connectivity
- Response times
- Memory usage
- Uptime

### Logging

Logs are written to:
- `logs/combined.log` - All logs
- `logs/error.log` - Error logs only
- `logs/exceptions.log` - Uncaught exceptions
- `logs/rejections.log` - Unhandled promise rejections

Log format: JSON structured logs with timestamps

## 🤝 Contributing

We welcome contributions! Here's how you can help:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License.

## 🙏 Acknowledgments

- Built with [Apollo Server](https://www.apollographql.com/docs/apollo-server/)
- Database modeling with [Mongoose](https://mongoosejs.com/)
- Inspired by the original [Codex API](https://github.com/conanedogawa23/codex_api)
- GraphQL schema management with [Apollo Rover](https://www.apollographql.com/docs/rover/)

## 📞 Support

For issues and questions:
- Open an issue on GitHub
- Check the GraphQL schema documentation at `/graphql`
- Review the logs in the `logs/` directory

---

**Built with ❤️ using Node.js, TypeScript, GraphQL, and MongoDB**
