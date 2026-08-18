# Database security access model

Issue #133 makes the PMS database security posture reproducible from repository migrations instead of relying on manual Supabase dashboard changes.

## Access model

PMS application data is **backend-only**.

- Browser clients use Supabase Auth for identity, then call the Bun/Express backend for PMS data.
- Browser clients do not query PMS application tables through Supabase Data API/PostgREST.
- The backend uses `DATABASE_URL` for its direct PostgreSQL connection and remains the application authorization boundary.
- Direct table privileges for `PUBLIC`, `anon`, `authenticated`, and `service_role` are not part of the PMS data-access contract.
- RLS is enabled as defense in depth on every application table. The direct backend database role may be the table owner or otherwise have database-level privileges that bypass RLS; application authorization must therefore continue to be enforced in backend routes/services.
- `service_role` is not a substitute for backend authorization and is intentionally denied direct PMS table grants by these migrations.

There are currently no browser-exposed PMS tables, so no end-user RLS policies are required. If a future feature intentionally exposes a table through PostgREST, that change must add explicit least-privilege policies and update the verifier/documentation in the same PR.

## Table classification

All application tables below are classified as **backend-only**.

### Identity, roles, and programme administration

`User`, `Role`, `Programme`, `Permission`, `RolePermission`, `UserRoleAssignment`, `Student`, `ProgramLearningOutcome`, `ProgramCompetency`, `ProgramCompetencyPlo`, `ProgrammeProfile`, `ProgramPolicy`.

### Programme curriculum and academic history

`ProgrammeCurriculum`, `ProgrammeCurriculumVersion`, `ProgrammeCurriculumCourse`, `ProgrammeCurriculumAuditAction`.

These versioned curriculum tables preserve approved/active/superseded academic history and append-only audit provenance. They were introduced after the original #133 security baseline, so a later follow-up migration enables RLS and applies the same backend-only direct-grant revocations without rewriting already-applied curriculum migrations.

### Courses, specifications, offerings, results, and student portal

`Course`, `CourseSpec`, `CourseSpecReviewAction`, `CourseSpecPolicy`, `CourseSpecTeachingLearning`, `CourseSpecWeekProjectProgress`, `CourseSpecSection`, `CourseSpecClo`, `CourseSpecCloTeachingMethod`, `CourseSpecCloAssessmentMethod`, `CourseSpecWeek`, `CourseSpecAssessmentItem`, `CourseSpecMappingCell`, `CourseSpecResource`, `CourseSpecStudentResponsibility`, `Offering`, `OfferingMeeting`, `OfferingCoLecturer`, `Enrollment`, `OfferingAssessmentDeadline`, `AssessmentResult`, `CourseAnnouncement`, `CourseFeedback`.

### Teaching/assessment vocabulary and rubrics

`TeachingMethod`, `AssessmentMethod`, `ActiveLearningCluster`, `ActiveLearningStrategy`, `Rubric`, `RubricLevel`, `RubricCriterion`, `RubricCell`.

### AUN-QA evidence and SAR workflow

`QaFramework`, `QaCriterion`, `QaRequirement`, `QaQualityExpectation`, `QaExpectedEvidence`, `QaAssessmentCycle`, `QaRequirementAssignment`, `QaEvidence`, `QaEvidenceMapping`, `QaRequirementAssessment`, `QaEvidenceAnalysis`, `QaEvidenceAnalysisSource`, `QaEvidenceAnalysisReview`, `QaDocument`, `QaDocumentChunk`, `QaImprovementAction`, `QaSarSection`, `QaSarSubmission`, `QaSarReview`, `QaSarRelease`.

These tables include auditable evidence, immutable submissions/reviews/releases, and other academic records; preventing accidental direct Data API access is especially important because backend workflow and permission checks must not be bypassed.

### QA research evaluation

`QaEvaluationScenario`, `QaEvaluationScenarioEvidence`, `QaEvaluationRun`, `QaEvaluationRunEvidence`, `QaEvaluationHumanRating`.

