# Background Jobs with Bull and Redis

This document describes the background job system implemented using Bull queue library and Redis for the Codex API v2.

## Architecture Overview

```
┌─────────────────┐
│   Codex API v2  │
│   (Express)     │
└────────┬────────┘
         │
         │ initializes
         ▼
┌─────────────────┐      ┌──────────────┐
│   Job Manager   │◄────►│    Redis     │
│   (Singleton)   │      │   (Queue)    │
└────────┬────────┘      └──────────────┘
         │
         │ manages
         ▼
┌─────────────────────────────────────┐
│         Job Schedulers              │
├─────────────────────────────────────┤
│  • User Sync (every 20 min)         │
│  • Project Sync (future)            │
│  • Issue Sync (future)              │
└─────────────────────────────────────┘
         │
         │ processes
         ▼
┌─────────────────────────────────────┐
│         Job Processors              │
├─────────────────────────────────────┤
│  • processUserSync()                │
│  • Batch processing (100 users)    │
│  • Progress tracking                │
│  • Error handling & retries         │
└─────────────────────────────────────┘
         │
         │ updates
         ▼
┌─────────────────┐
│    MongoDB      │
│   (Database)    │
└─────────────────┘
```

## Directory Structure

```
src/jobs/
├── config/
│   └── queue.ts              # Queue configuration & Redis setup
├── processors/
│   └── userSync.processor.ts # User sync job processor
├── schedulers/
│   └── userSync.scheduler.ts # User sync job scheduler
└── index.ts                  # Job manager (singleton)
```

## Components

### 1. Queue Configuration (`config/queue.ts`)

- **Purpose**: Sets up Redis connection and Bull queue configuration
- **Features**:
  - ioredis client with automatic reconnection
  - Event listeners for monitoring
  - Graceful shutdown support
  - Separate subscriber client for Bull

**Key Exports**:
- `userSyncQueue`: Bull queue instance
- `redisClient`: ioredis client
- `closeQueues()`: Graceful shutdown function

### 2. User Sync Processor (`processors/userSync.processor.ts`)

- **Purpose**: Processes user synchronization jobs
- **Features**:
  - Batch processing (default: 100 users per batch)
  - Progress tracking
  - Error handling per user
  - Full vs Incremental sync modes
  - Timestamp updates using moment-timezone

**Job Data Interface**:
```typescript
interface UserSyncJobData {
  syncType: 'full' | 'incremental';
  batchSize?: number;
}
```

**Job Result Interface**:
```typescript
interface UserSyncResult {
  success: boolean;
  usersProcessed: number;
  usersUpdated: number;
  errors: number;
  duration: number;
  timestamp: string;
}
```

### 3. User Sync Scheduler (`schedulers/userSync.scheduler.ts`)

- **Purpose**: Schedules and manages user sync jobs
- **Features**:
  - Repeatable job every 20 minutes
  - Automatic retry (3 attempts) with exponential backoff
  - Job history retention (10 completed, 20 failed)
  - Manual trigger support
  - Pause/resume capabilities
  - Status monitoring

**Key Functions**:
- `initializeUserSyncScheduler()`: Set up recurring job
- `triggerImmediateSync()`: Trigger manual sync
- `getUserSyncSchedulerStatus()`: Get job statistics
- `pauseUserSyncScheduler()`: Pause job execution
- `resumeUserSyncScheduler()`: Resume job execution
- `cleanupOldJobs()`: Remove old completed/failed jobs

### 4. Job Manager (`index.ts`)

- **Purpose**: Centralized management of all background jobs
- **Pattern**: Singleton pattern
- **Features**:
  - Initialize all schedulers
  - Graceful shutdown
  - Status monitoring
  - Manual job triggers

## Configuration

### Environment Variables

Add these to your `.env` file:

```bash
# Redis Configuration
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=          # Optional
REDIS_DB=0               # Default database
```

### Queue Options

