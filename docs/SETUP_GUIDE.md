# Quick Setup Guide

This guide will help you get Codex API v2 up and running in minutes.

## Prerequisites Check

Before starting, ensure you have:

- [ ] Node.js 18+ installed (`node --version`)
- [ ] MongoDB 5+ installed and running (`mongod --version`)
- [ ] npm or yarn package manager

## Step-by-Step Setup

### 1. Clone and Install

```bash
# If you haven't cloned yet
git clone <repository-url>
cd codex_api_v2

# Install dependencies
npm install
```

### 2. Configure Environment

```bash
# Copy the example environment file
cp .env.example .env

# Edit .env with your settings
nano .env  # or use your preferred editor
```

**Minimum required configuration:**
```env
# Only MongoDB URI is required - all other settings have sensible defaults
MONGODB_URI=mongodb://localhost:27017/codex_api_v2
```

### 3. Start MongoDB

If running locally:
```bash
# macOS with Homebrew
brew services start mongodb-community

# Linux with systemd
sudo systemctl start mongod

# Or manually
mongod --dbpath /path/to/data/directory
```

### 4. Start the Development Server

```bash
npm run dev
```

You should see:
```
✅ MongoDB connected successfully
✅ Server is running on port 4000
✅ Environment: development
✅ GraphQL Playground: enabled
🎉 Codex API v2 is ready!
```

### 5. Verify Installation

Open your browser and navigate to:

- **API Root:** http://localhost:4000
- **GraphQL Playground:** http://localhost:4000/graphql
- **Health Check:** http://localhost:4000/health

### 6. Test Your First Query

In GraphQL Playground, try:

```graphql
query {
  health {
    status
    timestamp
    database {
      status
      responseTime
    }
  }
}
```

## Common Issues

### Port Already in Use

If port 4000 is busy:
```bash
# Find and kill the process
lsof -ti:4000 | xargs kill -9

# Or change the port in .env
PORT=4001
```

### MongoDB Connection Failed

1. Ensure MongoDB is running:
   ```bash
   # Check if mongod is running
   ps aux | grep mongod
   ```

2. Verify connection string in `.env`:
   ```env
   MONGODB_URI=mongodb://localhost:27017/codex_api_v2
   ```

3. Check MongoDB logs:
   ```bash
   # macOS Homebrew
   tail -f /usr/local/var/log/mongodb/mongo.log
   
   # Linux
   tail -f /var/log/mongodb/mongod.log
   ```

### Module Not Found Errors

```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

## Next Steps

1. **Explore the API:**
   - Open GraphQL Playground at http://localhost:4000/graphql
   - Browse the schema documentation (Docs tab)
   - Try example queries from README.md

2. **Create Some Data:**
   - Use mutations to create tasks, update projects, etc.
   - Check the `README.md` for mutation examples

3. **Monitor Logs:**
   - Development logs appear in console
   - File logs are in `logs/` directory

4. **Production Deployment:**
   - Follow the deployment guide in README.md
   - Set `NODE_ENV=production`
   - Disable playground and introspection

## Quick Commands Reference

```bash
# Development
npm run dev              # Start dev server with hot-reload
npm run build            # Build TypeScript to JavaScript
npm start                # Run production build
npm run clean            # Clean build artifacts

# Code Quality
npm run lint             # Run ESLint

# Schema Management (with Rover installed)
npm run rover:check      # Validate GraphQL schema
npm run rover:publish    # Publish schema to Apollo Studio
```

## Need Help?

- Check the main [README.md](./README.md) for detailed documentation
- Review the [logs/](./logs/) directory for error messages
- Ensure all prerequisites are met
- Verify MongoDB is accessible

## Success Indicators

Your setup is successful when:

✅ Server starts without errors  
✅ Health check returns `"status": "OK"`  
✅ GraphQL Playground loads  
✅ Database status shows `"connected"`  
✅ No errors in console or logs  

Happy coding! 🚀

