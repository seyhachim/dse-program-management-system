import { readFile } from "node:fs/promises";
import { SectionCodeSchema } from "@dse-pms/shared-types";
import { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";

const STUDENT_STATUSES = ["Active", "Inactive", "Pending"] as const;
const COHORT_STATUSES = ["Planned", "Active", "Completed", "Archived"] as const;
const OFFERING_STATUSES = ["Planned", "Active", "Completed"] as const;

const ClassAssignmentSchema = z
  .object({
    cohortCode: z.string().trim().min(1).max(100),
    programmeYear: z.number().int().min(1).max(8),
    classCode: SectionCodeSchema,
    studentIds: z
      .array(z.string().trim().min(1, "Official student ID is required"))
      .default([]),
    studentEmails: z
      .array(z.string().trim().toLowerCase().email("Valid institutional email is required"))
      .default([]),
  })
  .strict()
  .refine((assignment) => assignment.studentIds.length + assignment.studentEmails.length > 0, {
    message: "At least one official student ID or institutional email is required",
    path: ["studentIds"],
  });

export const StudentClassEnrollmentImportDocumentSchema = z
  .object({
    schemaVersion: z.literal(1),
    source: z.string().trim().min(1).max(500),
    programmeId: z.string().trim().min(1).max(100),
    term: z.string().trim().min(1).max(100),
    classes: z.array(ClassAssignmentSchema).min(1),
  })
  .strict()
  .superRefine((document, ctx) => {
    const classKeys = new Set<string>();
    const studentIds = new Map<string, { classIndex: number; studentIndex: number }>();
    const studentEmails = new Map<string, { classIndex: number; studentIndex: number }>();

    for (const [classIndex, assignment] of document.classes.entries()) {
      const classKey = [
        assignment.cohortCode.toLocaleLowerCase(),
        assignment.programmeYear,
        assignment.classCode.toLocaleLowerCase(),
      ].join("|");
      if (classKeys.has(classKey)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate class assignment '${assignment.cohortCode} / Year ${assignment.programmeYear} / ${assignment.classCode}'`,
          path: ["classes", classIndex],
        });
      }
      classKeys.add(classKey);

      for (const [studentIndex, studentId] of assignment.studentIds.entries()) {
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
    }
  });

export type StudentClassEnrollmentImportDocument = z.infer<
  typeof StudentClassEnrollmentImportDocumentSchema
>;
export type StudentClassAssignment = StudentClassEnrollmentImportDocument["classes"][number];

export type ExistingClassEnrollmentStudent = {
  id: string;
  studentId: string | null;
  email: string | null;
  name: string;
  status: (typeof STUDENT_STATUSES)[number];
};

export type ExistingClassEnrollmentCohort = {
  id: string;
  programmeId: string;
  code: string;
  status: (typeof COHORT_STATUSES)[number];
};

export type ExistingClassEnrollmentMembership = {
  id: string;
  cohortId: string;
  joinedAt: Date;
  exitedAt: Date | null;
  cohort: { id: string; code: string; programmeId: string };
};

export type TargetClassOffering = {
  id: string;
  term: string;
  programmeYear: number | null;
  sectionCode: string;
  capacity: number;
  status: (typeof OFFERING_STATUSES)[number];
  enrollmentCount: number;
  course: { id: string; code: string; programmeId: string };
};

export type ExistingClassEnrollment = {
  offeringId: string;
  offering: {
    id: string;
    term: string;
    programmeYear: number | null;
    sectionCode: string;
    course: { id: string; code: string; programmeId: string };
  };
};

export type StudentClassEnrollmentImportStore = {
  programmeExists(programmeId: string): Promise<boolean>;
  findCohort(programmeId: string, cohortCode: string): Promise<ExistingClassEnrollmentCohort | null>;
  findStudentByStudentId(studentId: string): Promise<ExistingClassEnrollmentStudent | null>;
  findStudentsByEmail(email: string): Promise<ExistingClassEnrollmentStudent[]>;
  findMembershipsForStudent(studentRecordId: string): Promise<ExistingClassEnrollmentMembership[]>;
  findTargetOfferings(input: {
    programmeId: string;
    term: string;
    programmeYear: number;
    classCode: string;
  }): Promise<TargetClassOffering[]>;
  findEnrollmentsForStudent(studentRecordId: string, term: string): Promise<ExistingClassEnrollment[]>;
  createEnrollment(input: { offeringId: string; studentRecordId: string }): Promise<void>;
};

export type ClassImportResult = {
  cohortCode: string;
  programmeYear: number;
  classCode: string;
  action: "ready" | "blocked";
  targetOfferingCount: number;
  targetOfferings: Array<{
    id: string;
    courseCode: string;
    classCode: string;
    capacity: number;
    enrolled: number;
    status: (typeof OFFERING_STATUSES)[number];
  }>;
  warnings: string[];
  blockers: string[];
  cohortId?: string;
};

type EnrollmentToCreate = {
  offeringId: string;
  courseId: string;
  courseCode: string;
  capacity: number;
  existingEnrollmentCount: number;
};

export type StudentClassImportResult = {
  studentId: string | null;
  studentEmail: string | null;
  name: string | null;
  cohortCode: string;
  programmeYear: number;
  classCode: string;
  action: "would_enroll" | "unchanged" | "blocked";
  matchingOfferingCount: number;
  enrollmentsToCreate: number;
  existingEnrollments: number;
  warnings: string[];
  blockers: string[];
  studentRecordId?: string;
  plannedEnrollments?: EnrollmentToCreate[];
};

export type StudentClassEnrollmentImportPlan = {
  document: StudentClassEnrollmentImportDocument;
  globalErrors: string[];
  classes: ClassImportResult[];
  students: StudentClassImportResult[];
};

export type StudentClassEnrollmentImportSummary = {
  mode: "dry-run" | "commit";
  source: string;
  programmeId: string;
  term: string;
  totalClasses: number;
  totalStudents: number;
  targetOfferings: number;
  wouldCreateEnrollments: number;
  unchangedEnrollments: number;
  blockedStudents: number;
  blockedClasses: number;
  warnings: number;
  globalErrors: string[];
  classes: Array<Omit<ClassImportResult, "cohortId">>;
  students: Array<Omit<StudentClassImportResult, "studentRecordId" | "plannedEnrollments">>;
};

export class StudentClassEnrollmentImportBlockedError extends Error {
  constructor(public readonly summary: StudentClassEnrollmentImportSummary) {
    super("Student class enrollment import is blocked; no database changes were made");
  }
}

export function parseStudentClassEnrollmentImportDocument(
  input: unknown,
): StudentClassEnrollmentImportDocument {
  return StudentClassEnrollmentImportDocumentSchema.parse(input);
}

function hasBlockers(plan: StudentClassEnrollmentImportPlan): boolean {
  return (
    plan.globalErrors.length > 0 ||
    plan.classes.some((result) => result.action === "blocked") ||
    plan.students.some((result) => result.action === "blocked")
  );
}

function publicClassResult(result: ClassImportResult): Omit<ClassImportResult, "cohortId"> {
  const { cohortId: _cohortId, ...publicResult } = result;
  return publicResult;
}

function publicStudentResult(
  result: StudentClassImportResult,
): Omit<StudentClassImportResult, "studentRecordId" | "plannedEnrollments"> {
  const { studentRecordId: _studentRecordId, plannedEnrollments: _plannedEnrollments, ...publicResult } =
    result;
  return publicResult;
}

export function summarizeStudentClassEnrollmentImport(
  plan: StudentClassEnrollmentImportPlan,
  mode: "dry-run" | "commit",
): StudentClassEnrollmentImportSummary {
  const uniqueOfferingIds = new Set(
    plan.classes.flatMap((result) => result.targetOfferings.map((offering) => offering.id)),
  );
  const unblockedStudents = plan.students.filter((result) => result.action !== "blocked");

  return {
    mode,
    source: plan.document.source,
    programmeId: plan.document.programmeId,
    term: plan.document.term,
    totalClasses: plan.document.classes.length,
    totalStudents: plan.document.classes.reduce(
      (count, assignment) => count + assignment.studentIds.length + assignment.studentEmails.length,
      0,
    ),
    targetOfferings: uniqueOfferingIds.size,
    wouldCreateEnrollments: unblockedStudents.reduce(
      (count, result) => count + result.enrollmentsToCreate,
      0,
    ),
    unchangedEnrollments: unblockedStudents.reduce(
      (count, result) => count + result.existingEnrollments,
      0,
    ),
    blockedStudents: plan.students.filter((result) => result.action === "blocked").length,
    blockedClasses: plan.classes.filter((result) => result.action === "blocked").length,
    warnings:
      plan.classes.reduce((count, result) => count + result.warnings.length, 0) +
      plan.students.reduce((count, result) => count + result.warnings.length, 0),
    globalErrors: plan.globalErrors,
    classes: plan.classes.map(publicClassResult),
    students: plan.students.map(publicStudentResult),
  };
}

export async function planStudentClassEnrollmentImport(
  store: StudentClassEnrollmentImportStore,
  document: StudentClassEnrollmentImportDocument,
): Promise<StudentClassEnrollmentImportPlan> {
  const globalErrors: string[] = [];
  if (!(await store.programmeExists(document.programmeId))) {
    globalErrors.push(`Programme '${document.programmeId}' does not exist`);
  }

  const classResults: ClassImportResult[] = [];
  const classContext = new Map<
    string,
    { assignment: StudentClassAssignment; result: ClassImportResult; offerings: TargetClassOffering[] }
  >();

  for (const assignment of document.classes) {
    const warnings: string[] = [];
    const blockers = [...globalErrors];
    const cohort = await store.findCohort(document.programmeId, assignment.cohortCode);
    if (!cohort) {
      blockers.push(
        `Cohort '${assignment.cohortCode}' does not exist in programme '${document.programmeId}'`,
      );
    } else if (cohort.status !== "Active") {
      blockers.push(`Cohort '${assignment.cohortCode}' is '${cohort.status}', not Active`);
    }

    const offerings = globalErrors.length
      ? []
      : await store.findTargetOfferings({
          programmeId: document.programmeId,
          term: document.term,
          programmeYear: assignment.programmeYear,
          classCode: assignment.classCode,
        });

    if (offerings.length === 0 && globalErrors.length === 0) {
      blockers.push(
        `No existing Offerings match term '${document.term}', Year ${assignment.programmeYear}, Class '${assignment.classCode}'`,
      );
    }

    for (const offering of offerings) {
      if (offering.course.programmeId !== document.programmeId) {
        blockers.push(
          `Offering '${offering.course.code} / ${offering.sectionCode}' belongs to another programme`,
        );
      }
      if (offering.status === "Completed") {
        blockers.push(
          `Offering '${offering.course.code} / ${offering.sectionCode}' is Completed and cannot receive new enrollments`,
        );
      }
      if (offering.enrollmentCount > offering.capacity) {
        warnings.push(
          `Offering '${offering.course.code} / ${offering.sectionCode}' is already over capacity (${offering.enrollmentCount}/${offering.capacity})`,
        );
      }
    }

    const result: ClassImportResult = {
      cohortCode: assignment.cohortCode,
      programmeYear: assignment.programmeYear,
      classCode: assignment.classCode,
      action: blockers.length > 0 ? "blocked" : "ready",
      targetOfferingCount: offerings.length,
      targetOfferings: offerings.map((offering) => ({
        id: offering.id,
        courseCode: offering.course.code,
        classCode: offering.sectionCode,
        capacity: offering.capacity,
        enrolled: offering.enrollmentCount,
        status: offering.status,
      })),
      warnings,
      blockers,
      ...(cohort ? { cohortId: cohort.id } : {}),
    };

    classResults.push(result);
    const key = `${assignment.cohortCode.toLocaleLowerCase()}|${assignment.programmeYear}|${assignment.classCode.toLocaleLowerCase()}`;
    classContext.set(key, { assignment, result, offerings });
  }

  const studentResults: StudentClassImportResult[] = [];
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

        if (student.status !== "Active") {
          blockers.push(`${identityLabel} is '${student.status}', not Active`);
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

  const capacityRequests = new Map<string, StudentClassImportResult[]>();
  const capacityMetadata = new Map<string, EnrollmentToCreate>();
  for (const result of studentResults) {
    if (result.blockers.length > 0) continue;
    for (const enrollment of result.plannedEnrollments ?? []) {
      const requests = capacityRequests.get(enrollment.offeringId) ?? [];
      requests.push(result);
      capacityRequests.set(enrollment.offeringId, requests);
      capacityMetadata.set(enrollment.offeringId, enrollment);
    }
  }

  for (const [offeringId, requests] of capacityRequests) {
    const metadata = capacityMetadata.get(offeringId)!;
    const projected = metadata.existingEnrollmentCount + requests.length;
    if (projected <= metadata.capacity) continue;

    const message = `Offering '${metadata.courseCode}' would exceed capacity: ${metadata.existingEnrollmentCount} existing + ${requests.length} new = ${projected}/${metadata.capacity}`;
    for (const result of requests) {
      result.blockers.push(message);
      result.action = "blocked";
    }
  }

  return {
    document,
    globalErrors,
    classes: classResults,
    students: studentResults,
  };
}

export async function applyStudentClassEnrollmentImportPlan(
  store: StudentClassEnrollmentImportStore,
  plan: StudentClassEnrollmentImportPlan,
): Promise<void> {
  if (hasBlockers(plan)) {
    throw new StudentClassEnrollmentImportBlockedError(
      summarizeStudentClassEnrollmentImport(plan, "commit"),
    );
  }

  for (const result of plan.students) {
    for (const enrollment of result.plannedEnrollments ?? []) {
      await store.createEnrollment({
        offeringId: enrollment.offeringId,
        studentRecordId: result.studentRecordId!,
      });
    }
  }
}

export async function dryRunStudentClassEnrollmentImport(
  store: StudentClassEnrollmentImportStore,
  document: StudentClassEnrollmentImportDocument,
): Promise<StudentClassEnrollmentImportSummary> {
  const plan = await planStudentClassEnrollmentImport(store, document);
  return summarizeStudentClassEnrollmentImport(plan, "dry-run");
}

export function createPrismaStudentClassEnrollmentImportStore(
  db: Prisma.TransactionClient | PrismaClient,
): StudentClassEnrollmentImportStore {
  return {
    async programmeExists(programmeId) {
      return Boolean(
        await db.programme.findUnique({ where: { id: programmeId }, select: { id: true } }),
      );
    },
    findCohort(programmeId, cohortCode) {
      return db.studentCohort.findUnique({
        where: { programmeId_code: { programmeId, code: cohortCode } },
        select: { id: true, programmeId: true, code: true, status: true },
      });
    },
    findStudentByStudentId(studentId) {
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
    findMembershipsForStudent(studentRecordId) {
      return db.studentCohortMembership.findMany({
        where: { studentId: studentRecordId },
        select: {
          id: true,
          cohortId: true,
          joinedAt: true,
          exitedAt: true,
          cohort: { select: { id: true, code: true, programmeId: true } },
        },
        orderBy: { joinedAt: "asc" },
      });
    },
    async findTargetOfferings(input) {
      const rows = await db.offering.findMany({
        where: {
          term: input.term,
          programmeYear: input.programmeYear,
          sectionCode: input.classCode,
          course: { programmeId: input.programmeId },
        },
        select: {
          id: true,
          term: true,
          programmeYear: true,
          sectionCode: true,
          capacity: true,
          status: true,
          course: { select: { id: true, code: true, programmeId: true } },
          _count: { select: { enrollments: true } },
        },
        orderBy: { course: { code: "asc" } },
      });
      return rows.map(({ _count, ...row }) => ({
        ...row,
        enrollmentCount: _count.enrollments,
      }));
    },
    findEnrollmentsForStudent(studentRecordId, term) {
      return db.enrollment.findMany({
        where: { studentId: studentRecordId, offering: { term } },
        select: {
          offeringId: true,
          offering: {
            select: {
              id: true,
              term: true,
              programmeYear: true,
              sectionCode: true,
              course: { select: { id: true, code: true, programmeId: true } },
            },
          },
        },
      });
    },
    async createEnrollment(input) {
      await db.enrollment.create({
        data: {
          offeringId: input.offeringId,
          studentId: input.studentRecordId,
        },
        select: { id: true },
      });
    },
  };
}

export async function commitStudentClassEnrollmentImport(
  prisma: PrismaClient,
  document: StudentClassEnrollmentImportDocument,
): Promise<StudentClassEnrollmentImportSummary> {
  return prisma.$transaction(
    async (tx) => {
      const store = createPrismaStudentClassEnrollmentImportStore(tx);
      const plan = await planStudentClassEnrollmentImport(store, document);
      if (hasBlockers(plan)) {
        throw new StudentClassEnrollmentImportBlockedError(
          summarizeStudentClassEnrollmentImport(plan, "commit"),
        );
      }
      await applyStudentClassEnrollmentImportPlan(store, plan);
      return summarizeStudentClassEnrollmentImport(plan, "commit");
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      timeout: 30_000,
    },
  );
}

function parseArgs(argv: string[]) {
  const inputPath = argv.find((argument) => !argument.startsWith("--"));
  if (!inputPath) {
    throw new Error(
      "Usage: bun run student-class-enrollment:import <path-to-json> [--commit]. Dry-run is the default.",
    );
  }
  const unknown = argv.filter((argument) => argument.startsWith("--") && argument !== "--commit");
  if (unknown.length > 0) throw new Error(`Unknown option(s): ${unknown.join(", ")}`);
  return { inputPath, commit: argv.includes("--commit") };
}

async function main() {
  const { inputPath, commit } = parseArgs(process.argv.slice(2));
  const raw = JSON.parse(await readFile(inputPath, "utf8")) as unknown;
  const document = parseStudentClassEnrollmentImportDocument(raw);
  const prisma = new PrismaClient();

  try {
    const summary = commit
      ? await commitStudentClassEnrollmentImport(prisma, document)
      : await dryRunStudentClassEnrollmentImport(
          createPrismaStudentClassEnrollmentImportStore(prisma),
          document,
        );
    console.log(JSON.stringify(summary, null, 2));
    if (!commit) {
      console.log("No database changes were made. Review blockers/warnings before --commit.");
    }
  } catch (error) {
    if (error instanceof StudentClassEnrollmentImportBlockedError) {
      console.error(JSON.stringify(error.summary, null, 2));
    }
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
