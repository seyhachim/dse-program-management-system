# Student Portal MVP (#169)

## Scope

The Student Portal is a read-mostly, mobile-first surface backed by the existing DSE PMS academic records. It reuses Student, Enrollment, Offering, approved CourseSpec, assessment deadline, published result, announcement, and anonymous feedback data.

Student routes:

- `/portal` — dashboard
- `/portal/courses` — enrolled courses
- `/portal/schedule` — weekly timetable
- `/portal/assessments` — deadlines, weights, instructions, and rubric criteria
- `/portal/results` — published results and CLO achievement
- `/portal/announcements` — currently published course announcements
- `/portal/courses/:offeringId` — approved course learning information, resources, feedback, and approved document download

## Authorization and privacy

- Every `/api/student-portal/*` student read requires authentication plus `student-portal:read`.
- Service reads resolve an **Active** Student from the authenticated user id.
- Course/document access requires an exact Enrollment row for that student and Offering.
- CourseSpec learning information is returned only when the Offering is bound to a CourseSpec whose review status is `Approved`.
- Result reads expose only published records and continue to respect the existing provisional-result/survey gate.
- Announcement reads exclude future-published and expired records.
- Anonymous course feedback keeps the existing HMAC response-key design and minimum-response disclosure rule.
- Approved course documents are generated from the same enrollment-scoped approved CourseSpec payload; there is no unauthenticated document URL.

## Assessment deadline semantics

Exact deadline timestamps are stored/transmitted as ISO instants and displayed using `Asia/Phnom_Penh` (Cambodia time). The assessment overview distinguishes overdue, upcoming, week-only, and not-yet-scheduled deadlines.

## Database / migration

No Prisma schema or migration changes are required for #169. The MVP uses existing canonical academic tables and does not rewrite approved/submitted records.

## Verification

Required merge gates:

- Prisma generate/validate
- typecheck
- lint
- full Bun test suite + backend discovery
- production build
- fresh migrations + seed
- Student Portal DB authorization/publication regression
- database security verifier + fail-closed probes
- backend integration authorization suite

Manual smoke checks should cover student navigation at mobile/desktop widths, assessment deadline states, rubric readability, approved document download, unpublished result protection, announcement visibility, feedback duplicate behavior, and an IDOR attempt against another Offering id.
