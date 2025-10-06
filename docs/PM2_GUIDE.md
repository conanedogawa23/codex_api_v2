# PM2 Process Manager Integration Guide

## 🎯 Overview

PM2 is a production-grade process manager for Node.js applications. This guide covers how to use PM2 with Codex API v2 for:
- **Zero-downtime deployments**
- **Cluster mode** for multi-core CPU utilization
- **Auto-restart** on crashes or high memory usage
- **Log management**
- **Process monitoring**
- **Startup scripts** for automatic recovery on server restart

## 📋 Table of Contents

- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Commands](#commands)
- [Deployment Strategies](#deployment-strategies)
- [Monitoring & Logs](#monitoring--logs)
- [Production Setup](#production-setup)
- [Troubleshooting](#troubleshooting)

## 🚀 Quick Start

### Installation

PM2 is already included in the project dependencies. Just run:

```bash
npm install
```

### Development Mode

Start the API in development mode with hot-reload:

```bash
npm run pm2:start:dev
```

This starts a single instance with TypeScript support and file watching enabled.

### Production Mode

1. **Build the project:**
   ```bash
   npm run build
   ```

2. **Start with PM2:**
   ```bash
   npm run pm2:start
   ```

This starts the API in cluster mode, utilizing all available CPU cores.

## ⚙️ Configuration

The PM2 configuration is defined in `ecosystem.config.js` at the project root.

### Two Application Modes

#### 1. Production Mode (`codex-api-v2`)
- **Script:** `./dist/server.js` (compiled JavaScript)
- **Instances:** `max` (uses all CPU cores)
- **Mode:** `cluster` (load balancing enabled)
- **Watch:** Disabled
- **Memory Limit:** 1GB (auto-restart if exceeded)

#### 2. Development Mode (`codex-api-v2-dev`)
- **Script:** `./src/server.ts` (TypeScript with ts-node)
- **Instances:** 1
- **Mode:** `fork`
- **Watch:** Enabled for `src/` directory
- **Auto-restart:** Yes

### Environment Variables

Three environments are pre-configured:

#### Development
```javascript
env_development: {
  NODE_ENV: 'development',
  PORT: 4000,
  GRAPHQL_PLAYGROUND: true,
  GRAPHQL_INTROSPECTION: true,
  LOG_LEVEL: 'debug',
}
```

#### Staging
```javascript
env_staging: {
  NODE_ENV: 'staging',
  PORT: 4000,
  GRAPHQL_PLAYGROUND: true,
  GRAPHQL_INTROSPECTION: true,
  LOG_LEVEL: 'info',
}
```

#### Production
```javascript
env_production: {
  NODE_ENV: 'production',
  PORT: 4000,
  GRAPHQL_PLAYGROUND: false,
  GRAPHQL_INTROSPECTION: false,
  LOG_LEVEL: 'warn',
}
```

## 🎮 Commands

### Core Commands

```bash
# Start in production mode (cluster)
npm run pm2:start

# Start in development mode (single instance, watch mode)
npm run pm2:start:dev

# Start in staging mode
npm run pm2:start:staging

# Stop all instances
npm run pm2:stop

# Restart all instances
npm run pm2:restart

# Reload with zero-downtime (cluster mode only)
npm run pm2:reload

# Delete all processes from PM2
npm run pm2:delete
```

### Monitoring Commands

```bash
# View logs in real-time
npm run pm2:logs

# Monitor CPU/Memory usage
npm run pm2:monit

# Check process status
npm run pm2:status

# Clear all logs
npm run pm2:flush

# Save current process list
npm run pm2:save
```

### Direct PM2 Commands

If you need more control, use PM2 CLI directly:

```bash
# Start specific app
pm2 start ecosystem.config.js --only codex-api-v2

# Start with specific environment
pm2 start ecosystem.config.js --env production

# Scale to specific number of instances
pm2 scale codex-api-v2 4

# Reload specific app
pm2 reload codex-api-v2

# Stop specific app
pm2 stop codex-api-v2

# Delete specific app
pm2 delete codex-api-v2

# View detailed process info
pm2 describe codex-api-v2

# Monitor specific app
pm2 logs codex-api-v2 --lines 100
```

## 📊 Cluster Mode

### Benefits

- **Load Balancing:** Distributes incoming requests across all instances
- **High Availability:** If one instance crashes, others continue serving
- **CPU Utilization:** Uses all available CPU cores
- **Zero Downtime:** Reload instances one at a time

### How It Works

1. PM2 starts multiple Node.js processes (one per CPU core by default)
2. Uses Node.js cluster module for load balancing
3. Master process manages worker processes
4. Requests are distributed using round-robin algorithm

### Scaling

```bash
# Scale to maximum CPU cores
pm2 scale codex-api-v2 max

# Scale to specific number
pm2 scale codex-api-v2 4

# Scale to CPU cores - 1
pm2 scale codex-api-v2 -1
```

### Zero-Downtime Reload

```bash
npm run pm2:reload
```

This command:
1. Reloads one instance at a time
2. Waits for new instance to be ready before killing the old one
3. Ensures no downtime during deployment

## 🚀 Deployment Strategies

### Strategy 1: Simple Deployment

```bash
# 1. Build the application
npm run build

# 2. Reload with zero downtime
npm run pm2:reload
```

### Strategy 2: Blue-Green Deployment

```bash
# Deploy to production
npm run deploy:prod
```

This command:
1. Builds the TypeScript code
2. Reloads PM2 with the new build
3. Uses production environment variables

### Strategy 3: Manual Deployment

```bash
# 1. Pull latest code
git pull origin main

# 2. Install dependencies
npm install

# 3. Build
npm run build

# 4. Reload
pm2 reload ecosystem.config.js --env production
```

## 📝 Monitoring & Logs

### Real-time Logs

```bash
# All logs
npm run pm2:logs

# Specific app logs
pm2 logs codex-api-v2

# Last 200 lines
pm2 logs --lines 200

# JSON format
pm2 logs --json

# Only errors
pm2 logs --err
```

### Log Files

PM2 logs are stored in:
- **Error logs:** `./logs/pm2/err.log`
- **Output logs:** `./logs/pm2/out.log`
- **Dev error logs:** `./logs/pm2/dev-err.log`
- **Dev output logs:** `./logs/pm2/dev-out.log`

### Monitoring Dashboard

```bash
# Terminal-based monitoring
npm run pm2:monit
```

Shows:
- CPU usage per process
- Memory usage per process
- Uptime
- Restart count
- Status

### Web Monitoring (PM2 Plus)

For advanced monitoring, use PM2 Plus (formerly Keymetrics):

```bash
# Link to PM2 Plus
pm2 link <secret> <public>

# Or create a new bucket
pm2 plus
```

Features:
- Real-time metrics
- Exception tracking
- Custom metrics
- Alerting
- Issue tracking

## 🏭 Production Setup

### 1. Build the Application

```bash
npm run build
```

### 2. Configure Environment

Ensure your `.env` file has production settings:

```env
NODE_ENV=production
PORT=4000
MONGODB_URI=mongodb://your-production-server:27017/codex_api_v2
GRAPHQL_PLAYGROUND=false
GRAPHQL_INTROSPECTION=false
LOG_LEVEL=warn
ALLOWED_ORIGINS=https://your-frontend.com
```

### 3. Start with PM2

```bash
npm run pm2:start
```

### 4. Save Process List

```bash
npm run pm2:save
```

### 5. Setup Startup Script

To auto-start PM2 on server reboot:

```bash
# Generate startup script
npm run pm2:startup

# This will output a command like:
# sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u user --hp /home/user

# Run the generated command
```

### 6. Test Auto-Restart

```bash
# Reboot server
sudo reboot

# After reboot, check PM2 status
pm2 status
```

## 🔧 Advanced Configuration

### Custom Memory Limits

Edit `ecosystem.config.js`:

```javascript
{
  max_memory_restart: '2G', // Restart if exceeds 2GB
}
```

### Custom Instance Count

```javascript
{
  instances: 4, // Fixed number of instances
  // OR
  instances: -1, // CPU cores - 1
}
```

### Cron Restart

Restart at specific times:

```javascript
{
  cron_restart: '0 0 * * *', // Restart daily at midnight
}
```

### Watch Specific Files

```javascript
{
  watch: ['src', 'config'],
  ignore_watch: ['node_modules', 'logs'],
}
```

### Node.js Arguments

```javascript
{
  node_args: '--max-old-space-size=4096', // 4GB heap size
}
```

## 🐛 Troubleshooting

### Application Won't Start

```bash
# Check logs
pm2 logs

# Describe process
pm2 describe codex-api-v2

# Check for errors in Winston logs
tail -f logs/error.log
```

### High Memory Usage

```bash
# Monitor memory
pm2 monit

# Check memory limit
pm2 describe codex-api-v2 | grep memory

# Adjust limit in ecosystem.config.js
```

### Processes Keep Restarting

```bash
# Check restart count
pm2 status

# View logs for errors
pm2 logs --err

# Increase min_uptime in ecosystem.config.js
```

### Port Already in Use

```bash
# Find process using port 4000
lsof -ti:4000

# Kill the process
kill -9 $(lsof -ti:4000)

# Or change PORT in ecosystem.config.js
```

### TypeScript Errors in Dev Mode

```bash
# Ensure ts-node is installed
npm install

# Check TypeScript configuration
npx tsc --noEmit

# Restart with fresh logs
pm2 delete all
npm run pm2:start:dev
```

## 📚 Best Practices

### 1. Always Use Cluster Mode in Production

```javascript
{
  exec_mode: 'cluster',
  instances: 'max',
}
```

### 2. Set Memory Limits

```javascript
{
  max_memory_restart: '1G',
}
```

### 3. Configure Graceful Shutdown

Ensure your application handles SIGINT:

```javascript
process.on('SIGINT', async () => {
  // Close database connections
  await mongoose.disconnect();
  // Close server
  await server.close();
  process.exit(0);
});
```

### 4. Save Process List

After configuration changes:

```bash
pm2 save
```

### 5. Setup Log Rotation

```bash
pm2 install pm2-logrotate

# Configure rotation
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 30
```

### 6. Use Environment-Specific Configs

```bash
# Development
pm2 start ecosystem.config.js --env development

# Staging
pm2 start ecosystem.config.js --env staging

# Production
pm2 start ecosystem.config.js --env production
```

### 7. Monitor in Production

Always monitor:
- CPU usage
- Memory usage
- Restart count
- Response times
- Error rates

## 🔗 Resources

- [PM2 Official Documentation](https://pm2.keymetrics.io/)
- [PM2 Cluster Mode](https://pm2.keymetrics.io/docs/usage/cluster-mode/)
- [PM2 Deployment](https://pm2.keymetrics.io/docs/usage/deployment/)
- [PM2 Plus Monitoring](https://pm2.io/)

## 📞 Support

For PM2-specific issues:
1. Check PM2 logs: `pm2 logs`
2. Review ecosystem.config.js
3. Check application logs in `logs/` directory
4. Verify environment variables
5. Test in development mode first

---

**🎉 Your Codex API v2 is now production-ready with PM2!**
