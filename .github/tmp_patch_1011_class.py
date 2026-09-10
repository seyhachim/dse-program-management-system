from pathlib import Path

p = Path("apps/backend/scripts/student-class-enrollment-import.ts")
t = p.read_text()

old = '''    studentIds: z
      .array(z.string().trim().min(1, "Official student ID is required"))
      .min(1, "At least one official student ID is required"),
'''
new = '''    studentIds: z
      .array(z.string().trim().min(1, "Official student ID is required"))
      .default([]),
    studentEmails: z
      .array(z.string().trim().toLowerCase().email("Valid institutional email is required"))
      .default([]),
'''
if old not in t: raise SystemExit("class schema identity marker missing")
t = t.replace(old, new, 1)

old = '''const ClassAssignmentSchema = z
  .object({'''
# add local refine after .strict()
strict_marker = '''  })
  .strict();

export const StudentClassEnrollmentImportDocumentSchema'''
strict_new = '''  })
  .strict()
  .refine((assignment) => assignment.studentIds.length + assignment.studentEmails.length > 0, {
    message: "At least one official student ID or institutional email is required",
    path: ["studentIds"],
  });

export const StudentClassEnrollmentImportDocumentSchema'''
if strict_marker not in t: raise SystemExit("class schema strict marker missing")
t = t.replace(strict_marker, strict_new, 1)

old = '''    const studentIds = new Map<string, { classIndex: number; studentIndex: number }>();
'''
new = '''    const studentIds = new Map<string, { classIndex: number; studentIndex: number }>();
    const studentEmails = new Map<string, { classIndex: number; studentIndex: number }>();
'''
if old not in t: raise SystemExit("duplicate identity map marker missing")
t = t.replace(old, new, 1)

old = '''      for (const [studentIndex, studentId] of assignment.studentIds.entries()) {
        const key = studentId.toLocaleLowerCase();
        const previous = studentIds.get(key);
        if (previous) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Official student ID '${studentId}' appears more than once in the import`,
            path: ["classes", classIndex, "studentIds", studentIndex],
          });
          continue;
        }
        studentIds.set(key, { classIndex, studentIndex });
      }
'''
new = old + '''
      for (const [studentIndex, studentEmail] of assignment.studentEmails.entries()) {
        const key = studentEmail.toLocaleLowerCase();
        const previous = studentEmails.get(key);
        if (previous) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Institutional email '${studentEmail}' appears more than once in the import`,
            path: ["classes", classIndex, "studentEmails", studentIndex],
          });
          continue;
        }
        studentEmails.set(key, { classIndex, studentIndex });
      }
'''
if old not in t: raise SystemExit("duplicate student ID loop marker missing")
t = t.replace(old, new, 1)

old = '''  studentId: string | null;
  name: string;
  status: (typeof STUDENT_STATUSES)[number];
'''
new = '''  studentId: string | null;
  email: string | null;
  name: string;
  status: (typeof STUDENT_STATUSES)[number];
'''
if old not in t: raise SystemExit("existing student type marker missing")
t = t.replace(old, new, 1)

old = '''  findStudentByStudentId(studentId: string): Promise<ExistingClassEnrollmentStudent | null>;
  findMembershipsForStudent'''
new = '''  findStudentByStudentId(studentId: string): Promise<ExistingClassEnrollmentStudent | null>;
  findStudentsByEmail(email: string): Promise<ExistingClassEnrollmentStudent[]>;
  findMembershipsForStudent'''
if old not in t: raise SystemExit("class store finder marker missing")
t = t.replace(old, new, 1)

old = '''export type StudentClassImportResult = {
  studentId: string;
  name: string | null;'''
new = '''export type StudentClassImportResult = {
  studentId: string | null;
  studentEmail: string | null;
  name: string | null;'''
if old not in t: raise SystemExit("class student result marker missing")
t = t.replace(old, new, 1)

old = '''    totalStudents: plan.document.classes.reduce(
      (count, assignment) => count + assignment.studentIds.length,
      0,
    ),'''
new = '''    totalStudents: plan.document.classes.reduce(
      (count, assignment) => count + assignment.studentIds.length + assignment.studentEmails.length,
      0,
    ),'''
