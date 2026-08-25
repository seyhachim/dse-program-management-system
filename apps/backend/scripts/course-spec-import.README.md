# Course Specification JSON Importer

Imports the canonical `dse-course-spec-import-v1` JSON files generated from the legacy DSE DOCX course specifications into the normalized Prisma/PostgreSQL course-spec tables.

## Safety defaults

- Dry-run is the default. No database writes occur without `--commit`.
- Canonical files carrying extraction warnings are blocked unless `--allow-warnings` is explicitly passed after review.
- Existing `CourseSpec` data is never overwritten unless `--replace-existing` is explicitly passed.
- Existing `Course` catalog metadata is never rewritten by a CourseSpec import. Legacy title/credits/description/prerequisites/course type/SLT/lecturer values remain evidence in the immutable Course Information snapshot; only a missing `Course` may be created from reviewed canonical JSON.
- `--replace-existing` replaces only the latest CourseSpec and still preserves the existing `Course` catalog row.
- Extraction errors always block a course.
- No term-specific `Offering` is invented. Semester/programme-year/co-lecturer values remain in the canonical source JSON and are reported as warnings because an Offering requires a real term.
- Unsupported/unfinished wizard sections are not fabricated. In particular, no CLO alignment strength is invented for the mapping section, and no Project-Based Learning progress is invented for weekly plans.

## Input

Unzip the canonical dataset produced from the legacy DOCX files. The importer recursively reads course JSON files and ignores `schema.json` and `import-report.json`.

Example layout:

```text
course-spec-import/
  courses/
    TSA301.json
    PAN202.json
    ...
  schema.json
  import-report.json
```

## Commands

Run from `apps/backend`.

Dry-run every valid/no-warning course:

```bash
bun run course-spec:import ../../course-spec-import
```

Dry-run one course:

```bash
bun run course-spec:import ../../course-spec-import --course=TSA301
```

Write an audit report:

```bash
bun run course-spec:import ../../course-spec-import --report=course-spec-import-report.json
```

After reviewing extraction warnings, include those files in the dry run:

```bash
bun run course-spec:import ../../course-spec-import --allow-warnings
```

Commit new specifications:

```bash
bun run course-spec:import ../../course-spec-import --commit
```

Replace existing specifications only after reviewing the dry-run output:

```bash
bun run course-spec:import ../../course-spec-import --commit --replace-existing
```

For legacy files that also have reviewed extraction warnings:

```bash
bun run course-spec:import ../../course-spec-import --commit --replace-existing --allow-warnings
```

## Mapping

The importer maps canonical data to the current normalized models on the Teaching & Learning redesign branch:

- `Course`: when the code does not yet exist, create the missing catalog row from reviewed canonical code/title/description/prerequisites/credits/course type/total SLT/primary lecturer. When the code already exists, preserve that catalog row exactly and attach the CourseSpec to it.
- `CourseSpecCourseInfo`: immutable snapshot of the reviewed legacy Course Information, including source title/credits/year/semester/instructor metadata, even when those values differ from the current `Course` catalog row.
- `CourseSpec` / `CourseSpecSection`: specification container and per-section status.
- `CourseSpecClo`: CLO descriptions, C/A/P level, PLO mapping and status.
- `CourseSpecCloTeachingMethod` / `CourseSpecCloAssessmentMethod`: method links inferred conservatively from legacy text using the existing method vocabularies.
- `CourseSpecWeek`: weekly topic, CLOs, LLOs, contact hours, self-study where recoverable, methods, resources and assessment text.
- `CourseSpecAssessmentItem`: assessment name/type/mode/weight/CLO/PLO and due week where a weekly-plan match is found.
- `CourseSpecResource`: weekly resources plus required/recommended reference metadata retained from the DOCX.
- `CourseSpecStudentResponsibility`: ordered responsibility statements when recoverable.
- `CourseSpecPolicy`: the five normalized policy areas when headings can be parsed.
- `CourseSpecTeachingLearning`: course-level method/active-learning/resource/technology selections using the normalized table introduced by issue #137. Philosophy is left empty because the legacy template does not provide the new course-level philosophy field; therefore the Teaching & Learning section remains Draft until a lecturer reviews it.

## Intentionally not imported

- `Offering` semester/year/co-lecturers: requires a real academic term and should be handled by programme administration.
- CLO alignment `CourseSpecMappingCell`: the legacy canonical files do not provide the current mapping strength value, so the importer does not invent one.
- `CourseSpecWeekProjectProgress`: the legacy template predates the new Project-Based Learning progress feature.
- Submission/review workflow state: migrated specifications start as Draft and retain no fabricated submission/review history.
