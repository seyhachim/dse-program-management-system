# Student class enrollment import

Issues: #1008, #1011

This operator-only importer assigns **existing canonical PMS students** to **existing course Offerings** for one declared term/year/class. It is intentionally separate from `student-roster-import.ts`: roster import owns Student/Profile/CohortMembership creation, while this script creates only missing `Enrollment` rows after all safety checks pass.

## Safety boundary

The importer:

- accepts either an official institutional `studentId` or an institutional `studentEmail`; the email path supports an existing canonical provisional/Pending student whose official ID has not yet been collected;
- never creates or updates Student identity/profile data;
- requires an existing canonical Student and active membership in the declared programme cohort; official-ID identities must be Active, while an email-keyed Student with no official ID must be Pending;
- resolves only existing Offerings by programme + term + programmeYear + class (`Offering.sectionCode`);
- never creates, edits, or moves Offerings;
- blocks a student already enrolled in another parallel class for the same course/term;
- checks projected capacity across the complete import batch;
- keeps exact existing enrollments unchanged, so reruns are idempotent;
- performs commit in one Serializable transaction;
- creates no User/Supabase Auth account;
- does not modify CourseSpecs, attendance, assessments/results, QA evidence, progression, or historical academic records.

Do not commit real roster manifests containing student PII to this repository.

## Manifest

```json
{
  "schemaVersion": 1,
  "source": "official 2026-2027 class roster",
  "programmeId": "dse",
  "term": "2026-2027-S1",
  "classes": [
    {
      "cohortCode": "DSE-2024",
      "programmeYear": 3,
      "classCode": "M1",
      "studentIds": ["OFFICIAL-STUDENT-ID-001"],
      "studentEmails": []
    },
    {
      "cohortCode": "DSE-2024",
      "programmeYear": 3,
      "classCode": "M2",
      "studentIds": [],
      "studentEmails": ["student@rupp.edu.kh"]
    },
    {
      "cohortCode": "DSE-2023",
      "programmeYear": 4,
      "classCode": "E1",
      "studentIds": ["OFFICIAL-STUDENT-ID-003"]
    }
  ]
}
```

`classCode` uses the same normalization as Offering classes: trim, uppercase, maximum 12 characters, and letters/numbers/hyphens only.

A student ID or institutional email may appear only once in a manifest. Repeated identities are rejected before database planning. Email values are normalized to lowercase. The importer never copies an email into `Student.studentId`.

## Dry-run first

```bash
bun run --cwd apps/backend student-class-enrollment:import /absolute/path/to/class-roster.json
```

Dry-run is the default and writes nothing. Review:

- target Offering count per class;
- student/canonical cohort match;
- enrollments that would be created;
- exact existing enrollments;
- parallel-class conflicts;
- capacity blockers and warnings.

Any class/student blocker means commit will refuse the whole batch.

## Commit

After the reviewed dry-run is clean:

```bash
bun run --cwd apps/backend student-class-enrollment:import /absolute/path/to/class-roster.json --commit
```

The commit repeats the complete plan inside one Serializable transaction before creating Enrollment rows. If the database changed in a conflicting way, the transaction fails rather than partially enrolling the roster.

## Current production gate

For the current survey-derived M1/M2/E1 roster, first create/reconcile canonical provisional Students and cohort memberships through `student-roster-import.ts`. Then use `studentEmails` for the reviewed class-enrollment import. Microsoft Forms response numbers must never be used as student identity, and email must never be copied into `Student.studentId`.
