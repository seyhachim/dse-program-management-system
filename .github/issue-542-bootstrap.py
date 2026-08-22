from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one anchor, found {count}: {old!r}")
    file.write_text(text.replace(old, new, 1))


replace_once(
    "apps/backend/prisma/schema.prisma",
    '''  academicYear String\n  term         String\n  periodStart  DateTime                 @db.Date\n''',
    '''  academicYear String\n  term         String\n  programmeYear Int?\n  periodStart  DateTime                 @db.Date\n''',
)
replace_once(
    "apps/backend/prisma/schema.prisma",
    '''  @@unique([membershipId, academicYear, term])\n  @@index([membershipId, periodStart])\n  @@index([academicYear, term, status])\n''',
    '''  @@unique([membershipId, academicYear, term])\n  @@index([membershipId, periodStart])\n  @@index([membershipId, programmeYear, periodStart])\n  @@index([academicYear, term, status])\n''',
)
replace_once(
    "apps/backend/src/plugins/qa/evidence/registry.ts",
    '''            'academicYear', p."academicYear",\n            'term', p.term,\n            'periodKey', p."academicYear" || ':' || p.term,\n''',
    '''            'academicYear', p."academicYear",\n            'term', p.term,\n            'programmeYear', p."programmeYear",\n            'periodKey', p."academicYear" || ':' || p.term,\n''',
)