**Repeatable Job Configuration**:
```typescript
{
  repeat: {
    every: 20 * 60 * 1000,  // 20 minutes
  },
  removeOnComplete: 10,       // Keep last 10 completed
  removeOnFail: 20,           // Keep last 20 failed
  attempts: 3,                // Retry 3 times
  backoff: {
    type: 'exponential',
    delay: 5000,              // Start with 5s delay
  }
}
```

## API Endpoints

### GET `/health`
Health check including job status

**Response**:
```json
{
  "status": "OK",
  "timestamp": "2025-10-09T12:00:00.000Z",
  "uptime": 3600,
  "database": {
    "status": "connected",
    "responseTime": 5
  },
  "jobs": {
    "initialized": true
  }
}
```

### GET `/jobs/status`
Get detailed job queue status

**Response**:
```json
{
  "success": true,
  "data": {
    "repeatableJobs": [
      {
        "name": "__default__",
        "key": "user-sync:...",
        "every": 1200000,
        "next": 1728475200000
      }
    ],
    "counts": {
      "active": 1,
      "waiting": 0,
      "completed": 45,
      "failed": 2
    },
    "activeJobs": [
      {
        "id": "123",
        "data": { "syncType": "incremental" },
        "progress": 75
      }
    ]
  }
}
```

### POST `/jobs/trigger/user-sync`
Manually trigger a user sync job

**Request Body**:
```json
{
  "syncType": "incremental"  // or "full"
}
```

**Response**:
```json
{
  "success": true,
  "message": "User sync (incremental) triggered successfully",
  "timestamp": "2025-10-09T12:00:00.000Z"
}
```

### POST `/jobs/pause`
Pause all user sync jobs

**Response**:
```json
{
  "success": true,
  "message": "User sync jobs paused"
}
```

### POST `/jobs/resume`
Resume user sync jobs

**Response**:
```json
{
  "success": true,
  "message": "User sync jobs resumed"
}
```

### POST `/jobs/cleanup`
Clean up old completed/failed jobs

**Request Body**:
```json
{
  "gracePeriodHours": 24  // Optional, default: 24
}
```

**Response**:
```json
{
  "success": true,
  "message": "Old jobs cleaned up (grace period: 24h)"
}
```

## Usage Examples

### Initialize Jobs on Server Startup

The job manager is automatically initialized when the server starts:

```typescript
// In server.ts
await this.initializeJobs();
```

### Monitor Job Status

```bash
# Get job status
curl http://localhost:4000/jobs/status

# Check health (includes job status)
curl http://localhost:4000/health
```

### Manual Job Triggers

```bash
# Trigger incremental sync
curl -X POST http://localhost:4000/jobs/trigger/user-sync \
  -H "Content-Type: application/json" \
  -d '{"syncType": "incremental"}'

# Trigger full sync
curl -X POST http://localhost:4000/jobs/trigger/user-sync \
  -H "Content-Type: application/json" \
  -d '{"syncType": "full"}'
```

### Pause/Resume Jobs

```bash
# Pause jobs
curl -X POST http://localhost:4000/jobs/pause

# Resume jobs
curl -X POST http://localhost:4000/jobs/resume
```

### Clean Up Old Jobs

```bash
# Clean up jobs older than 24 hours (default)
curl -X POST http://localhost:4000/jobs/cleanup

# Clean up jobs older than 48 hours
curl -X POST http://localhost:4000/jobs/cleanup \
  -H "Content-Type: application/json" \
  -d '{"gracePeriodHours": 48}'
```

## Job Workflow

### User Sync Job Flow

1. **Trigger**: Every 20 minutes or manual trigger
2. **Initialization**: Job processor starts
3. **Query Building**: Build filter based on sync type
   - **Incremental**: Users not synced in last 20 minutes
   - **Full**: All users
4. **Batch Processing**: Process users in batches of 100
5. **Update**: Update `lastSynced` and `updatedAt` timestamps
6. **Progress Tracking**: Update job progress (0-100%)
7. **Completion**: Log results and store in job history

### Error Handling

- **Per-User Errors**: Logged but don't stop the batch
- **Job Failure**: Automatic retry with exponential backoff
  - Attempt 1: Immediate
  - Attempt 2: After 5 seconds
  - Attempt 3: After 25 seconds (5s × 5)
