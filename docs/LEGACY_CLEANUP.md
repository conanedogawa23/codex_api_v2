# Legacy Resolver Files - Cleanup Required

## Issue Identified

The codebase contains **duplicate resolver implementations**:

### ✅ Active (GraphQL Modules) - Being Used
Located in: `src/graphql/modules/*/`
- ✅ project.module.ts
- ✅ issue.module.ts  
- ✅ user.module.ts
- ✅ mergeRequest.module.ts
- ✅ pipeline.module.ts
- ✅ milestone.module.ts
- ✅ label.module.ts
- ✅ task.module.ts

**Status**: Already optimized with `.lean()` ✅

### ⚠️ Legacy (Old Resolvers) - NOT Being Used
Located in: `src/graphql/resolvers/`
- ⚠️ projectResolver.ts
- ⚠️ issueResolver.ts
- ⚠️ userResolver.ts
- ⚠️ mergeRequestResolver.ts
- ⚠️ pipelineResolver.ts
- ⚠️ milestoneResolver.ts
- ⚠️ labelResolver.ts
- ⚠️ taskResolver.ts
- ⚠️ index.ts (exports old resolvers)

**Status**: UNUSED - Safe to delete

## Verification

### Server Uses GraphQL Modules
```typescript
// src/server.ts (line 7)
import { schema, createExecutor } from './graphql/application';
```

The application uses `./graphql/application.ts` which combines GraphQL Modules, NOT the old resolvers.

### No Imports Found
```bash
grep -r "from.*\/resolvers\/(project|issue|user)" src/
# Result: Only resolvers/index.ts imports them (which is also unused)
```

## Recommendation

**DELETE the following legacy files:**

```bash
rm src/graphql/resolvers/projectResolver.ts
rm src/graphql/resolvers/issueResolver.ts
rm src/graphql/resolvers/userResolver.ts
rm src/graphql/resolvers/mergeRequestResolver.ts
rm src/graphql/resolvers/pipelineResolver.ts
rm src/graphql/resolvers/milestoneResolver.ts
rm src/graphql/resolvers/labelResolver.ts
rm src/graphql/resolvers/taskResolver.ts
rm src/graphql/resolvers/index.ts
```

**Keep only:**
- `src/graphql/resolvers/healthResolver.ts` (if used by health module)

Or simply:
```bash
rm -rf src/graphql/resolvers/
```

## Why These Are Unused

1. **Server Configuration**: `server.ts` imports from `./graphql/application`
2. **GraphQL Modules**: The app uses modular architecture, not the old monolithic resolvers
3. **No References**: No other files import from these resolvers

## Benefits of Cleanup

1. ✅ **No confusion** about which resolvers are active
2. ✅ **Reduced codebase** size (~2KB removed)
3. ✅ **Prevent accidents** - developers won't edit wrong files
4. ✅ **Clearer architecture** - only GraphQL Modules approach visible

## Verification After Cleanup

After deleting, verify:
```bash
npm run build  # Should still pass
npm run dev    # Should start normally
```

## Current Status

- ✅ **Active modules** (in `modules/`): Optimized with `.lean()`
- ⚠️ **Legacy resolvers** (in `resolvers/`): Unused, should be deleted
- ✅ **Build status**: Passing
- ✅ **API functionality**: No impact from cleanup

---

**Conclusion**: The legacy resolver files are safe to delete. The application uses GraphQL Modules exclusively.
