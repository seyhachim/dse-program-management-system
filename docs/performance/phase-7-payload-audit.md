# Phase 7 — High-traffic payload and Prisma-select audit

Issue: #743

## Method

This phase audits the current high-frequency list paths before changing contracts. The goal is to remove fields/relations that the current list consumer does not render while preserving authorization and existing response compatibility.

Measurements below are deterministic engineering fixtures or structural query evidence, not production-latency claims. Production-like latency remains tracked by #737/#746.

## Students — changed

Before, `studentService.list()` used `include: { profile: true }`. Every roster row therefore hydrated:

- all Student scalar columns, including account/internal fields not used by the list; and
- the complete StudentProfile relation.

The current Students table renders only `id`, `name`, `email`, `studentId`, `status`, and `createdAt` is retained for the existing API contract/order context. `StudentSchema.profile` is already optional specifically for compact consumers.

After, the list uses an explicit Prisma `select` for those six fields. Detail/create/update APIs still return profile data where it is actually required.

A committed representative serialization fixture measures:

- legacy full/profile row: **583 bytes**;
- compact list row: **181 bytes**;
- representative reduction: **69.0%**.

The fixture uses fixed sample values and proves projection overhead only; real rows vary with string lengths and nullable profile data.

## Offering enrichment — changed indirectly through the Students contract

`offeringService.list()` needs enrolled student identity to assemble `OfferingView.students`. It calls the cross-plugin `StudentsServiceContract.findByIds()` and then emits only `{ id, name, studentId }` for each enrolled student.

Before Phase 7, `findByIds()` nevertheless hydrated the entire Student row plus StudentProfile for every enrolled student. After Phase 7 it uses the exact lean `StudentRef` fields: `id`, `name`, `email`, `studentId`, `status`.

This reduces database transfer/object hydration for Offering lists without changing the Offering API wire contract or roster behavior.

## Lecturers — audited, no change required

The Lecturers plugin already uses an explicit `lecturerSelect` for list/cross-plugin reads and keeps professional portfolio/profile data behind a separate self-profile projection. No broader select was introduced.

## Courses — audited, no speculative contract change

The Course list loads Course scalar rows and enriches lecturer data through the already-lean `LecturersServiceContract`. Unlike Students, there is no large nested profile relation on the list query. CourseSpec progress already uses a dedicated narrow Prisma projection introduced for the Dashboard.

A further Course list DTO split may still remove a few scalar fields, but the expected gain is smaller and changing the established CourseView contract without measured production evidence would add regression risk. This phase therefore does not make that speculative change.

## QA/SAR and Action Research — audited for later pagination work

These domains contain growing evidence/history/timeline collections where the larger risk is unbounded collection size rather than one obvious nested profile relation. They are carried into Phase 8 (#744), where pagination can reduce both row count and payload without truncating official exports/audit history.

## Security and compatibility

- No authorization or programme-scope logic changed.
- No Prisma schema or migration changed.
- Full Student profile remains available through detail/write responses.
- Cross-plugin `StudentRef` is already intentionally lean; Phase 7 makes the Prisma query match that contract rather than returning extra fields structurally.
- No result, CourseSpec, Calendar, QA/SAR or Action Research lifecycle state is modified.
- No API response adds sensitive data; the changed Student list only removes fields.

## Verification

Focused tests assert:

- exact Student list select keys;
- exact cross-plugin StudentRef select keys;
- profile/account/internal fields are excluded;
- deterministic representative serialization is materially smaller.

Full repository typecheck, lint, tests, build, Prisma validation/migrations, database security and authorization integration remain the merge gate.
