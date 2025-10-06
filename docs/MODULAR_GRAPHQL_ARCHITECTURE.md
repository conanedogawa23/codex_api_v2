# Modular GraphQL Architecture

## 🎯 Overview

Codex API v2 now uses **GraphQL Modules** - a modern, scalable approach to building GraphQL APIs. This architecture splits the monolithic schema into smaller, reusable, testable modules.

## 🏗️ Architecture Benefits

### 1. **Separation of Concerns**
Each domain (User, Project, Issue, etc.) has its own module with:
- Type definitions
- Resolvers
- Business logic
- Tests (when added)

### 2. **Scalability**
- Easy to add new features without touching existing code
- Modules can be developed independently
- Teams can work on different modules simultaneously

### 3. **Reusability**
- Modules can be shared across projects
- Common functionality in shared modules
- DRY (Don't Repeat Yourself) principle

### 4. **Maintainability**
- Smaller, focused codebases
- Easier to understand and modify
- Better code organization

### 5. **Type Safety**
- Full TypeScript integration
- Type-safe resolvers
- Context typing
- Dependency injection ready

## 📂 Project Structure

```
src/graphql/
├── modules/
│   ├── common/           # Shared modules
│   │   ├── scalars.module.ts    # DateTime, JSON scalars
│   │   └── base.module.ts       # Base Query/Mutation types
│   ├── health/
│   │   └── health.module.ts     # Health check functionality
│   ├── user/
│   │   └── user.module.ts       # User operations
│   ├── project/
│   │   └── project.module.ts    # Project operations
│   ├── issue/
│   │   └── issue.module.ts      # Issue operations
│   └── ... (more modules)
├── application.ts        # Combines all modules
└── schema.graphql       # (Kept for reference, not used)
```

## 🔨 How It Works

### 1. Module Definition

Each module is created using `createModule`:

```typescript
import { createModule, gql } from 'graphql-modules';

export const userModule = createModule({
  id: 'user',              // Unique module ID
  typeDefs: gql`           // GraphQL schema
    type User {
      id: ID!
      name: String!
    }
    extend type Query {
      users: [User!]!
    }
  `,
  resolvers: {             // Resolver implementations
    Query: {
      users: async () => { /* ... */ }
    }
  }
});
```

### 2. Application Composition

All modules are combined in `application.ts`:

```typescript
import { createApplication } from 'graphql-modules';

export const application = createApplication({
  modules: [
    scalarsModule,
    baseModule,
    userModule,
    projectModule,
    // ... add more modules
  ],
});
```

### 3. Apollo Server Integration

The application provides a schema and executor for Apollo Server:

```typescript
import { schema, createExecutor } from './graphql/application';

const server = new ApolloServer({
  schema,
  executor: createExecutor(),
});
```

## 📝 Adding a New Module

### Step 1: Create Module Directory

```bash
mkdir -p src/graphql/modules/feature
```

### Step 2: Create Module File

```typescript
// src/graphql/modules/feature/feature.module.ts
import { createModule, gql } from 'graphql-modules';
import { Feature } from '../../../models/Feature';
import { AppError } from '../../../middleware';

export const featureModule = createModule({
  id: 'feature',
  typeDefs: gql`
    type Feature {
      id: ID!
      name: String!
      description: String
      createdAt: DateTime!
    }

    extend type Query {
      features(limit: Int = 20, offset: Int = 0): [Feature!]!
      feature(id: ID!): Feature
    }

    extend type Mutation {
      createFeature(input: CreateFeatureInput!): Feature!
      updateFeature(id: ID!, input: UpdateFeatureInput!): Feature!
      deleteFeature(id: ID!): Boolean!
    }

    input CreateFeatureInput {
      name: String!
      description: String
    }

    input UpdateFeatureInput {
      name: String
      description: String
    }
  `,
  resolvers: {
    Query: {
      features: async (_: any, { limit, offset }: any) => {
        return await Feature.find({ isActive: true })
          .limit(limit)
          .skip(offset)
          .sort({ createdAt: -1 });
      },
      feature: async (_: any, { id }: { id: string }) => {
        const feature = await Feature.findById(id);
        if (!feature) {
          throw new AppError('Feature not found', 404);
        }
        return feature;
      },
    },
    Mutation: {
      createFeature: async (_: any, { input }: any) => {
        const feature = new Feature(input);
        await feature.save();
        return feature;
      },
      updateFeature: async (_: any, { id, input }: any) => {
        const feature = await Feature.findByIdAndUpdate(
          id,
          input,
          { new: true, runValidators: true }
        );
        if (!feature) {
          throw new AppError('Feature not found', 404);
        }
        return feature;
      },
      deleteFeature: async (_: any, { id }: any) => {
        const feature = await Feature.findByIdAndUpdate(
          id,
          { isActive: false },
          { new: true }
        );
        return !!feature;
      },
    },
  },
});
```

### Step 3: Register Module in Application

```typescript
// src/graphql/application.ts
import { featureModule } from './modules/feature/feature.module';

export const application = createApplication({
  modules: [
    // ... existing modules
    featureModule,  // Add your new module
  ],
});
```

### Step 4: Test Your Module

```bash
npm run dev
# Visit http://localhost:4000/graphql
# Try your new queries and mutations
```

## 🔧 Advanced Features

### Dependency Injection

GraphQL Modules supports dependency injection:

```typescript
import { Injectable } from 'graphql-modules';

@Injectable()
export class UserService {
  async getUsers() {
    return await User.find();
  }
}

export const userModule = createModule({
  id: 'user',
  providers: [UserService],
  resolvers: {
    Query: {
      users: (_, __, { injector }) => {
        return injector.get(UserService).getUsers();
      },
    },
  },
});
```

### Middleware

Add field-level middleware:

```typescript
export const userModule = createModule({
  id: 'user',
  middleware: {
    Query: {
      me: [authMiddleware],  // Protect this field
    },
  },
});
```

### Context Typing

Define typed context:

```typescript
export interface GraphQLModulesContext {
  req: Request;
  user?: IUser;
}

export const application = createApplication({
  modules: [...],
});

// Use in resolvers
resolvers: {
  Query: {
    me: async (_: any, __: any, context: GraphQLModulesContext) => {
      return context.user;
    },
  },
}
```

## 📊 Performance Optimizations

### DataLoader Integration

Implement DataLoader for N+1 query prevention:

```typescript
import DataLoader from 'dataloader';

const createUserLoader = () => new DataLoader(async (ids: string[]) => {
  const users = await User.find({ _id: { $in: ids } });
  return ids.map(id => users.find(u => u.id === id));
});

// Add to context
context: ({ req }) => ({
  req,
  loaders: {
    user: createUserLoader(),
  },
}),

// Use in resolvers
project.assignees.map(assigneeId => 
  context.loaders.user.load(assigneeId)
)
```

### Caching

Add caching strategies per module:

```typescript
import NodeCache from 'node-cache';

const cache = new NodeCache({ stdTTL: 600 });

resolvers: {
  Query: {
    projects: async () => {
      const cached = cache.get('projects');
      if (cached) return cached;
      
      const projects = await Project.find();
      cache.set('projects', projects);
      return projects;
    },
  },
}
```

## 🧪 Testing Modules

Test modules in isolation:

```typescript
import { testkit } from 'graphql-modules';
import { userModule } from './user.module';

describe('User Module', () => {
  it('should fetch users', async () => {
    const app = testkit.testModule(userModule);
    const result = await app.execute(`
      query {
        users {
          id
          name
        }
      }
    `);
    
    expect(result.data.users).toBeDefined();
  });
});
```

## 🚀 Migration Guide

### From Monolithic to Modular

1. **Create base modules** (scalars, base types)
2. **Migrate one domain at a time** (start with User)
3. **Test each module** independently
4. **Update application.ts** with new modules
5. **Remove old resolver files** after migration

### Current Status

✅ **Completed:**
- Scalars module (DateTime, JSON)
- Base module (Query, Mutation types)
- Health module
- User module

🔄 **To Be Migrated:**
- Project module
- Issue module
- MergeRequest module
- Task module
- Milestone module
- Pipeline module
- Label module

## 📚 Resources

- [GraphQL Modules Documentation](https://the-guild.dev/graphql/modules)
- [GraphQL Tools Documentation](https://the-guild.dev/graphql/tools)
- [Apollo Server Documentation](https://www.apollographql.com/docs/apollo-server/)

## 🎯 Best Practices

1. **One domain per module** - Don't mix concerns
2. **Use `extend type`** - Extend Query/Mutation from base
3. **Type everything** - Full TypeScript coverage
4. **Handle errors** - Use AppError for consistent errors
5. **Add pagination** - All list queries should paginate
6. **Log operations** - Use logger for debugging
7. **Validate inputs** - Check before database operations
8. **Index your models** - Performance is key
9. **Test your modules** - Write tests as you go
10. **Document your schema** - Add descriptions

## 🔐 Security

- **Authentication**: Add auth middleware to protected resolvers
- **Authorization**: Check permissions in resolvers
- **Input validation**: Validate all inputs before processing
- **Rate limiting**: Implement query complexity limits
- **Error sanitization**: Don't leak sensitive data in errors

---

**Built with GraphQL Modules for maximum scalability and maintainability** 🚀
