from pathlib import Path

schema_path = Path("apps/backend/prisma/schema.prisma")
text = schema_path.read_text()

old = '''/// Students plugin domain model.
model Student {
  id        String        @id @default(uuid())
  name      String
  email     String        @unique
  studentId String        @unique
  status    StudentStatus @default(Active)
  createdAt DateTime      @default(now())
  userId    String?       @unique
  user      User?         @relation(fields: [userId], references: [id], onDelete: SetNull)

  enrollments                    Enrollment[]
  classResponsibilityAssignments ClassResponsibilityAssignment[]
  classResponsibilityAuditEvents ClassResponsibilityAuditEvent[]
  cohortMemberships              StudentCohortMembership[]

  @@index([status])
}
'''

new = '''/// Students plugin domain model. `studentId` is the stable institutional identity.
/// Email is optional because historical/current roster records may legitimately predate
/// portal-account provisioning; User/auth linkage remains separate through `userId`.
model Student {
  id        String        @id @default(uuid())
  name      String
  email     String?       @unique
  studentId String        @unique
  status    StudentStatus @default(Active)
  createdAt DateTime      @default(now())
  userId    String?       @unique
  user      User?         @relation(fields: [userId], references: [id], onDelete: SetNull)
  profile   StudentProfile?

  enrollments                    Enrollment[]
  classResponsibilityAssignments ClassResponsibilityAssignment[]
  classResponsibilityAuditEvents ClassResponsibilityAuditEvent[]
  cohortMemberships              StudentCohortMembership[]

  @@index([status])
}

/// Optional bilingual/demographic identity metadata sourced from institutional
/// rosters. It stays one-to-one with Student so core academic references continue
/// to use the stable Student id/studentId rather than mutable presentation fields.
model StudentProfile {
  id               String   @id @default(uuid())
  studentRecordId  String   @unique
  student           Student  @relation(fields: [studentRecordId], references: [id], onDelete: Cascade)
  khmerFamilyName  String?
  khmerGivenName   String?
  latinFamilyName  String?
  latinGivenName   String?
  gender           String?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  @@index([gender])
}
'''

if text.count(old) != 1:
    raise SystemExit(f"Student schema anchor count was {text.count(old)}, expected 1")

schema_path.write_text(text.replace(old, new, 1))
