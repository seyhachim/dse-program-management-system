# User honorific migration

Issue #432 adds an optional `User.honorific` enum-backed column.

- Allowed values: `Mr`, `Ms`, `Mrs`, `Mx`, `Dr`, `Prof`.
- The column is nullable and has no default.
- The migration performs no `UPDATE` or backfill.
- Existing users therefore remain unchanged and receive `NULL` for the new column.
- Honorific is never derived from `LecturerProfile.gender`.
- `User.title` remains the academic position.
