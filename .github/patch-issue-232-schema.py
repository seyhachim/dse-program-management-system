from pathlib import Path

path = Path("apps/backend/prisma/schema.prisma")
text = path.read_text()
if "model QaSarRelease {" in text:
    raise SystemExit(0)

pairs = [
    (
        '  qaSarReviews              QaSarReview[]              @relation("QaSarReviewer")\n',
        '  qaSarReviews              QaSarReview[]              @relation("QaSarReviewer")\n'
        '  qaSarReleasesFinalized    QaSarRelease[]             @relation("QaSarReleaseFinalizedBy")\n',
    ),
    (
        '  qaSarSubmissions          QaSarSubmission[]\n',
        '  qaSarSubmissions          QaSarSubmission[]\n'
        '  qaSarReleases             QaSarRelease[]\n',
    ),
    (
        '  sarSubmissions   QaSarSubmission[]\n\n  @@index([programmeId, status])',
        '  sarSubmissions   QaSarSubmission[]\n'
        '  sarReleases      QaSarRelease[]\n\n'
        '  @@index([programmeId, status])',
    ),
]
for old, new in pairs:
    if text.count(old) != 1:
        raise SystemExit(f"schema anchor count {text.count(old)} for {old[:80]!r}")
    text = text.replace(old, new, 1)

anchor = '''  @@index([reviewerId])
}

/// Canonical programme evidence item.'''
model = '''  @@index([reviewerId])
}

/// Immutable official SAR release. The JSON snapshot is rendered from exact
/// approved submissions and the submission id list pins the source versions.
model QaSarRelease {
  id              String            @id @default(uuid())
  programmeId     String
  programme       Programme         @relation(fields: [programmeId], references: [id], onDelete: Restrict)
  cycleId         String
  cycle           QaAssessmentCycle @relation(fields: [cycleId], references: [id], onDelete: Cascade)
  version         Int
  title           String
  templateVersion String            @default("aun-qa-sar-v1")
  snapshot        Json
  submissionIds   String[]
  finalizedById   String
  finalizedBy     User              @relation("QaSarReleaseFinalizedBy", fields: [finalizedById], references: [id], onDelete: Restrict)
  finalizedAt     DateTime          @default(now())

  @@unique([cycleId, version])
  @@index([programmeId, cycleId])
  @@index([finalizedById])
}

/// Canonical programme evidence item.'''
if text.count(anchor) != 1:
    raise SystemExit(f"release insertion anchor count {text.count(anchor)}")
path.write_text(text.replace(anchor, model, 1))