if old not in t: raise SystemExit("summary total students marker missing")
t = t.replace(old, new, 1)

# Replace the student-resolution/planning loop with an identity-neutral loop.
start = t.index('  const studentResults: StudentClassImportResult[] = [];')
end = t.index('\n  const capacityRequests = new Map<string, StudentClassImportResult[]>();', start)
block = '''  const studentResults: StudentClassImportResult[] = [];
  const resolvedStudentIds = new Set<string>();

  for (const assignment of document.classes) {
    const key = `${assignment.cohortCode.toLocaleLowerCase()}|${assignment.programmeYear}|${assignment.classCode.toLocaleLowerCase()}`;
    const context = classContext.get(key)!;
    const identities = [
      ...assignment.studentIds.map((studentId) => ({ studentId, studentEmail: null as string | null })),
      ...assignment.studentEmails.map((studentEmail) => ({ studentId: null as string | null, studentEmail })),
    ];

    for (const identity of identities) {
      const warnings: string[] = [];
      const blockers = [...context.result.blockers];
      const identityLabel = identity.studentId
        ? `Student '${identity.studentId}'`
        : `Student email '${identity.studentEmail}'`;

      let student: ExistingClassEnrollmentStudent | null = null;
      if (identity.studentId) {
        student = await store.findStudentByStudentId(identity.studentId);
      } else if (identity.studentEmail) {
        const matches = await store.findStudentsByEmail(identity.studentEmail);
        if (matches.length > 1) {
          blockers.push(`Database contains multiple case-insensitive matches for email '${identity.studentEmail}'`);
        } else if (matches.length === 1) {
          student = matches[0]!;
        }
      }

      let existingEnrollmentCount = 0;
      const plannedEnrollments: EnrollmentToCreate[] = [];

      if (!student) {
        blockers.push(`${identityLabel} does not exist in PMS`);
      } else {
        if (resolvedStudentIds.has(student.id)) {
          blockers.push(`${identityLabel} resolves to a Student already listed elsewhere in this import`);
        } else {
          resolvedStudentIds.add(student.id);
        }

        if (identity.studentId && student.status !== "Active") {
          blockers.push(`${identityLabel} is '${student.status}', not Active`);
        } else if (identity.studentEmail && student.status === "Inactive") {
          blockers.push(`${identityLabel} is Inactive`);
        } else if (identity.studentEmail && student.status === "Pending" && student.studentId !== null) {
          warnings.push(`${identityLabel} is Pending even though an official Student ID already exists`);
        }

        if (identity.studentEmail && student.studentId === null && student.status !== "Pending") {
          blockers.push(`${identityLabel} has no official Student ID but is not Pending`);
        }

        if (context.result.cohortId) {
          const memberships = await store.findMembershipsForStudent(student.id);
          const exactActiveMembership = memberships.find(
            (membership) => membership.cohortId === context.result.cohortId && membership.exitedAt === null,
          );
          if (!exactActiveMembership) {
            blockers.push(`${identityLabel} has no active membership in cohort '${assignment.cohortCode}'`);
          }

          const otherActiveProgrammeMembership = memberships.find(
            (membership) =>
              membership.exitedAt === null &&
              membership.cohort.programmeId === document.programmeId &&
              membership.cohortId !== context.result.cohortId,
          );
          if (otherActiveProgrammeMembership) {
            blockers.push(`${identityLabel} also has active cohort '${otherActiveProgrammeMembership.cohort.code}' in programme '${document.programmeId}'`);
          }
        }

        const existingEnrollments = await store.findEnrollmentsForStudent(student.id, document.term);
        for (const targetOffering of context.offerings) {
          const exact = existingEnrollments.find((enrollment) => enrollment.offeringId === targetOffering.id);
          if (exact) {
            existingEnrollmentCount += 1;
            continue;
          }

          const conflictingClass = existingEnrollments.find(
            (enrollment) =>
              enrollment.offering.course.id === targetOffering.course.id &&
              enrollment.offering.term === document.term &&
              enrollment.offering.sectionCode.toLocaleUpperCase() !== assignment.classCode.toLocaleUpperCase(),
          );
          if (conflictingClass) {
            blockers.push(`${identityLabel} is already enrolled in ${targetOffering.course.code} Class '${conflictingClass.offering.sectionCode}' for term '${document.term}'`);
            continue;
          }

          plannedEnrollments.push({
            offeringId: targetOffering.id,
            courseId: targetOffering.course.id,
            courseCode: targetOffering.course.code,
            capacity: targetOffering.capacity,
            existingEnrollmentCount: targetOffering.enrollmentCount,
          });
        }
      }

      const result: StudentClassImportResult = {
        studentId: identity.studentId,
        studentEmail: identity.studentEmail,
        name: student?.name ?? null,
        cohortCode: assignment.cohortCode,
        programmeYear: assignment.programmeYear,
        classCode: assignment.classCode,
        action: blockers.length > 0 ? "blocked" : plannedEnrollments.length > 0 ? "would_enroll" : "unchanged",
        matchingOfferingCount: context.offerings.length,
        enrollmentsToCreate: plannedEnrollments.length,
        existingEnrollments: existingEnrollmentCount,
        warnings,
        blockers,
        ...(student ? { studentRecordId: student.id } : {}),
        ...(plannedEnrollments.length > 0 ? { plannedEnrollments } : {}),
      };
      studentResults.push(result);
    }
  }
'''
t = t[:start] + block + t[end:]

