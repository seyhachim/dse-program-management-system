import { readFile } from "node:fs/promises";
import { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const STUDENT_STATUSES = ["Active", "Inactive", "Pending"] as const;
const COHORT_STATUSES = ["Planned", "Active", "Completed", "Archived"] as const;

const NullableText = z.preprocess(
  (value) => {
    if (value === undefined || value === null) return null;
    if (typeof value !== "string") return value;
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  },
  z.string().min(1).nullable(),
);

const NullableStudentId = z.preprocess(
  (value) => {
    if (value === undefined || value === null) return null;
    if (typeof value !== "string") return value;
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  },
  z.string().min(1).nullable(),
);

const NullableEmail = z.preprocess(
  (value) => {
    if (value === undefined || value === null) return null;
    if (typeof value !== "string") return value;
    const normalized = value.trim().toLowerCase();
    return normalized.length > 0 ? normalized : null;
  },
  z.string().email().nullable(),
);

const ProfileSchema = z
  .object({
    khmerFamilyName: NullableText.optional(),
    khmerGivenName: NullableText.optional(),
    latinFamilyName: NullableText.optional(),
    latinGivenName: NullableText.optional(),
    gender: NullableText.optional(),
  })
  .strict();

const CohortSchema = z
  .object({
    code: z.string().trim().min(1),
    name: z.string().trim().min(1),
    intakeYear: z.number().int().min(1900).max(2200),
    expectedGraduationYear: z.number().int().min(1900).max(2200),
    joinedAt: z.string().regex(DATE_ONLY, "joinedAt must be YYYY-MM-DD"),
    status: z.enum(COHORT_STATUSES).default("Active"),
  })
  .strict()
  .refine((value) => value.expectedGraduationYear >= value.intakeYear, {
    message: "expectedGraduationYear must be greater than or equal to intakeYear",
    path: ["expectedGraduationYear"],
  });

const SourceMetadataValue = z.union([z.string(), z.number(), z.boolean(), z.null()]);

const StudentRowSchema = z
  .object({
    sourceRef: z.string().trim().min(1),
    cohortCode: z.string().trim().min(1),
    studentId: NullableStudentId.optional().default(null),
    name: z.string().trim().min(1),
    email: NullableEmail.optional().default(null),
    status: z.enum(STUDENT_STATUSES).default("Active"),
    profile: ProfileSchema.optional(),
    sourceMetadata: z.record(SourceMetadataValue).optional(),
  })
  .strict();

export const StudentRosterImportDocumentSchema = z
  .object({
    schemaVersion: z.literal(1),
    source: z.string().trim().min(1),
    programmeId: z.string().trim().min(1),
    importMode: z.literal("one-time-upsert"),
    cohorts: z.array(CohortSchema).min(1),
    students: z.array(StudentRowSchema).min(1),
  })
  .strict()
  .superRefine((document, ctx) => {
    const cohortCodes = new Set<string>();
    for (const [index, cohort] of document.cohorts.entries()) {
      const key = cohort.code.toLowerCase();
      if (cohortCodes.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate cohort code '${cohort.code}'`,
          path: ["cohorts", index, "code"],
        });
      }
      cohortCodes.add(key);
    }

    const sourceRefs = new Set<string>();
    for (const [index, student] of document.students.entries()) {
      const sourceKey = student.sourceRef.toLowerCase();
      if (sourceRefs.has(sourceKey)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate sourceRef '${student.sourceRef}'`,
          path: ["students", index, "sourceRef"],
        });
      }
      sourceRefs.add(sourceKey);

      if (!cohortCodes.has(student.cohortCode.toLowerCase())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Unknown cohortCode '${student.cohortCode}'`,
          path: ["students", index, "cohortCode"],
        });
      }
    }
  });

export type StudentRosterImportDocument = z.infer<typeof StudentRosterImportDocumentSchema>;
export type StudentRosterImportRow = StudentRosterImportDocument["students"][number];
export type StudentRosterCohort = StudentRosterImportDocument["cohorts"][number];

type ProfileData = {
  khmerFamilyName: string | null;
  khmerGivenName: string | null;
  latinFamilyName: string | null;
  latinGivenName: string | null;
  gender: string | null;
};

export type ExistingRosterStudent = {
  id: string;
  studentId: string;
  name: string;
  email: string | null;
  status: (typeof STUDENT_STATUSES)[number];
  userId: string | null;
  profile: (ProfileData & { id: string }) | null;
};

export type ExistingRosterCohort = {
  id: string;
  programmeId: string;
  code: string;
  name: string;
  intakeYear: number;
  expectedGraduationYear: number;
  status: (typeof COHORT_STATUSES)[number];
};

export type ExistingRosterMembership = {
  id: string;
  cohortId: string;
  joinedAt: Date;
  exitedAt: Date | null;
  cohort: { id: string; code: string; programmeId: string };
};

export type StudentRosterImportStore = {
  programmeExists(programmeId: string): Promise<boolean>;
  findCohort(programmeId: string, code: string): Promise<ExistingRosterCohort | null>;
  findStudentByStudentId(studentId: string): Promise<ExistingRosterStudent | null>;
  findStudentsByEmail(email: string): Promise<ExistingRosterStudent[]>;
  findMembershipsForStudent(studentRecordId: string): Promise<ExistingRosterMembership[]>;
  createCohort(programmeId: string, cohort: StudentRosterCohort): Promise<{ id: string }>;
  createStudent(row: StudentRosterImportRow): Promise<{ id: string }>;
  fillStudentMissingFields(
    studentRecordId: string,
    patch: { email?: string; profile?: Partial<ProfileData> },
  ): Promise<void>;
  createMembership(input: {
    cohortId: string;
    studentRecordId: string;
    joinedAt: string;
    note: string;
  }): Promise<void>;
};

export type CohortImportResult = {
  code: string;
  action: "would_create" | "unchanged" | "blocked";
  warnings: string[];
  blockers: string[];
  existingId?: string;
};

export type StudentImportResult = {
  sourceRef: string;
  cohortCode: string;
  studentId: string | null;
  name: string;
  action: "would_create" | "would_update" | "unchanged" | "blocked";
  warnings: string[];
  blockers: string[];
  existingStudentRecordId?: string;
  emailPatch?: string;
  profilePatch?: Partial<ProfileData>;
  membershipExists?: boolean;
};

export type StudentRosterImportPlan = {
  document: StudentRosterImportDocument;
  globalErrors: string[];
  cohorts: CohortImportResult[];
  students: StudentImportResult[];
};

export type StudentRosterImportSummary = {
  mode: "dry-run" | "commit";
  total: number;
  wouldCreate: number;
  wouldUpdate: number;
  unchanged: number;
  blocked: number;
  cohortsToCreate: number;
  warnings: number;
  globalErrors: string[];
  cohorts: CohortImportResult[];
  students: Array<Omit<StudentImportResult, "existingStudentRecordId" | "emailPatch" | "profilePatch" | "membershipExists">>;
};

export class StudentRosterImportBlockedError extends Error {
  constructor(public readonly summary: StudentRosterImportSummary) {
    super("Student roster import is blocked; no database changes were made");
  }
}

export function parseStudentRosterImportDocument(input: unknown): StudentRosterImportDocument {
  return StudentRosterImportDocumentSchema.parse(input);
}

function normalizedProfile(row: StudentRosterImportRow): ProfileData {
  return {
    khmerFamilyName: row.profile?.khmerFamilyName ?? null,
    khmerGivenName: row.profile?.khmerGivenName ?? null,
    latinFamilyName: row.profile?.latinFamilyName ?? null,
    latinGivenName: row.profile?.latinGivenName ?? null,
    gender: row.profile?.gender ?? null,
  };
}

function comparable(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function sameDate(value: Date, dateOnly: string): boolean {
  return value.toISOString().slice(0, 10) === dateOnly;
}

function hasMembershipOverlap(membership: ExistingRosterMembership, targetStart: string): boolean {
  if (membership.exitedAt === null) return true;
  return membership.exitedAt.toISOString().slice(0, 10) >= targetStart;
}

function duplicates(values: Array<string | null>): Set<string> {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (!value) continue;
    const key = value.toLocaleLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return new Set([...counts.entries()].filter(([, count]) => count > 1).map(([key]) => key));
}

export async function planStudentRosterImport(
  store: StudentRosterImportStore,
  document: StudentRosterImportDocument,
): Promise<StudentRosterImportPlan> {
  const globalErrors: string[] = [];
  if (!(await store.programmeExists(document.programmeId))) {
    globalErrors.push(`Programme '${document.programmeId}' does not exist`);
  }

  const cohortResults: CohortImportResult[] = [];
  const cohortByCode = new Map<string, CohortImportResult>();
  for (const cohort of document.cohorts) {
    const warnings: string[] = [];
    const blockers: string[] = [...globalErrors];
    const existing = await store.findCohort(document.programmeId, cohort.code);
    if (existing) {
      if (comparable(existing.name) !== comparable(cohort.name)) {
        blockers.push(`Existing cohort name '${existing.name}' conflicts with '${cohort.name}'`);
      }
      if (existing.intakeYear !== cohort.intakeYear) {
        blockers.push(`Existing intakeYear ${existing.intakeYear} conflicts with ${cohort.intakeYear}`);
      }
      if (existing.expectedGraduationYear !== cohort.expectedGraduationYear) {
        blockers.push(
          `Existing expectedGraduationYear ${existing.expectedGraduationYear} conflicts with ${cohort.expectedGraduationYear}`,
        );
      }
      if (existing.status !== cohort.status) {
        warnings.push(
          `Existing cohort status '${existing.status}' is preserved instead of source status '${cohort.status}'`,
        );
      }
    }
    const result: CohortImportResult = {
      code: cohort.code,
      action: blockers.length > 0 ? "blocked" : existing ? "unchanged" : "would_create",
      warnings,
      blockers,
      ...(existing ? { existingId: existing.id } : {}),
    };
    cohortResults.push(result);
    cohortByCode.set(cohort.code.toLowerCase(), result);
  }

  const duplicateStudentIds = duplicates(document.students.map((row) => row.studentId));
  const duplicateEmails = duplicates(document.students.map((row) => row.email));
  const studentResults: StudentImportResult[] = [];

  for (const row of document.students) {
    const warnings: string[] = [];
    const blockers: string[] = [...globalErrors];
    const cohortSource = document.cohorts.find(
      (cohort) => cohort.code.toLowerCase() === row.cohortCode.toLowerCase(),
    )!;
    const cohortPlan = cohortByCode.get(row.cohortCode.toLowerCase())!;

    if (cohortPlan.action === "blocked") {
      blockers.push(`Cohort '${row.cohortCode}' is blocked`);
    }
    if (!row.studentId) {
      blockers.push("Official studentId is missing; no synthetic ID will be generated");
    } else if (duplicateStudentIds.has(row.studentId.toLowerCase())) {
      blockers.push(`Duplicate studentId '${row.studentId}' in import source`);
    }
    if (row.email && duplicateEmails.has(row.email.toLowerCase())) {
      blockers.push(`Duplicate email '${row.email}' in import source`);
    }

    let existing: ExistingRosterStudent | null = null;
    let emailPatch: string | undefined;
    let profilePatch: Partial<ProfileData> | undefined;
    let membershipExists = false;

    if (row.studentId) {
      existing = await store.findStudentByStudentId(row.studentId);
      if (row.email) {
        const emailMatches = await store.findStudentsByEmail(row.email);
        if (emailMatches.length > 1) {
          blockers.push(`Database contains multiple case-insensitive matches for email '${row.email}'`);
        } else if (emailMatches[0] && emailMatches[0].studentId !== row.studentId) {
          blockers.push(
            `Email '${row.email}' already belongs to studentId '${emailMatches[0].studentId}'`,
          );
        }
      }

      if (existing) {
        if (comparable(existing.name) !== comparable(row.name)) {
          blockers.push(
            `Existing name '${existing.name}' conflicts with source name '${row.name}' for studentId '${row.studentId}'`,
          );
        }
        if (existing.email && row.email && comparable(existing.email) !== comparable(row.email)) {
          blockers.push(
            `Existing email '${existing.email}' conflicts with source email '${row.email}' for studentId '${row.studentId}'`,
          );
        } else if (!existing.email && row.email) {
          emailPatch = row.email;
        }
        if (existing.status !== row.status) {
          warnings.push(
            `Existing student status '${existing.status}' is preserved instead of source status '${row.status}'`,
          );
        }

        const incomingProfile = normalizedProfile(row);
        const patch: Partial<ProfileData> = {};
        for (const key of Object.keys(incomingProfile) as Array<keyof ProfileData>) {
          const incoming = incomingProfile[key];
          if (incoming === null) continue;
          const current = existing.profile?.[key] ?? null;
          if (current === null) {
            patch[key] = incoming;
          } else if (comparable(current) !== comparable(incoming)) {
            blockers.push(
              `Existing profile ${key} '${current}' conflicts with source value '${incoming}'`,
            );
          }
        }
        if (Object.keys(patch).length > 0) profilePatch = patch;

        const memberships = await store.findMembershipsForStudent(existing.id);
        const exact = memberships.find(
          (membership) =>
            membership.cohort.code.toLowerCase() === row.cohortCode.toLowerCase() &&
            sameDate(membership.joinedAt, cohortSource.joinedAt),
        );
        membershipExists = Boolean(exact);
        if (!exact) {
          const overlap = memberships.find((membership) =>
            hasMembershipOverlap(membership, cohortSource.joinedAt),
          );
          if (overlap) {
            blockers.push(
              `Target membership from ${cohortSource.joinedAt} overlaps existing cohort '${overlap.cohort.code}' membership`,
            );
          }
        }
      }
    }

    const action: StudentImportResult["action"] = blockers.length > 0
      ? "blocked"
      : existing
        ? emailPatch || profilePatch || !membershipExists
          ? "would_update"
          : "unchanged"
        : "would_create";

    studentResults.push({
      sourceRef: row.sourceRef,
      cohortCode: row.cohortCode,
      studentId: row.studentId,
      name: row.name,
      action,
      warnings,
      blockers,
      ...(existing ? { existingStudentRecordId: existing.id } : {}),
      ...(emailPatch ? { emailPatch } : {}),
      ...(profilePatch ? { profilePatch } : {}),
      membershipExists,
    });
  }

  return { document, globalErrors, cohorts: cohortResults, students: studentResults };
}

export function summarizeStudentRosterImport(
  plan: StudentRosterImportPlan,
  mode: "dry-run" | "commit",
): StudentRosterImportSummary {
  return {
    mode,
    total: plan.students.length,
    wouldCreate: plan.students.filter((result) => result.action === "would_create").length,
    wouldUpdate: plan.students.filter((result) => result.action === "would_update").length,
    unchanged: plan.students.filter((result) => result.action === "unchanged").length,
    blocked: plan.students.filter((result) => result.action === "blocked").length,
    cohortsToCreate: plan.cohorts.filter((result) => result.action === "would_create").length,
    warnings:
      plan.cohorts.reduce((count, result) => count + result.warnings.length, 0) +
      plan.students.reduce((count, result) => count + result.warnings.length, 0),
    globalErrors: plan.globalErrors,
    cohorts: plan.cohorts,
    students: plan.students.map(
      ({ existingStudentRecordId: _id, emailPatch: _email, profilePatch: _profile, membershipExists: _membership, ...publicResult }) =>
        publicResult,
    ),
  };
}

function hasBlockers(plan: StudentRosterImportPlan): boolean {
  return (
    plan.globalErrors.length > 0 ||
    plan.cohorts.some((result) => result.action === "blocked") ||
    plan.students.some((result) => result.action === "blocked")
  );
}

export async function applyStudentRosterImportPlan(
  store: StudentRosterImportStore,
  plan: StudentRosterImportPlan,
): Promise<void> {
  if (hasBlockers(plan)) {
    throw new StudentRosterImportBlockedError(summarizeStudentRosterImport(plan, "commit"));
  }

  const cohortIds = new Map<string, string>();
  for (const cohort of plan.document.cohorts) {
    const result = plan.cohorts.find((candidate) => candidate.code === cohort.code)!;
    if (result.existingId) {
      cohortIds.set(cohort.code.toLowerCase(), result.existingId);
    } else {
      const created = await store.createCohort(plan.document.programmeId, cohort);
      cohortIds.set(cohort.code.toLowerCase(), created.id);
    }
  }

  for (const row of plan.document.students) {
    const result = plan.students.find((candidate) => candidate.sourceRef === row.sourceRef)!;
    const studentRecordId = result.existingStudentRecordId
      ? result.existingStudentRecordId
      : (await store.createStudent(row)).id;

    if (result.existingStudentRecordId && (result.emailPatch || result.profilePatch)) {
      await store.fillStudentMissingFields(studentRecordId, {
        ...(result.emailPatch ? { email: result.emailPatch } : {}),
        ...(result.profilePatch ? { profile: result.profilePatch } : {}),
      });
    }

    if (!result.membershipExists) {
      const cohort = plan.document.cohorts.find(
        (candidate) => candidate.code.toLowerCase() === row.cohortCode.toLowerCase(),
      )!;
      await store.createMembership({
        cohortId: cohortIds.get(row.cohortCode.toLowerCase())!,
        studentRecordId,
        joinedAt: cohort.joinedAt,
        note: `Roster import: ${plan.document.source}; ${row.sourceRef}`,
      });
    }
  }
}

export async function dryRunStudentRosterImport(
  store: StudentRosterImportStore,
  document: StudentRosterImportDocument,
): Promise<StudentRosterImportSummary> {
  const plan = await planStudentRosterImport(store, document);
  return summarizeStudentRosterImport(plan, "dry-run");
}

function asDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export function createPrismaStudentRosterImportStore(
  db: Prisma.TransactionClient | PrismaClient,
): StudentRosterImportStore {
  const includeProfile = { profile: true } as const;
  return {
    async programmeExists(programmeId) {
      return Boolean(await db.programme.findUnique({ where: { id: programmeId }, select: { id: true } }));
    },
    findCohort(programmeId, code) {
      return db.studentCohort.findUnique({ where: { programmeId_code: { programmeId, code } } });
    },
    findStudentByStudentId(studentId) {
      return db.student.findUnique({ where: { studentId }, include: includeProfile });
    },
    findStudentsByEmail(email) {
      return db.student.findMany({
        where: { email: { equals: email, mode: "insensitive" } },
        include: includeProfile,
        take: 2,
      });
    },
    findMembershipsForStudent(studentRecordId) {
      return db.studentCohortMembership.findMany({
        where: { studentId: studentRecordId },
        include: { cohort: { select: { id: true, code: true, programmeId: true } } },
        orderBy: { joinedAt: "asc" },
      });
    },
    createCohort(programmeId, cohort) {
      return db.studentCohort.create({
        data: {
          programmeId,
          code: cohort.code,
          name: cohort.name,
          intakeYear: cohort.intakeYear,
          expectedGraduationYear: cohort.expectedGraduationYear,
          status: cohort.status,
        },
        select: { id: true },
      });
    },
    createStudent(row) {
      const profile = normalizedProfile(row);
      const hasProfile = Object.values(profile).some((value) => value !== null);
      return db.student.create({
        data: {
          studentId: row.studentId!,
          name: row.name,
          email: row.email,
          status: row.status,
          ...(hasProfile ? { profile: { create: profile } } : {}),
        },
        select: { id: true },
      });
    },
    async fillStudentMissingFields(studentRecordId, patch) {
      await db.student.update({
        where: { id: studentRecordId },
        data: {
          ...(patch.email ? { email: patch.email } : {}),
          ...(patch.profile
            ? {
                profile: {
                  upsert: {
                    create: patch.profile,
                    update: patch.profile,
                  },
                },
              }
            : {}),
        },
      });
    },
    async createMembership(input) {
      await db.studentCohortMembership.create({
        data: {
          cohortId: input.cohortId,
          studentId: input.studentRecordId,
          joinedAt: asDate(input.joinedAt),
          note: input.note,
        },
      });
    },
  };
}

export async function commitStudentRosterImport(
  prisma: PrismaClient,
  document: StudentRosterImportDocument,
): Promise<StudentRosterImportSummary> {
  return prisma.$transaction(
    async (tx) => {
      const store = createPrismaStudentRosterImportStore(tx);
      const plan = await planStudentRosterImport(store, document);
      if (hasBlockers(plan)) {
        throw new StudentRosterImportBlockedError(summarizeStudentRosterImport(plan, "commit"));
      }
      await applyStudentRosterImportPlan(store, plan);
      return summarizeStudentRosterImport(plan, "commit");
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
      "Usage: bun run student-roster:import <path-to-json> [--commit]. Dry-run is the default.",
    );
  }
  const unknown = argv.filter((argument) => argument.startsWith("--") && argument !== "--commit");
  if (unknown.length > 0) throw new Error(`Unknown option(s): ${unknown.join(", ")}`);
  return { inputPath, commit: argv.includes("--commit") };
}

async function main() {
  const { inputPath, commit } = parseArgs(process.argv.slice(2));
  const raw = JSON.parse(await readFile(inputPath, "utf8")) as unknown;
  const document = parseStudentRosterImportDocument(raw);
  const prisma = new PrismaClient();
  try {
    const summary = commit
      ? await commitStudentRosterImport(prisma, document)
      : await dryRunStudentRosterImport(createPrismaStudentRosterImportStore(prisma), document);
    console.log(JSON.stringify(summary, null, 2));
    if (!commit) console.log("No database changes were made. Review blockers/warnings before --commit.");
  } catch (error) {
    if (error instanceof StudentRosterImportBlockedError) {
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
