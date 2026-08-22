# Student roster import

Issue #540 adds a one-time, dry-run-first importer for institutional DSE student rosters.

## Safety boundary

The importer treats the official `Student.studentId` as the canonical roster identity. It never invents a student ID, email, cohort date, portal account, Offering, Enrollment, progression record, completion outcome, scholarship award, or defense record.

A supplied email is optional. If present it must be valid and cannot already belong to another student. Existing non-null Student/Profile fields are not overwritten by the importer; conflicts block the entire commit for human review. Existing `userId`, account linkage, status, Enrollment, results, attendance, CourseSpec, curriculum, and QA evidence are never modified.

`--commit` is all-or-nothing. Planning and writes run inside one serializable Prisma transaction, and any blocked row prevents all writes.

## Do not commit production roster data

Production import manifests contain student personal data. Keep them outside the repository, for example under a local ignored/temp path such as `../../tmp/student-import/`.

## Manifest format

```json
{
  "schemaVersion": 1,
  "source": "DSE_Students_Master_Cleaned.xlsx",
  "programmeId": "dse",
  "importMode": "one-time-upsert",
  "cohorts": [
    {
      "code": "DSE-G5",
      "name": "DSE Generation 5",
      "intakeYear": 2025,
      "expectedGraduationYear": 2029,
      "joinedAt": "2025-11-01",
      "status": "Active"
    }
  ],
  "students": [
    {
      "sourceRef": "DSE-G5-Y1.xlsx / M1 / row 2",
      "cohortCode": "DSE-G5",
      "studentId": "OFFICIAL-STUDENT-ID",
      "name": "Official display name",
      "email": null,
      "status": "Active",
      "profile": {
        "khmerFamilyName": null,
        "khmerGivenName": null,
        "latinFamilyName": null,
        "latinGivenName": null,
        "gender": null
      },
      "sourceMetadata": {
        "sourceGroup": "M1"
      }
    }
  ]
}
```

The example dates/IDs above are placeholders only. Use official cohort metadata and official student IDs before a production commit.

## Dry run

From `apps/backend`:

```powershell
bun run student-roster:import ../../tmp/student-import/dse-students.json
```

Dry-run performs database reads only and reports:

- `would_create`
- `would_update` (safe fill-only fields or missing cohort membership)
- `unchanged`
- `blocked`
- warnings and exact blockers

## Commit

Only after the dry-run has zero blocked rows and the report has been reviewed:

```powershell
bun run student-roster:import ../../tmp/student-import/dse-students.json --commit
```

The committed import is idempotent: running the same approved manifest again should report the existing records as unchanged and create no duplicate memberships.

## Current DSE production prerequisites

Before importing the cleaned 216-row DSE roster, obtain and verify:

1. official student ID for every student;
2. official intake year for DSE-G1 through DSE-G5;
3. expected graduation year for each generation;
4. official cohort joined/start date for each generation;
5. current/historical Student status where needed;
6. official email only where available (email is not required for a roster-only Student).

M1/M2/A1, scholarship, Thesis/Report, and defense-time values remain source metadata in this import. They must not be promoted into Offering/Enrollment/funding/defense academic records without a separate authoritative workflow.
