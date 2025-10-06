# Quick Reference Card

## 🚀 One-Minute Start

```bash
npm install
cp .env.example .env
# Edit .env with your MongoDB URI
npm run dev
# Visit http://localhost:4000/graphql
```

## 📝 Essential Commands

```bash
npm run dev         # Start development server
npm run build       # Build for production
npm start           # Run production server
npm run lint        # Check code quality
```

## 🔗 Key URLs

- **API Root:** http://localhost:4000
- **GraphQL Playground:** http://localhost:4000/graphql
- **Health Check:** http://localhost:4000/health

## 📊 Project Stats

- **Models:** 19 Mongoose schemas
- **Queries:** 30+ GraphQL queries
- **Mutations:** 15+ GraphQL mutations
- **Files:** 45+ TypeScript files
- **Documentation:** 2500+ lines

## 🗂️ Quick File Locations

```
src/models/          # Mongoose schemas
src/graphql/         # GraphQL schema & resolvers
src/middleware/      # Express middleware
src/config/          # Configuration files
src/utils/           # Utilities (logger, etc.)
```

## 🔧 Environment Variables

```env
MONGODB_URI=mongodb://localhost:27017/codex_api_v2  # Required
PORT=4000                                            # Optional
NODE_ENV=development                                 # Optional
GRAPHQL_PLAYGROUND=true                              # Optional
LOG_LEVEL=info                                       # Optional
# ALLOWED_ORIGINS=*                                  # Optional (defaults to allow all in dev)
```

## 📚 Documentation Files

- `README.md` - Complete documentation
- `SETUP_GUIDE.md` - Installation help
- `GRAPHQL_EXAMPLES.md` - Query examples
- `PROJECT_SUMMARY.md` - Architecture overview
- `QUICK_REFERENCE.md` - This file

## 🔍 Common GraphQL Queries

### Health Check
```graphql
query { health { status database { status } } }
```

### List Projects
```graphql
query { projects(limit: 10) { id name status } }
```

### List Users
```graphql
query { users(limit: 10) { id name email department } }
```

### List Issues
```graphql
query { issues(limit: 10) { id title state priority } }
```

### Create Task
```graphql
mutation {
  createTask(input: {
    title: "New task"
    projectId: "project_id"
    priority: high
  }) { id title }
}
```

## 🛠️ Troubleshooting

### Port in use
```bash
lsof -ti:4000 | xargs kill -9
```

### MongoDB not running
```bash
# macOS
brew services start mongodb-community

# Linux
sudo systemctl start mongod
```

### Dependencies issues
```bash
rm -rf node_modules package-lock.json
npm install
```

## 📦 Tech Stack

- Node.js 18+
- TypeScript 5.2+
- Apollo Server 3.12+
- Mongoose 7.6+
- Express 4.18+
- MongoDB 5.0+

## 🎯 Feature Checklist

✅ GraphQL API  
✅ TypeScript  
✅ Mongoose ORM  
✅ Health checks  
✅ Error handling  
✅ Security (Helmet/CORS)  
✅ Logging (Winston)  
✅ Graceful shutdown  
✅ Apollo Rover ready  

## 📞 Need Help?

1. Check `SETUP_GUIDE.md` for common issues
2. Review `logs/` directory for errors
3. Verify MongoDB is running
4. Check `.env` configuration
5. Visit GraphQL Playground for schema docs

## 🌟 Quick Tips

- Use GraphQL Playground for interactive testing
- Check `logs/combined.log` for all logs
- Health endpoint monitors DB connection
- All models have validation and indexes
- Resolvers are modular and easy to extend

---

**For detailed information, see README.md**

