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
