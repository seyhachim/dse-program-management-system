DSE CourseSpec migration — reviewed four-course relocation package (v2)

Approved mappings:
- DSC102 -> CCS101 (Year 1, Semester 1)
- DMA201 -> MAT202 (Year 2, Semester 2)
- PDT202 -> PDT102 (Year 1, Semester 2)
- SCA302 -> SCA402 (Year 4, Semester 2)

This v2 package is intended for importer behavior merged in PR #651 / issue #649.
Each course keeps original source.yearFolder/source.semesterFolder unchanged as legacy provenance
and adds reviewedPlacement with the programme-owner-approved 2026 placement.

Do not use --allow-warnings or --replace-existing.
Dry-run first. Commit only after total=4, ready=4, blocked=0, failed=0.

Related migration issue: #633
Reviewed placement integrity issue: #649