old = '''    findStudentByStudentId(studentId) {
      return db.student.findUnique({
        where: { studentId },
        select: { id: true, studentId: true, name: true, status: true },
      });
    },
    findMembershipsForStudent'''
new = '''    findStudentByStudentId(studentId) {
      return db.student.findUnique({
        where: { studentId },
        select: { id: true, studentId: true, email: true, name: true, status: true },
      });
    },
    findStudentsByEmail(email) {
      return db.student.findMany({
        where: { email: { equals: email, mode: "insensitive" } },
        select: { id: true, studentId: true, email: true, name: true, status: true },
        take: 2,
      });
    },
    findMembershipsForStudent'''
if old not in t: raise SystemExit("Prisma email finder marker missing")
t = t.replace(old, new, 1)
p.write_text(t)

# Unit test compatibility + provisional path coverage.
p = Path("apps/backend/scripts/student-class-enrollment-import.test.ts")
x = p.read_text()
old = '''      status: "Active",
    });'''
new = '''      email: null,
      status: "Active",
    });'''
# Only the first occurrence in addActiveStudent.
if old not in x: raise SystemExit("MemoryStore active student marker missing")
x = x.replace(old, new, 1)

old = '''  async findStudentByStudentId(studentId: string) {
    return this.students.get(studentId) ?? null;
  }
  async findMembershipsForStudent'''
new = '''  async findStudentByStudentId(studentId: string) {
    return this.students.get(studentId) ?? null;
  }
  async findStudentsByEmail(email: string) {
    return [...this.students.values()].filter((student) => student.email?.toLowerCase() === email.toLowerCase());
  }
  async findMembershipsForStudent'''
if old not in x: raise SystemExit("MemoryStore email finder marker missing")
x = x.replace(old, new, 1)