These controlled research/evaluation tables were added after the original #133 security-baseline migration. A later follow-up migration enables RLS and applies the same backend-only direct-grant revocations without rewriting already-applied QA evaluation or security migrations.

### Community of Practice

`CopCommunity`, `CopMembership`, `CopDiscussion`, `CopComment`, `CopAction`.

These tables were added after the original #133 security-baseline migration. A later follow-up migration enables RLS and applies the same direct-grant revocations without rewriting already-applied migration history.

### Attendance schema

The custom `pms_attendance` schema and its `AttendanceSession` and `AttendanceRecord` tables are **backend-only**. In addition to table RLS/grant protection, schema access is revoked from `PUBLIC` and Supabase Data API roles when those roles exist.

### Telegram security schema

The custom `telegram_security` schema and `TelegramInitVerification` table are **backend-only**. The table stores replay-protection metadata for verified Telegram Mini App launches; raw Telegram `initData` and bot secrets are not persisted there. The schema is not part of the browser/PostgREST data-access contract, so RLS is enabled and schema/table/sequence/function privileges are revoked from `PUBLIC`, `anon`, `authenticated`, and `service_role` where those roles exist.

`_prisma_migrations` is Prisma infrastructure rather than an application table and is intentionally excluded from the application-table inventory.

## Migration-owned controls

The #133 migration series provides these controls:

1. Enable RLS on every classified PMS application table.
2. Revoke direct table privileges from `PUBLIC`.
3. Revoke direct table privileges from `anon`, `authenticated`, and `service_role` when those Supabase roles exist.
4. Revoke future default table, sequence, and function privileges in protected schemas so new exposure is opt-in for objects created by the migration role.
5. Revoke direct access to the custom `pms_attendance` and `telegram_security` schemas and their objects.
6. Apply later follow-up protection when new backend-only table families or custom schemas are introduced after the original baseline, without rewriting applied migration history.
7. Fail migration/security verification when expected protected objects are missing or new application tables have not been classified.

Supabase-only role references are guarded through `pg_roles`, so the migrations also run in ordinary PostgreSQL CI where those roles do not exist.

## Automated verification

Run:

```bash
bun run --cwd apps/backend db:security:verify
```

CI runs the verifier after a fresh migration and seed. It fails when:

- a classified table is missing;
- an unexpected/unclassified table appears in an inventoried application schema;
- RLS is disabled on a classified table;
- `PUBLIC`, `anon`, `authenticated`, or `service_role` has a forbidden direct table grant;
- `pms_attendance` or `telegram_security` schema access is exposed to a forbidden grantee; or
- unsafe future default privileges are present in a protected schema.

CI also proves fail-closed behavior by temporarily creating an unclassified public table and a forbidden `authenticated` table grant; both probes must make the verifier fail before cleanup, followed by a final clean pass.

When adding a new application table or custom application schema, the same PR must establish its intended access path, add migration-owned controls, and update the verifier inventory. A green verifier is therefore a required database-security gate, not a one-time audit.

## Upgrade and rollback implications

These migrations are additive security hardening and do not rewrite application rows.

For an existing database, apply them with the normal deployment migration command:

```bash
bun run db:migrate:deploy
```

`ENABLE ROW LEVEL SECURITY` and `REVOKE` are safe to re-apply when protection already exists. The migrations deliberately fail if an expected table/schema is missing because silently skipping a protected object would leave security drift undetected.

A rollback should **not** restore broad `PUBLIC` or Supabase Data API grants merely to reverse the migration. If an operational rollback is required, restore application code/schema to a compatible revision while retaining the restrictive database posture unless a separately reviewed access-model change explicitly requires otherwise.

## Production verification

CI proves the migration sequence on plain PostgreSQL. After deployment to Supabase, run the same verifier using the production migration/backend database role (or an equivalent privileged read-only inspection path) to confirm that Supabase-specific roles also have no forbidden grants. Do not rely on dashboard state as the source of truth; migrations and the verifier are authoritative.
