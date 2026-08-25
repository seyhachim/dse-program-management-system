Reviewed CourseSpec mapping package — 4 programme-approved relocations

Issue: #633
Approval recorded: 2026-08-25

Approved mappings:
- DSC102 -> CCS101 (Year 1 Semester 1)
- DMA201 -> MAT202 (Year 2 Semester 2)
- PDT202 -> PDT102 (Year 1 Semester 2)
- SCA302 -> SCA402 (Year 4 Semester 2)

Safety:
- Dry-run first.
- Point the importer at the courses/ directory.
- Do not use --allow-warnings.
- Do not use --replace-existing.
- PR #637 / issue #635 must already be on main so existing Course catalog rows cannot be overwritten.
- The target identity/title/credits/year/semester are taken from DSE Curriculum - 2026.
- Original DOCX provenance and legacy course metadata are retained in each JSON under source and migrationReview.
- STR102/STA102 and EIN302 remain blocked because their assessment totals are inconsistent.