insert = '''
  test("enrolls a Pending provisional student resolved by institutional email", async () => {
    const store = new MemoryStore();
    const recordId = "student-pending";
    store.students.set("pending-key", {
      id: recordId,
      studentId: null,
      email: "pending@rupp.edu.kh",
      name: "Pending Student",
      status: "Pending",
    });
    store.memberships.set(recordId, [{
      id: "membership-pending",
      cohortId: "cohort-2024",
      joinedAt: new Date("2024-11-01T00:00:00.000Z"),
      exitedAt: null,
      cohort: { id: "cohort-2024", code: "DSE-2024", programmeId: "dse" },
    }]);
    const parsed = parseStudentClassEnrollmentImportDocument({
      schemaVersion: 1,
      source: "pending-email.json",
      programmeId: "dse",
      term: "2026-2027-S1",
      classes: [{
        cohortCode: "DSE-2024",
        programmeYear: 3,
        classCode: "M1",
        studentEmails: [" PENDING@RUPP.EDU.KH "],
      }],
    });
    expect(parsed.classes[0]?.studentEmails).toEqual(["pending@rupp.edu.kh"]);
    const plan = await planStudentClassEnrollmentImport(store, parsed);
    expect(plan.students[0]?.studentId).toBeNull();
    expect(plan.students[0]?.studentEmail).toBe("pending@rupp.edu.kh");
    expect(plan.students[0]?.action).toBe("would_enroll");
    await applyStudentClassEnrollmentImportPlan(store, plan);
    expect(store.writes).toHaveLength(2);
    expect(store.writes.every((write) => write.studentRecordId === recordId)).toBe(true);
  });

  test("rejects duplicate emails and blocks missing or inactive email identities", async () => {
    expect(() => parseStudentClassEnrollmentImportDocument({
      schemaVersion: 1,
      source: "duplicate-email.json",
      programmeId: "dse",
      term: "2026-2027-S1",
      classes: [{ cohortCode: "DSE-2024", programmeYear: 3, classCode: "M1", studentEmails: ["same@rupp.edu.kh", "SAME@RUPP.EDU.KH"] }],
    })).toThrow("appears more than once");

    const missingStore = new MemoryStore();
    const missing = parseStudentClassEnrollmentImportDocument({
      schemaVersion: 1,
      source: "missing-email.json",
      programmeId: "dse",
      term: "2026-2027-S1",
      classes: [{ cohortCode: "DSE-2024", programmeYear: 3, classCode: "M1", studentEmails: ["missing@rupp.edu.kh"] }],
    });
    const missingPlan = await planStudentClassEnrollmentImport(missingStore, missing);
    expect(missingPlan.students[0]?.action).toBe("blocked");
    expect(missingPlan.students[0]?.blockers.join(" ")).toContain("does not exist in PMS");

    const inactiveStore = new MemoryStore();
    inactiveStore.students.set("inactive-key", { id: "student-inactive", studentId: null, email: "inactive@rupp.edu.kh", name: "Inactive", status: "Inactive" });
    inactiveStore.memberships.set("student-inactive", []);
    const inactive = parseStudentClassEnrollmentImportDocument({
      schemaVersion: 1,
      source: "inactive-email.json",
      programmeId: "dse",
      term: "2026-2027-S1",
      classes: [{ cohortCode: "DSE-2024", programmeYear: 3, classCode: "M1", studentEmails: ["inactive@rupp.edu.kh"] }],
    });
    const inactivePlan = await planStudentClassEnrollmentImport(inactiveStore, inactive);
    expect(inactivePlan.students[0]?.blockers.join(" ")).toContain("Inactive");
  });
'''
needle = '\n  test("keeps exact enrollments idempotent and blocks a conflicting parallel class"'
pos = x.index(needle)
x = x[:pos] + insert + x[pos:]
p.write_text(x)

# Operator docs: emails are a provisional identity path, never a Student ID substitute.
p = Path("apps/backend/scripts/student-class-enrollment-import.README.md")
r = p.read_text()
r = r.replace('- requires an official institutional `studentId` for every student;', '- accepts either an official institutional `studentId` or an institutional `studentEmail`; the email path is for canonical provisional/Pending students whose official ID is not yet collected;')
r = r.replace('      "studentIds": ["OFFICIAL-STUDENT-ID-001"]', '      "studentIds": ["OFFICIAL-STUDENT-ID-001"],\n      "studentEmails": []', 1)
r = r.replace('      "studentIds": ["OFFICIAL-STUDENT-ID-002"]', '      "studentIds": [],\n      "studentEmails": ["student@rupp.edu.kh"]', 1)
r = r.replace('A student ID may appear only once in a manifest. A repeated ID across classes is rejected before database planning.', 'A student ID or institutional email may appear only once in a manifest. Repeated identities are rejected before database planning. Email values are normalized to lowercase. The importer never copies an email into `Student.studentId`.')
r = r.replace('For the current survey-derived M1/M2/E1 roster, do **not** run `--commit` until official Student IDs have been collected and the canonical Student + cohort-membership records exist. Email addresses or Microsoft Forms response numbers must not be substituted for institutional Student IDs.', 'For the current survey-derived M1/M2/E1 roster, first create/reconcile canonical provisional Students and cohort memberships through `student-roster-import.ts`. Then use `studentEmails` for the reviewed class-enrollment import. Microsoft Forms response numbers must never be used as student identity, and email must never be copied into `Student.studentId`.')
p.write_text(r)
