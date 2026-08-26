Generated for current PMS course-spec importer (schemaVersion dse-course-spec-import-v1).
Run dry-run from apps/backend:
  bun run course-spec:import <path-to-this-folder>
Or one course:
  bun run course-spec:import <path-to-this-folder> --course=BPR101

Only source-matching Course Instructor records for Chea Daly or Heng Chanarin are included. See import-report.json for excluded curriculum/document conflicts.
