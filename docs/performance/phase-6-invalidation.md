# Phase 6 — Mutation-aware protected-query invalidation

Issue: #742

## Boundary

DSE PMS keeps authenticated HTTP transport `cache: "no-store"`. TanStack Query is the application-owned in-memory read cache. A mutation never changes cached lifecycle state optimistically: the API wrapper emits an invalidation event only after the backend has returned a successful response.

Failed writes, including authorization/conflict failures, emit no invalidation. Invalidation is best-effort after server confirmation and must never turn an already-committed write into a false user-visible failure.

Protected query keys remain scoped as:

`protected / user / <userId> / programme / <programmeId|*> / <resource> / ...`

Invalidation matches the exact `<resource>` segment. Mutable `qa`, for example, does not match a future immutable `qa-release` or `qa-snapshot` key.

## Invalidation matrix

| Mutation domain | Confirmed write route family | Mutable resources invalidated | Dashboard | Immutable boundary |
| --- | --- | --- | --- | --- |
| Students | `/api/students/**` | `students` | yes | no immutable student snapshot key is targeted |
| Courses | direct `/api/courses` course CRUD | `courses`, `offerings` | yes | CourseSpec lifecycle handled separately |
| CourseSpec | `/api/courses/:courseId/spec/**` | `courses` | yes | approved/submitted state remains backend-authoritative |
| Offerings | direct `/api/offerings` CRUD | `offerings`, `courses` | yes | attendance subroutes are not broadly invalidated |
| Enrollments | `/api/offerings/:id/enrollments/**` | `offerings` | yes | server-confirmed enrollment response only |
| Academic Calendar | `/api/programme/:programmeId/academic-calendar/**` | `academic-calendar` | no | immutable published/version keys are not targeted |
| Results | `/api/student-portal/manage/results/**` | `results` | no | finalize/publish/correction remains server-authoritative |
| QA / SAR | `/api/qa/**` except Action Research | `qa` | no | mutable `qa` never prefix-matches immutable release/snapshot resources |
| Action Research | `/api/qa/action-research/**` | `action-research` | no | protocol/baseline/review lifecycle remains backend-authoritative |

Some semantic resources (for example Results, QA/SAR, Action Research and Calendar screens) are not yet broadly migrated to TanStack Query. Keeping their route classification in the registry is intentional: the mutation boundary is auditable now, while invalidation is a no-op until a matching protected query exists. This avoids inventing cache keys or changing current read behavior.

## Integrity-sensitive transitions

Approval, submission, publication, finalization, correction, official release, protocol approval and baseline locks are never represented as successful before the server confirms the write. The central wrapper executes in this order:

1. perform authenticated backend mutation;
2. propagate any non-2xx/authorization/conflict error unchanged;
3. only after successful resolution, emit the semantic invalidation event;
4. invalidate exact matching protected resources;
5. active queries may refetch through normal server authorization.

No mutation response or protected query payload is persisted to localStorage/sessionStorage.

## Cross-user / programme isolation

The invalidation predicate recognizes only canonical protected keys and exact resource segments. Cached values are still keyed by authenticated application user and programme. Logout or identity change removes the entire protected cache before another identity can use it. Invalidation cannot grant access; every refetch remains an authenticated backend read.

## Regression coverage

Focused tests cover:

- Student, Course, CourseSpec, Offering/enrollment, Calendar, Results, QA/SAR and Action Research route classification;
- QA-mounted Action Research taking precedence over the generic QA rule;
- unrelated/attendance mutations not receiving broad invalidation;
- successful writes emitting exactly after confirmation;
- failed writes emitting nothing;
- exact protected resource matching, including `qa` not matching immutable-style `qa-release`/`qa-snapshot` names;
- user/programme key structure remaining part of the canonical protected key.

## Browser smoke

Phase 6 has no visual redesign. A local authenticated smoke should verify one representative Student/Course/Offering write refreshes the visible list after server success and that a rejected write keeps the old data/error state without showing false success. Cross-tab cache propagation is intentionally out of scope: protected cache is memory-only per browser tab and no protected payload is broadcast or persisted.
