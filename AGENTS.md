<<<<<<< HEAD
# AGENTS.md

## Project Overview

This repository contains the DSE Program Management System.

Before changing code:

- Inspect the relevant implementation and tests.
- Explain the proposed plan before making large changes.
- Keep each change limited to the current GitHub Issue.
- Do not modify unrelated files.

## Development Commands

Run the following checks after making changes:

- `bun run typecheck`
- `bun run lint`
- `bun test`
- `bun run build`

## Coding Rules

- Follow the existing architecture and naming conventions.
- Reuse existing components and utilities where practical.
- Do not introduce new dependencies without explaining why.
- Preserve authentication, authorization, and validation.
- Never expose secrets or commit environment files.
- Add or update tests when behavior changes.

## Database Changes

- Do not delete or rename database fields without approval.
- Make migrations backward-compatible where practical.
- Review authorization and ownership checks for every mutation.

## Git Workflow

- One GitHub Issue per branch.
- Use branch names such as:
  - `fix/issue-12-description`
  - `feature/issue-18-description`
- Do not commit directly to `main`.
- Use focused conventional commit messages.

## Definition of Done

A task is complete when:

- Acceptance criteria are satisfied.
- Relevant tests have been added or updated.
- Type checking, linting, tests, and build pass.
- No unrelated files were changed.
- Remaining risks or limitations are reported.

## Code Review Rules

During review, prioritize:

- Authentication and authorization gaps
- Missing input validation
- Unsafe database operations
- Business-logic regressions
- Missing tests
- Incorrect error handling
=======
# DSE-PMS Agent Guide

Use this file as the repository-level execution checklist for automated coding agents and contributors.

## Environment

- Bun: `1.2.23`
- Frontend: Next.js 16 + React 19 + TypeScript
- Backend: Bun + Express + Prisma
- Database: PostgreSQL / Supabase PostgreSQL
- Do not use Docker for the local development workflow.

## Fresh checkout

From the repository root:

```bash
bun install --frozen-lockfile
```

The root `postinstall` runs Prisma Client generation automatically. A successful install must therefore leave the generated Prisma Client ready for typecheck/build without an undocumented manual step.

Configure `DATABASE_URL` before database commands. Use a local PostgreSQL instance or Supabase; do not require Docker.

## Canonical verification

Run these from the repository root before considering a change complete:

```bash
bunx prisma validate --schema apps/backend/prisma/schema.prisma
bun run typecheck
bun run lint
bun run test
bun run test:backend
bun run build
```

`bun run test` is the complete repository test entrypoint. `bun run test:backend` is the explicit backend-discovery check and must find and execute backend tests rather than silently succeeding with zero tests.

For database/security changes, also run against an appropriate PostgreSQL database:

```bash
bun run db:migrate:deploy
bun run seed
bun run --cwd apps/backend db:security:verify
```

CI performs a fresh PostgreSQL migration/seed plus curriculum-integrity and fail-closed database-security probes.

## Engineering rules

- Inspect the GitHub issue and current implementation before coding.
- Trace affected Prisma/database, shared contracts, backend services/routes, frontend clients/components, authorization, and tests.
- Reuse existing plugins/services/components instead of creating parallel architecture.
- Preserve submitted/approved academic records and auditable AUN-QA/result/curriculum history.
- Keep changes small and scoped; do not mix unrelated refactors into a feature or fix.
- Never weaken backend authorization because a UI action is hidden.
- Add migrations safely; do not rewrite already-applied migration history.
- Keep secrets out of source and browser-exposed `NEXT_PUBLIC_*` variables.

## Pull requests

Before creating or updating a PR, read the root `pull_request_template.md` and preserve its required inspection, implementation, database, contract, authorization, edge-case, test, and reviewer evidence.

Before merge, compare the finished PR with both the issue acceptance criteria and the root PR template. Any failing typecheck, lint, test, build, migration, security, permission, or API-contract gate is merge-blocking unless it is explicitly outside the issue and documented as a pre-existing repository limitation.
>>>>>>> 635fd92079d4dd0b47a572746a03d6a3a1d458ab
