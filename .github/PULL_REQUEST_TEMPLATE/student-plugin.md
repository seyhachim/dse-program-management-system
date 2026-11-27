# Student plugin contribution

> For proposed **build-time source plugins only**. Read [ADR #1301](https://github.com/seyhachim/dse-program-management-system/issues/1301). No dynamic plugin upload, hot-loading or student production access.

## Project and people

- GitHub issue: #
- Parent epic: #1300
- Proposed plugin ID (lowercase kebab-case):
- Version (semver) / compatible PMS commit:
- Student contributor(s):
- Lecturer mentor:
- PMS maintainer / long-term owner:
- Purpose and expected users:

## Functional scope and interfaces

- [ ] One narrow feature scope; no unrelated refactor or duplicate PMS source of truth
- [ ] API namespace `/api/<plugin-id>` and list of endpoints included
- [ ] Typed manifest, router, public service and Zod contracts documented
- [ ] Frontend routes, navigation and loading/error/empty states documented
- [ ] Cross-plugin calls use approved registry service contracts (not implementation imports)
- [ ] No runtime plugin loader, remote scripts, or arbitrary package installation

## Security and data-access review

- [ ] Data accessed listed explicitly (collections, identities, programme context)
- [ ] Synthetic-only development data; no production or live-staging secrets/records/screenshots
- [ ] Backend `requireAuth` and per-action permission checks; UI roles are not security
- [ ] Exact programme scope and record/student ownership checked server-side
- [ ] Returned DTO fields minimized; no raw ORM responses or secrets in logs
- [ ] External requests, URLs, uploads, HTML, dependencies and side effects disclosed
- [ ] No account/role/auth, official attendance, grades/results, CourseSpec/curriculum or QA mutations without a distinct approved change
- [ ] Test cases: anonymous 401; wrong role 403; wrong programme 403; wrong student/record denial; invalid input; positive case

## Database and dependencies

- [ ] No migration, or: additive Prisma migration and rollback documented
- [ ] If DB changes: fresh migration + upgrade-path test, RLS/grants and DB-security verifier updated
- [ ] New dependencies/licences/third-party assets declared and reviewed
- [ ] No keys, tokens, real email addresses or privileged CI environment variables introduced

## Validation evidence

- [ ] `bunx prisma validate --schema apps/backend/prisma/schema.prisma`
- [ ] `bun run typecheck`
- [ ] `bun run lint`
- [ ] `bun run test`
- [ ] `bun run test:backend`
- [ ] `bun run build`
- [ ] Scoped integration tests and screenshots/video from **fictional** records provided
- [ ] README/docs updated and mentor verifies a clean contributor walkthrough

## Review, ownership and release

- Risks, limitations, maintenance plan and rollback:
- Tests run and results (include failing gates):
- [ ] Lecturer mentor feedback completed
- [ ] Independent PMS maintainer approval **required before merge**
- [ ] Branch protection checks pass; no self-approval or direct main push
- [ ] Merging or deploying requires separate maintainer action and approval
- [ ] Source and contribution licensing/IP policy confirmed before external recruitment

_This template is a review checklist, not an automatic permission grant or runtime security sandbox._
