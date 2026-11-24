# Course project groups — #1351
## Pilot
Use synthetic staging data first. No production course, student, group, result, or curriculum record is modified by this PR. The existing assessment membership remains authoritative; proposals and consent are separate, and approval atomically appends an academic group under the existing Offering lock. Manual group editing requires explicitly closing registration. An unapproved/unbound CourseSpec or non-group assessment is ineligible. Only assigned lecturers/co-lecturers manage this workflow.

## Lecturer
Course Delivery → offering → group assessment → Student group registration. Set group count, size and Cambodia-local deadline. Enable registration. Review accepted members, unassigned students and pending invitations. Approve, return for changes, or cancel an unapproved proposal with reason. Close before manually changing membership. Scoring uses existing group assessment UI.

## Student
My Courses → offering → Project Groups → select group assessment. Create a draft, invite available classmates, wait for explicit acceptance, submit for lecturer approval. Refresh to see invitations and official membership. Only the exact offering is available. A group proposal does not change any grade.

## Verification and release gates
- Prisma generation/validation, typecheck, lint, Bun tests, build, DB migration/security, integration and browser smoke in CI.
- Isolated DB service test: `COURSE_PROJECT_GROUP_DB_TESTS=1 bun test apps/backend/src/plugins/student-portal/course-project-group-registration-db.test.ts`.
- Manual synthetic staging UAT: lecturer enables; A invites B; B accepts; cross-section and duplicate denied; lecturer returns/reviews/approves; B sees canonical group; manually editing while enabled denied; existing score lifecycle unaffected. Test 320px mobile and keyboard. Verify no PII beyond display names.
- Confirm actual TSA301 M1/M2 approved CourseSpec binding, group assessment mode and current roster (including official IDs) before production enablement.
- Existing `apps/frontend/vercel.json` disables Git-triggered deployments. Do not change this policy. One isolated preview only after exact-head CI; one planned production release after UAT and review; no repeated or forced deployments. Coordinate backend additive migration and frontend release, verify security and smoke first. Rollback UI/feature by closing registration and retaining the additive data/history; never delete official groups or evidence.