- **Maximum Retries**: 3 attempts
- **Failed Job Storage**: Last 20 failed jobs kept for debugging

## Monitoring & Logging

### Log Levels

- **info**: Job start, completion, status changes
- **debug**: Batch processing details, user updates
- **warn**: Redis reconnection attempts, stalled jobs
- **error**: Job failures, Redis errors

### Key Metrics Logged

- Users processed
- Users updated
- Error count
- Job duration
- Progress percentage

### Example Log Output

```
[INFO] Initializing user sync scheduler...
[INFO] User sync scheduler initialized successfully
[INFO] Starting user sync job (jobId: 123, syncType: incremental)
[INFO] Users to sync (totalUsers: 150)
[DEBUG] Processing user batch (batchSize: 100, skip: 0)
[DEBUG] User synced successfully (userId: abc123, username: john.doe)
[INFO] User sync job completed successfully
  - usersProcessed: 150
  - usersUpdated: 150
  - errors: 0
  - duration: 3458ms
```

## Best Practices

1. **Redis Connection**: Ensure Redis is running before starting the API
2. **Monitoring**: Regularly check `/jobs/status` for job health
3. **Job Cleanup**: Run cleanup periodically to prevent Redis bloat
4. **Error Investigation**: Review failed jobs in Redis for debugging
5. **Incremental Sync**: Use incremental sync for regular updates
6. **Full Sync**: Use full sync sparingly (manual trigger only)
7. **Batch Size**: Adjust batch size based on server resources

## Extending the System

### Adding New Job Types

1. **Create Processor**:
```typescript
// src/jobs/processors/newJob.processor.ts
export const processNewJob = async (job: Job<DataType>) => {
  // Processing logic
};
```

2. **Create Scheduler**:
```typescript
// src/jobs/schedulers/newJob.scheduler.ts
export const initializeNewJobScheduler = async () => {
  // Schedule logic
};
```

3. **Update Job Manager**:
```typescript
// src/jobs/index.ts
await initializeNewJobScheduler();
```

4. **Create Queue**:
```typescript
// src/jobs/config/queue.ts
export const newJobQueue = new Queue('new-job', queueOptions);
```

## Troubleshooting

### Redis Connection Issues

**Problem**: `ECONNREFUSED` errors

**Solution**:
```bash
# Start Redis
redis-server

# Or with Docker
docker run -d -p 6379:6379 redis:alpine
```

### Jobs Not Running

**Problem**: Jobs scheduled but not executing

**Solutions**:
1. Check Redis connection: `redis-cli ping`
2. Verify job manager initialized: `GET /health`
3. Check queue status: `GET /jobs/status`
4. Review logs for errors

### High Memory Usage

**Problem**: Redis using too much memory

**Solutions**:
1. Clean up old jobs: `POST /jobs/cleanup`
2. Reduce job retention: Update `removeOnComplete` and `removeOnFail`
3. Monitor Redis memory: `redis-cli INFO memory`

### Job Failures

**Problem**: Jobs consistently failing

**Solutions**:
1. Check MongoDB connection
2. Review error logs
3. Verify user data integrity
4. Increase retry attempts if needed

## Performance Considerations

- **Batch Size**: Default 100 users per batch
  - Increase for faster processing (higher memory)
  - Decrease for lower memory usage (slower)
  
- **Job Interval**: Default 20 minutes
  - Adjust based on data freshness requirements
  
- **Concurrency**: Single processor by default
  - Add more processors for parallel execution:
  ```typescript
  queue.process(5, processUserSync); // 5 concurrent jobs
  ```

- **Redis Memory**: Monitor and clean up regularly
  - Use `maxmemory` policy in Redis config
  - Regular cleanup via `/jobs/cleanup`

## References

- [Bull Documentation](https://github.com/optimalbits/bull)
- [ioredis Documentation](https://github.com/redis/ioredis)
- [Redis Best Practices](https://redis.io/docs/latest/develop/use/patterns/)
- [Node.js Queue Best Practices](https://github.com/goldbergyoni/nodebestpractices#8-error-handling-practices)
