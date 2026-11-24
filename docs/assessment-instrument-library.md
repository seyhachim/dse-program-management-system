# Assessment Instrument Library — implementation contract (#1355)

Status: foundation only; not yet wired to production authoring, persistence or grading.
The existing rubric routes, API contracts, permissions and historical calculations remain unchanged.

## Domain and data
- Use the existing Rubric Library and CourseSpec assessment links as the starting point. Keep a stable instrument ID and immutable version/content hash; add a discriminant, with historical rows classified as rubric.
- Marking schemes use question IDs, independent maximum marks, private scoring guidance and explicit CourseSpec question-to-CLO mappings. Do not fake a scheme with a uniform rating scale. Answer keys and automatic grading are deferred.
- Reuse the result lifecycle and existing criterion-level evidence architecture; persist actual per-student question scores with exact approved instrument context. Preserve null vs zero and prevent duplicates or out-of-range values.

## Security
Existing active rubrics are public by design. Marking guidance and unpublished questions must never pass through that endpoint, student DTOs, public CourseSpec documents or QA exports. Only authorized assessment staff may access private scheme content. Student results can expose earned/max scores after publication without disclosing expected answers. Audit all role boundaries, including linked offerings.

## CLO evidence
The existing calculateCloEvidence function averages normalized evidence items. Do not silently change historical rubric or assessment-level calculations. For marking schemes, explicitly adopt a points-based aggregate within each CLO for the assessment (sum earned / sum maximum), preserve individual question traces, and feed the aggregate into the existing engine with a documented versioned rule. Incomplete mapped scores must not be inferred from the exam total or silently fall back to whole-assessment evidence; define completeness and publication policy in the integration tests.

WEF201 example: Q1 6, Q2 6, Q3 8, Q4 5, scores 5/4/7/2 -> 18/25. With Q1 and Q2 mapped to CLO1, Q3 to CLO2 and Q4 to CLO3, midterm evidence is 75%, 87.5%, 40%. Whole-course attainment is calculated separately from all applicable evidence. Local grading weight is not evidence aggregation weight.

## Remaining integration and release gates
1. Add persistence, migration/backfill, ownership/visibility checks and content hashing with legacy compatibility.
2. Add instrument authoring and list filters, and rename the UI only when both supported categories are functional.
3. Bind to approved CourseSpec and expose explicit question-to-CLO mapping and readiness checks.
4. Add question mark entry/import preview, validated totals and existing result publication/correction flow.
5. Integrate the existing CLO service, traceability, student views, exports and QA adapters; test no double counting, partial evidence and historical results.
6. CI, database-security verification, staging migration and lecturer/student smoke test. Check Vercel deployment capacity before one coordinated deployment. Do not edit approved WEF201/TSA301 records automatically.

The shared contract in this initial change validates question definitions and actual point scores, and produces normalized candidate evidence rows. It intentionally does not claim persisted data, end-to-end functionality or production readiness.
