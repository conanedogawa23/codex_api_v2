# Background Jobs Quick Start Guide

Get started with the Bull + Redis background job system in minutes!

## Prerequisites

- Node.js >= 18.0.0
- Redis server (installed and running)
- MongoDB (for data persistence)

## Step 1: Install Redis

### macOS (using Homebrew)
```bash
brew install redis
brew services start redis
```

### Linux (Ubuntu/Debian)
```bash
sudo apt-get update
sudo apt-get install redis-server
sudo systemctl start redis-server
```

### Docker
```bash
docker run -d --name redis -p 6379:6379 redis:alpine
```

### Verify Redis is Running
```bash
redis-cli ping
# Should return: PONG
```

## Step 2: Configure Environment

Add Redis configuration to your `.env` file:

```bash
# Redis Configuration
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=              # Leave empty if no password
REDIS_DB=0
```

## Step 3: Install Dependencies

Dependencies are already installed if you ran `npm install`. If not:

```bash
npm install bull ioredis moment-timezone @types/bull @types/moment-timezone
```

## Step 4: Start the Server

```bash
# Development mode
npm run dev

# Production mode
npm run build
npm start

# With PM2
npm run pm2:start
```

## Step 5: Verify Jobs are Running

### Check Health Endpoint
```bash
curl http://localhost:4000/health
```

Expected response:
```json
{
  "status": "OK",
  "jobs": {
    "initialized": true
  }
}
```

### Check Job Status
```bash
curl http://localhost:4000/jobs/status
```

Expected response:
```json
{
  "success": true,
  "data": {
    "repeatableJobs": [
      {
        "name": "__default__",
        "every": 1200000,
        "next": 1728475200000
      }
    ],
    "counts": {
      "active": 0,
      "waiting": 0,
      "completed": 0,
      "failed": 0
    }
  }
}
```

## Step 6: Test Manual Job Trigger

Trigger a user sync job manually:

```bash
curl -X POST http://localhost:4000/jobs/trigger/user-sync \
  -H "Content-Type: application/json" \
  -d '{"syncType": "incremental"}'
```

Expected response:
```json
{
  "success": true,
  "message": "User sync (incremental) triggered successfully",
  "timestamp": "2025-10-09T12:00:00.000Z"
}
```

## Step 7: Monitor Job Execution

Watch the logs for job execution:

```bash
# If using PM2
pm2 logs codex-api-v2

# If running directly
# Jobs will log to console and logs/combined.log
```

Look for log messages like:
```
[INFO] Initializing user sync scheduler...
[INFO] User sync scheduler initialized successfully
[INFO] Starting user sync job (jobId: 1, syncType: incremental)
[INFO] Users to sync (totalUsers: 150)
[INFO] User sync job completed successfully
```

## Common Operations

### View Job Status
```bash
curl http://localhost:4000/jobs/status | jq
```

### Trigger Full Sync
```bash
curl -X POST http://localhost:4000/jobs/trigger/user-sync \
  -H "Content-Type: application/json" \
  -d '{"syncType": "full"}'
```

### Pause Jobs
```bash
curl -X POST http://localhost:4000/jobs/pause
```

### Resume Jobs
```bash
curl -X POST http://localhost:4000/jobs/resume
```

### Clean Up Old Jobs
```bash
curl -X POST http://localhost:4000/jobs/cleanup \
  -H "Content-Type: application/json" \
  -d '{"gracePeriodHours": 24}'
```

## Monitoring with Redis CLI

### View All Keys
```bash
redis-cli KEYS "bull:user-sync:*"
```

### Get Queue Stats
```bash
redis-cli HGETALL "bull:user-sync:meta-paused"
redis-cli ZCARD "bull:user-sync:wait"
redis-cli ZCARD "bull:user-sync:active"
redis-cli ZCARD "bull:user-sync:completed"
redis-cli ZCARD "bull:user-sync:failed"
```

### Clear Queue (Development Only)
```bash
redis-cli DEL $(redis-cli KEYS "bull:user-sync:*")
```

## Troubleshooting

### Redis Not Running
```bash
# Check if Redis is running
redis-cli ping

# If not, start it
# macOS
brew services start redis

# Linux
sudo systemctl start redis-server

# Docker
docker start redis
```

### Jobs Not Executing
1. Check Redis connection in logs
2. Verify job manager initialized: `curl http://localhost:4000/health`
3. Check job status: `curl http://localhost:4000/jobs/status`
4. Review error logs: `tail -f logs/error.log`

### High Memory Usage
```bash
# Check Redis memory
redis-cli INFO memory

# Clean up old jobs
curl -X POST http://localhost:4000/jobs/cleanup
```

### Job Failures
```bash
# Check failed jobs
redis-cli ZRANGE "bull:user-sync:failed" 0 -1

# Review logs
tail -f logs/error.log

# Retry failed jobs (trigger manual sync)
curl -X POST http://localhost:4000/jobs/trigger/user-sync \
  -H "Content-Type: application/json" \
  -d '{"syncType": "incremental"}'
```

## Next Steps

- Read the [full documentation](./BACKGROUND_JOBS.md)
- Configure job intervals and batch sizes
- Add monitoring/alerting
- Scale with multiple workers
- Add more job types (projects, issues, etc.)

## Quick Reference Card

```bash
# Health Check
curl http://localhost:4000/health

# Job Status
curl http://localhost:4000/jobs/status

# Trigger Sync
curl -X POST http://localhost:4000/jobs/trigger/user-sync \
  -H "Content-Type: application/json" \
  -d '{"syncType": "incremental"}'

# Pause/Resume
curl -X POST http://localhost:4000/jobs/pause
curl -X POST http://localhost:4000/jobs/resume

# Cleanup
curl -X POST http://localhost:4000/jobs/cleanup

# Redis Check
redis-cli ping
redis-cli KEYS "bull:user-sync:*"

# View Logs
pm2 logs codex-api-v2
tail -f logs/combined.log
```

## Support

For issues or questions:
1. Check the [troubleshooting section](./BACKGROUND_JOBS.md#troubleshooting)
2. Review error logs
3. Check Redis connection
4. Verify MongoDB connection

Happy job scheduling! 🚀
