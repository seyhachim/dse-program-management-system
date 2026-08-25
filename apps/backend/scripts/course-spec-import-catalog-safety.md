# CourseSpec import catalog safety — issue #633

The legacy CourseSpec importer must treat an existing `Course` row as canonical curriculum/catalog context. Legacy DOCX Course Information belongs in the immutable CourseSpec Course Information snapshot and must not overwrite the existing Course's title, credits, description, prerequisites, course type, total SLT, or lecturer assignment.

## Discovered production-data risk

During the 2026 legacy migration, 22 clean CourseSpecs were committed successfully. Review of the importer then showed that `tx.course.upsert(... update: ...)` rewrites existing Course catalog fields from the legacy DOCX. This is unsafe because several legacy documents intentionally differ from the 2026 curriculum (for example DSA202 says "Data Structure and Algorithm I", MAT101/MAT102 are swapped relative to the current curriculum, and ENG102 carries 4 credits while the 2026 curriculum says 3).

## Required fix before additional CourseSpec commits

- Existing Course: preserve all catalog fields; attach the new CourseSpec only.
- Missing Course: creation from canonical JSON may remain supported.
- `--replace-existing` may replace only the CourseSpec, never the Course catalog row.
- Add a DB-backed regression test proving an existing Course's catalog fields remain byte-for-byte unchanged after an import commit.
- Keep the CourseInfo snapshot sourced from the reviewed canonical JSON for auditability.

## Existing repair helper

`course-catalog-repair-2026.ts` safely restores only title/credits that are explicitly evidenced by `DSE Curriculum - 2026.docx`. It deliberately does not guess description, prerequisites, course type, total SLT, or lecturer assignment.
