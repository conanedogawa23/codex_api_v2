# Development Standards

These guidelines codify how we build and maintain Codex API v2. They reflect current best practices for Node.js, TypeScript, Apollo GraphQL, and MongoDB/Mongoose projects.

## 1. Core Principles
- **Type safety first** – prefer explicit types, enable strict compiler options, and fail builds that introduce `any` without justification.
- **Schema-driven development** – update GraphQL SDL, resolvers, and models together; keep API types as the single source of truth.
- **Security in depth** – validate all external input, sanitize outputs, and rely on production-ready defaults for headers, CORS, and secrets.
- **Observability** – keep logging structured, actionable, and free of sensitive data; expose health checks for runtime insight.

## 2. TypeScript & Node.js
- Target Node.js 18+ features (native fetch, AbortController, etc.) and avoid deprecated Node APIs.
- Use ES modules syntax across the codebase; keep import order Node built-ins → packages → internal modules; prefer named exports.
- Leverage `async/await` for async flows; wrap external calls in narrow `try/catch` blocks and rethrow typed errors.
- Keep configuration in `src/config` and derive environment variables through `environment.ts`; never hardcode secrets or URIs.
- Add concise JSDoc only when a function’s behavior is non-obvious; rely on TypeScript definitions otherwise.

## 3. GraphQL (Apollo Server)
- Modify `src/graphql/schema.graphql` first, then align corresponding resolvers and DTOs; run `npm run lint` + `rover:check` before opening a PR.
- Validate input via schema constraints (non-null, enums) and complementary runtime guards (e.g. `class-validator` or manual checks) for complex rules.
- Use custom scalars thoughtfully; prefer native types where possible and centralize scalar implementations.
- Keep resolver side effects isolated—no direct logging or response manipulation; delegate to services/utilities when logic grows.
- Implement pagination, filtering, and sorting consistently (cursor-based pagination preferred for large collections).

## 4. MongoDB & Mongoose
- Define schemas in `src/models` with explicit field types, validation rules, and indexes (use multi-field indexes for frequent compound queries).
- Enable `timestamps` where entities are user-facing; use `versionKey: false` unless optimistic concurrency is required.
- Avoid business logic in schema statics/methods unless it offers clear reuse; prefer dedicated service utilities.
- Return lean documents (`.lean()`) when read-only; use projections to limit payload size.
- Wrap database operations in repository-style helpers for reuse and easier testing.

## 5. Error Handling & Logging
- Throw typed errors (`ApolloError`, `GraphQLError`, custom `DomainError`) and let `errorHandler` translate them; no raw `console.log`.
- Tag logs with correlation identifiers when available (request ID, user ID) and apply consistent `logger` metadata shapes.
- Gracefully handle shutdown signals (SIGINT/SIGTERM); close DB connections and stop Apollo server via existing utility functions.

## 6. Testing & Quality Gates
- Run `npm run lint` and any relevant tests before commit; add targeted tests for new resolvers, utils, and schema behavior.
- Prefer lightweight integration tests using an in-memory MongoDB server or isolated collections.
- Document manual verification steps when automated testing is impractical.
- Keep CI pipelines green; treat warnings as failures for lint/type-check steps.

## 7. Tooling & Workflow
- Use feature branches and conventional commit messages (`feat:`, `fix:`, etc.).
- Keep pull requests scoped and descriptive; include schema changes, migration notes, and test evidence in PR descriptions.
- Update `docs/QUICK_REFERENCE.md` when new developer commands or scripts are added.
- Avoid direct pushes to main; rely on PR reviews for shared branches.

## 8. Security & Compliance
- Respect principle of least privilege for database credentials; rotate secrets when sharing outside the team.
- Enforce input sanitization on any field that can reach Markdown/HTML renderers to prevent injection attacks.
- Always disable GraphQL introspection and Playground in production; document how to re-enable for staging/local use.
- Monitor dependencies with `npm audit` and update vulnerable packages promptly.

## 9. Documentation & Knowledge Sharing
- Keep all documentation inside `docs/`; update relevant files whenever API behavior, setup steps, or tooling changes.
- Add architectural decisions to a future `docs/adr/` directory when changes impact high-level design.
- Record troubleshooting steps and known issues in `docs/PROJECT_SUMMARY.md` or a dedicated `docs/ops.md` when persistent.

Adhering to these standards keeps the codebase consistent, secure, and maintainable while scaling the API and team.
