# Assessment Instrument Library — implementation and release contract (#1355 / #1356)

## Implemented in the draft PR
- Additive migration: historical instruments remain rubrics; marking schemes reuse normalized criterion storage with independent question maxima and a distinct content-hash version.
- Global and course-scoped authoring, instrument filters, renamed navigation, explicit question-to-CLO mapping, and private scheme visibility (no public rubric endpoint).
- Individual examination mark entry derives the total atomically from all actual marks. Blank is not zero; incomplete, duplicate, out-of-range and stale-version inputs are rejected. Publication checks complete question evidence. Existing result and finalization locks remain in place.
- Student/lecturer CLO calculation and QA snapshot generation use the shared points-based evidence helper, with individual trace rows and no fallback to whole-exam grades. Existing rubrics retain their legacy aggregation; QA uses a separate calculation version for scheme-bearing offerings.

## Scope and safety decisions
The initial scheme UI stores neutral question labels and maximum marks only. Actual questions, model answers and scoring guidance remain in secure lecturer-only documents; answer keys and automatic grading are deferred. Schemes are currently individual assessments only. All question marks for one student must be entered before saving. No approved course specifications or production results are automatically modified.

## Calculation example
WEF201 example: Q1 6, Q2 6, Q3 8, Q4 5; scores 5/4/7/2 = 18/25. Mapping Q1/Q2 to CLO1, Q3 to CLO2 and Q4 to CLO3 yields 75%, 87.5%, and 40%. The existing student display rounds whole CLO percentages; QA retains two decimal places. Local grading weights do not enter CLO evidence aggregation.

## Remaining release gates
- Full CI on the latest commit, including new database lifecycle integration tests; verify legacy rubric workflows, student visibility, QA traces and authorization in staging.
- Implement audited question-level corrections before opening the scheme workflow to official finalized grading; generic whole-result correction is deliberately blocked for schemes to avoid changing totals without corresponding evidence.
- Spreadsheet/CSV question-mark import preview and private scoring guidance are not implemented. Confirm pilot scope or implement before broad rollout.
- Verify course-spec exports and student display in staging, including owner/co-lecturer boundaries. Check deployment capacity; run a coordinated migration and deployment only after release approval.
