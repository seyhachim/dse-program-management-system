from pathlib import Path

# Roster DB: prove provisional create -> idempotent rerun -> attach official ID on same row.
p = Path("apps/backend/scripts/student-roster-import-db.test.ts")
t = p.read_text()
t = t.replace(
'''    const studentIds = [`TEST-540-A-${suffix}`, `TEST-540-B-${suffix}`, `TEST-540-C-${suffix}`];
''',
'''    const studentIds = [`TEST-540-A-${suffix}`, `TEST-540-B-${suffix}`, `TEST-540-C-${suffix}`];
    const provisionalEmail = `pending-${suffix}@rupp.edu.kh`;
    const provisionalOfficialId = `TEST-1011-PENDING-${suffix}`;
''',1)
needle = '''      expect(
        await prisma.studentCohortMembership.count({
          where: { student: { studentId: { in: studentIds.slice(0, 2) } }, cohort: { code: cohortCode } },
        }),
      ).toBe(2);

'''
insert = needle + '''      const provisionalDocument = parseStudentRosterImportDocument({
        schemaVersion: 1,
        source: "issue-1011-provisional-db-test.json",
        programmeId: "dse",
        importMode: "one-time-upsert",
        cohorts: [{
          code: cohortCode,
          name: "Issue 540 Test Cohort",
          intakeYear: 2026,
          expectedGraduationYear: 2030,
          joinedAt: "2026-11-01",
          status: "Active",
        }],
        students: [{
          sourceRef: "provisional/row-1",
          cohortCode,
          studentId: null,
          name: "Provisional Student",
          email: provisionalEmail,
          status: "Pending",
        }],
      });

      const provisionalFirst = await commitStudentRosterImport(prisma, provisionalDocument);
      expect(provisionalFirst.wouldCreate).toBe(1);
      const provisionalStudent = await prisma.student.findFirst({ where: { email: provisionalEmail } });
      expect(provisionalStudent).toMatchObject({ studentId: null, email: provisionalEmail, status: "Pending", userId: null });
      const provisionalRecordId = provisionalStudent!.id;
      expect(await prisma.studentCohortMembership.count({ where: { studentId: provisionalRecordId, cohort: { code: cohortCode } } })).toBe(1);

      const provisionalAgain = await commitStudentRosterImport(prisma, provisionalDocument);
      expect(provisionalAgain.unchanged).toBe(1);
      expect(await prisma.student.count({ where: { email: provisionalEmail } })).toBe(1);

      const attachIdDocument = parseStudentRosterImportDocument({
        schemaVersion: 1,
        source: "issue-1011-attach-id-db-test.json",
        programmeId: "dse",
        importMode: "one-time-upsert",
        cohorts: [{
          code: cohortCode,
          name: "Issue 540 Test Cohort",
          intakeYear: 2026,
          expectedGraduationYear: 2030,
          joinedAt: "2026-11-01",
          status: "Active",
        }],
        students: [{
          sourceRef: "provisional/row-1",
          cohortCode,
          studentId: provisionalOfficialId,
          name: "Provisional Student",
          email: provisionalEmail,
          status: "Pending",
        }],
      });
      const attached = await commitStudentRosterImport(prisma, attachIdDocument);
      expect(attached.wouldUpdate).toBe(1);
      const afterAttach = await prisma.student.findUnique({ where: { studentId: provisionalOfficialId } });
      expect(afterAttach?.id).toBe(provisionalRecordId);
      expect(afterAttach?.email).toBe(provisionalEmail);
      expect(afterAttach?.status).toBe("Pending");

'''
if needle not in t: raise SystemExit("roster DB insertion marker missing")
t = t.replace(needle, insert, 1)
old = '''          {
            sourceRef: "blocked/row-2",
            cohortCode: blockedCohortCode,
            studentId: null,
            name: "Missing Official ID",
          },
'''
new = '''          {
            sourceRef: "blocked/row-2",
            cohortCode: blockedCohortCode,
            studentId: studentIds[0],
            name: "Conflicting Existing Name",
          },
'''
if old not in t: raise SystemExit("obsolete missing-id blocked row marker missing")
t = t.replace(old,new,1)
# Cleanup provisional by email/attached id before cohort delete.
old = '''      await prisma.student.deleteMany({ where: { studentId: { in: studentIds } } });
      await prisma.studentCohort.deleteMany({
'''
new = '''      await prisma.student.deleteMany({
        where: { OR: [{ studentId: { in: [...studentIds, provisionalOfficialId] } }, { email: provisionalEmail }] },
      });
      await prisma.studentCohort.deleteMany({
'''
if old not in t: raise SystemExit("roster DB cleanup marker missing")
t = t.replace(old,new,1)
p.write_text(t)

# Class DB: create a provisional Pending student and prove email-keyed commit/rerun.
p = Path("apps/backend/scripts/student-class-enrollment-import-db.test.ts")
t = p.read_text()
t = t.replace(
'''    const studentIds = [
      `T1008-STUDENT-${suffix}`,
      `T1008-BLOCKED-${suffix}`,
      `T1008-ATOMIC-${suffix}`,
    ];
''',
'''    const studentIds = [
      `T1008-STUDENT-${suffix}`,
      `T1008-BLOCKED-${suffix}`,
      `T1008-ATOMIC-${suffix}`,
    ];
    const provisionalEmail = `pending-class-${suffix}@rupp.edu.kh`;
''',1)
needle = '''      const second = await commitStudentClassEnrollmentImport(prisma, manifestFor(studentIds[0]!));
      expect(second.wouldCreateEnrollments).toBe(0);
      expect(second.unchangedEnrollments).toBe(2);
      expect(
        await prisma.enrollment.count({
          where: { studentId: studentRecordIds[0], offeringId: { in: offeringIds } },
        }),
      ).toBe(2);

'''
insert = needle + '''      const provisionalStudent = await prisma.student.create({
        data: {
          studentId: null,
          email: provisionalEmail,
          name: "Issue 1011 Provisional Student",
          status: "Pending",
        },
        select: { id: true },
      });
      studentRecordIds.push(provisionalStudent.id);
      await prisma.studentCohortMembership.create({
        data: {
          cohortId: cohort.id,
          studentId: provisionalStudent.id,
          joinedAt: new Date("2024-11-01T00:00:00.000Z"),
          note: "Issue #1011 provisional class database test",
        },
      });
      const provisionalManifest = parseStudentClassEnrollmentImportDocument({
        schemaVersion: 1,
        source: "issue-1011-provisional-class-db-test.json",
        programmeId: "dse",
        term,
        classes: [{
          cohortCode,
          programmeYear: 3,
          classCode: "M1",
          studentEmails: [provisionalEmail],
        }],
      });
      const provisionalCommit = await commitStudentClassEnrollmentImport(prisma, provisionalManifest);
      expect(provisionalCommit.blockedStudents).toBe(0);
      expect(provisionalCommit.wouldCreateEnrollments).toBe(2);
      expect(await prisma.enrollment.count({ where: { studentId: provisionalStudent.id, offeringId: { in: offeringIds } } })).toBe(2);
      const provisionalRerun = await commitStudentClassEnrollmentImport(prisma, provisionalManifest);
      expect(provisionalRerun.wouldCreateEnrollments).toBe(0);
      expect(provisionalRerun.unchangedEnrollments).toBe(2);

'''
if needle not in t: raise SystemExit("class DB insertion marker missing")
t=t.replace(needle,insert,1)
p.write_text(t)
