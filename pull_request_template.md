I am starting a new feature/bug fix in:

**Repository:** `thymadona/dse-program-management-system`

**GitHub issue:** `#ISSUE_NUMBER`

Inspect the current GitHub repository and the issue before making recommendations.

## Goal

Help me implement this issue using the smallest maintainable change that fits the existing architecture.

## First: inspect, don't code

Before writing code:

1. Read the GitHub issue.
2. Inspect the current implementation on `main`.
3. Identify what already exists.
4. Identify exactly what is missing.
5. Trace the complete affected flow:
   - Prisma/database
   - `packages/shared-types`
   - backend plugin/service
   - backend router/API
   - frontend API/client
   - frontend components/pages
   - authorization
   - tests

6. Check whether other plugins are affected.
7. Preserve the plugin-registry architecture; do not introduce direct cross-plugin imports.
8. Identify migrations or data-integrity concerns.
9. Identify edge cases and failure states.
10. Identify security/permission implications.

## Give me an implementation plan

Return:

- Summary
- Acceptance criteria
- Files that need changes
- Database changes
- Shared contract changes
- Backend changes
- Frontend changes
- Authorization changes
- Edge cases
- Test plan
- Recommended implementation order

Classify any existing problems you discover as:

- **P0** — must fix before implementing
- **P1** — should fix as part of this work
- **P2** — optional/future cleanup

Do not recommend unrelated refactors.

## Implementation principles

Follow the existing DSE-PMS architecture and conventions.

Prefer:

- simple solutions
- strong TypeScript typing
- Zod validation
- Prisma constraints/transactions where data integrity matters
- existing shared types
- existing UI components
- existing plugin patterns
- explicit error handling
- small reusable functions
- vertical feature completion

Avoid:

- unnecessary abstractions
- framework rewrites
- premature generalization
- unrelated cleanup
- direct imports between plugins
- duplicating existing functionality

After giving me the plan, implement the changes with complete function bodies and include the tests required to prove the feature works.

At the end, tell me exactly what I should run in VS Code to verify the implementation.
