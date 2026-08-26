# Academic Calendar ownership and revision rules

Epic #638 establishes **Academic Calendar** as the canonical source of programme academic-period dates.

- **Curriculum** owns which courses belong to a study year and semester.
- **Academic Calendar** owns official academic-year, teaching, examination, break, and programme academic-event dates.
- **Course Offering** references a published calendar period; it owns section, lecturer, timetable meetings, enrolments, assessment deadlines, and delivery state. New offerings do not redefine canonical semester dates.
- **ProgrammeImportantDate** continues to own admissions/public-marketing dates that are not academic-calendar records. Public channels may project published calendar dates, but must not copy them into a competing source of truth.
- **Student Portal / handbook / public channels** consume published projections only. Draft calendars are never a downstream data source.

## Published corrections

Published calendar content is immutable. A correction creates a new Draft revision in the same calendar series. Publishing that revision supersedes the previous revision. Planned/Active Offerings are rebound to the equivalent new semester period so current delivery follows the corrected canonical dates; Completed Offerings retain their old period reference so historical academic evidence remains reconstructable.

## Missing calendars

A study year may legitimately have no published calendar. Consumers return an explicit unavailable state and never borrow dates from another study year or fabricate defaults.
