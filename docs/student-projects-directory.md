# DSE Student Projects Directory — operation and release guide

Parent epic: [#1320](https://github.com/seyhachim/dse-program-management-system/issues/1320)  
Implementation: [#1321](https://github.com/seyhachim/dse-program-management-system/issues/1321)

## Purpose and scope

The directory is a **staff-only search projection over existing Student Portfolio evidence**, not a new student/project academic source. No migration or data copying is needed.

The first version permits Admin, Programme Coordinator and Programme Secretary with a valid programme role grant to browse eligible **published** portfolio items. Lecturers without the explicit programme-wide staff role cannot enumerate the directory; lecturer verification remains in its own existing scoped workflow.

## Student instructions

1. Sign in to **Student Portal → Personal → Portfolio**.
2. Complete the professional profile, add a project in **Projects**, and add safe repository/demo/report/presentation links where available.
3. Choose **Public** visibility for the specific project; private evidence is not listed.
4. Set the **portfolio profile** itself to **Published** with a public slug. Both profile and project must be public for directory discovery.
5. A course-linked project also requires an enrolled Offering, Approved CourseSpec and active source assessment. If the academic source becomes unavailable, the entry disappears from the directory.
6. The student can unpublish the project or profile; the next directory API read excludes it.

**Important:** A public project does not imply lecturer verification. Students cannot give themselves an academic verification badge.

## Staff instructions

Open **Academic → Student Projects**.

- Search by project title, student name, keywords or technology.
- Filter by course code, cohort code, skill, evidence type, current verification state, and **project year**.
- Select **Apply filters**; use Previous/Next to browse the bounded result set.
- Open a published student portfolio to inspect its public evidence. The directory never shows unpublished results, grades, contact details, private verifier notes or internal student identifiers.
- **Project year** comes from the portfolio project's start date or, when absent, its evidence creation date. It is **not** an official Academic Calendar year.

Some filters will be empty for self-authored external projects with no PMS academic source (e.g. course), or students without canonical cohort membership (e.g. cohort). An empty directory means no currently eligible published evidence, **not** no student projects exist.

## Security and academic integrity

- API: \`GET /api/student-portal/portfolio/directory\` (authenticated staff only).
- The server resolves the programme from the caller's \`programmeRoles\`; a flat \`roles\` name or UI visibility cannot grant programme access.
- Each query requires \`StudentPortfolioProfile.isPublic\`, \`StudentPortfolioEvidence.isPublic\`, active Student, and non-archived evidence.
- Academic-linked evidence is checked against actual Enrollment, exact Offering CourseSpec binding, approved CourseSpec, active assessment, and matching programme course.
- The directory is read-only. Do not use it to record marks, change CourseSpec assessments or approve verification.
- Authentication and listing responses use private no-store semantics. The public portfolio already has its own fail-closed response and no-store publication boundary.
- Student identity may be provisional: the directory does not require or expose the official \`Student.studentId\`.

## Validation / release gate

- Unit tests: \`bun test apps/backend/src/plugins/student-portal/portfolio-directory.test.ts\`.
- Integrated DB privacy/provenance test is part of \`portfolio-complete-db.test.ts\` and executes with \`STUDENT_PORTFOLIO_DB_TESTS=1\` against an isolated migrated/seeded test DB in **Student Portal MVP Integrity** CI.
- Full \`bun run typecheck\`, \`bun run lint\`, \`bun run test\`, \`bun run build\` and database/security/authorization checks must be green.
- Before release: perform manual staging tests with (a) published project, (b) unlisted private project, (c) revoked enrollment/academic source, (d) unpublish action, (e) unauthorized lecturer/student, (f) incorrect programme scope, (g) provisional student, (h) responsive phone/desktop and keyboard navigation, (i) pagination/performance with realistic number of records.
- Requires human review, release authorization, and a documented rollback path. Creating this feature branch/PR **does not deploy to production**.

## Follow-up features

Shared group project identity and per-member contributions belong to [#1322](https://github.com/seyhachim/dse-program-management-system/issues/1322). A programme-curated public gallery and explicit showcase consent belong to [#1323](https://github.com/seyhachim/dse-program-management-system/issues/1323). The controlled staging pilot and release closeout are [#1324](https://github.com/seyhachim/dse-program-management-system/issues/1324).
