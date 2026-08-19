import { readFile } from "node:fs/promises";
import { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";

const DEFAULT_PROGRAMME_ID = "dse";

const NullableText = z.string().trim().min(1).nullable().optional();

export const LecturerProfileImportDocumentSchema = z
  .object({
    schemaVersion: z.literal(1),
    source: z.string().trim().min(1),
    programme: z.string().trim().min(1),
    importMode: z.literal("one-time-upsert"),
    identityKey: z.literal("email"),
    notes: z.array(z.string()).optional(),
    lecturers: z
      .array(
        z
          .object({
            sourceRow: z.number().int().positive().optional(),
            name: z.string().trim().min(1),
            email: z.string().trim().email(),
            phone: NullableText,
            title: NullableText,
            qualification: NullableText,
            staffProfile: z
              .object({
                gender: NullableText,
                employmentType: NullableText,
                fieldOfSpecialization: NullableText,
                yearsOfExperience: z.number().int().min(0).max(80).nullable().optional(),
                coursesTaught: NullableText,
              })
              .strict(),
            role: z.literal("lecturer").optional(),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

export type LecturerProfileImportDocument = z.infer<typeof LecturerProfileImportDocumentSchema>;
export type LecturerImportRow = LecturerProfileImportDocument["lecturers"][number];

export type ExistingUser = {
  id: string;
  email: string;
  name: string;
  title: string | null;
  qualification: string | null;
  phone: string | null;
};

export type LecturerImportStore = {
  findUsersByEmail(email: string): Promise<ExistingUser[]>;
  ensureDependencies(): Promise<{ roleId: string; programmeId: string }>;
  createUser(data: {
    email: string;
    name: string;
    title: string | null;
    qualification: string | null;
    phone: string | null;
  }): Promise<ExistingUser>;
  fillMissingUserFields(
    id: string,
    data: { title?: string; qualification?: string; phone?: string },
  ): Promise<ExistingUser>;
  upsertLecturerRole(userId: string, roleId: string, programmeId: string): Promise<void>;
  upsertLecturerProfile(
    userId: string,
    data: {
      gender: string | null;
      employmentType: string | null;
      fieldOfSpecialization: string | null;
      yearsOfExperience: number | null;
      legacyCoursesTaught: string | null;
    },
  ): Promise<void>;
};

export type LecturerImportResult = {
  sourceRow?: number;
  email: string;
  name: string;
  action: "would_create" | "would_update" | "created" | "updated";
  warnings: string[];
};

export type LecturerImportSummary = {
  mode: "dry-run" | "commit";
  total: number;
  createCount: number;
  updateCount: number;
  warningCount: number;
  results: LecturerImportResult[];
};

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function nullableText(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

/**
 * Excel often strips a leading zero when a phone cell is numeric. We never guess
 * that zero. A bare 8-9 digit local-looking number with no 0/+ prefix is treated
 * as ambiguous and omitted from User.phone until the source JSON is corrected.
 */
export function inspectPhone(phone: string | null | undefined): {
  value: string | null;
  warning?: string;
} {
  const value = nullableText(phone);
  if (!value) return { value: null };

  const digits = value.replace(/\D/g, "");
  const startsInternational = value.startsWith("+") || digits.startsWith("855");
  const startsLocalZero = digits.startsWith("0");
  const looksLikeLostLeadingZero =
    !startsInternational && !startsLocalZero && (digits.length === 8 || digits.length === 9);

  if (looksLikeLostLeadingZero) {
    return {
      value: null,
      warning: `Phone '${value}' may have lost a leading zero in Excel; phone was not imported. Correct the JSON manually and rerun if confirmed.`,
    };
  }

  return { value };
}

export function parseLecturerImportDocument(input: unknown): LecturerProfileImportDocument {
  const parsed = LecturerProfileImportDocumentSchema.parse(input);
  const seen = new Map<string, number>();

  for (const [index, lecturer] of parsed.lecturers.entries()) {
    const normalized = normalizeEmail(lecturer.email);
    const previous = seen.get(normalized);
    if (previous !== undefined) {
      throw new Error(
        `Duplicate lecturer email '${normalized}' at rows ${previous + 1} and ${index + 1}`,
      );
    }
    seen.set(normalized, index);
  }

  return {
    ...parsed,
    lecturers: parsed.lecturers.map((lecturer) => ({
      ...lecturer,
      email: normalizeEmail(lecturer.email),
    })),
  };
}

function profileData(row: LecturerImportRow) {
  return {
    gender: nullableText(row.staffProfile.gender),
    employmentType: nullableText(row.staffProfile.employmentType),
    fieldOfSpecialization: nullableText(row.staffProfile.fieldOfSpecialization),
    yearsOfExperience: row.staffProfile.yearsOfExperience ?? null,
    legacyCoursesTaught: nullableText(row.staffProfile.coursesTaught),
  };
}

function missingUserFieldPatch(existing: ExistingUser, row: LecturerImportRow, safePhone: string | null) {
  return {
    ...(existing.title || !row.title ? {} : { title: row.title }),
    ...(existing.qualification || !row.qualification ? {} : { qualification: row.qualification }),
    ...(existing.phone || !safePhone ? {} : { phone: safePhone }),
  };
}

export async function importLecturerProfiles(
  store: LecturerImportStore,
  document: LecturerProfileImportDocument,
  commit: boolean,
): Promise<LecturerImportSummary> {
  const { roleId, programmeId } = await store.ensureDependencies();
  const results: LecturerImportResult[] = [];

  for (const row of document.lecturers) {
    const email = normalizeEmail(row.email);
    const matches = await store.findUsersByEmail(email);
    if (matches.length > 1) {
      throw new Error(
        `Database contains multiple users matching '${email}' case-insensitively; resolve duplicates before importing.`,
      );
    }

    const existing = matches[0] ?? null;
    const phone = inspectPhone(row.phone);
    const warnings = phone.warning ? [phone.warning] : [];
    const action = existing
      ? commit
        ? "updated"
        : "would_update"
      : commit
        ? "created"
        : "would_create";

    if (commit) {
      const user = existing
        ? await store.fillMissingUserFields(existing.id, missingUserFieldPatch(existing, row, phone.value))
        : await store.createUser({
            email,
            name: row.name.trim(),
            title: nullableText(row.title),
            qualification: nullableText(row.qualification),
            phone: phone.value,
          });

      await store.upsertLecturerRole(user.id, roleId, programmeId);
      await store.upsertLecturerProfile(user.id, profileData(row));
    }

    results.push({
      sourceRow: row.sourceRow,
      email,
      name: row.name,
      action,
      warnings,
    });
  }

  return {
    mode: commit ? "commit" : "dry-run",
    total: results.length,
    createCount: results.filter((result) => result.action.endsWith("create") || result.action === "created").length,
    updateCount: results.filter((result) => result.action.endsWith("update") || result.action === "updated").length,
    warningCount: results.reduce((count, result) => count + result.warnings.length, 0),
    results,
  };
}

function createPrismaStore(db: Prisma.TransactionClient | PrismaClient): LecturerImportStore {
  return {
    async findUsersByEmail(email) {
      return db.user.findMany({
        where: { email: { equals: email, mode: "insensitive" } },
        select: {
          id: true,
          email: true,
          name: true,
          title: true,
          qualification: true,
          phone: true,
        },
        take: 2,
      });
    },

    async ensureDependencies() {
      const [role, programme] = await Promise.all([
        db.role.findUnique({ where: { slug: "lecturer" }, select: { id: true } }),
        db.programme.findUnique({ where: { id: DEFAULT_PROGRAMME_ID }, select: { id: true } }),
      ]);
      if (!role) throw new Error("Required role 'lecturer' does not exist");
      if (!programme) throw new Error(`Required programme '${DEFAULT_PROGRAMME_ID}' does not exist`);
      return { roleId: role.id, programmeId: programme.id };
    },

    async createUser(data) {
      return db.user.create({
        data,
        select: {
          id: true,
          email: true,
          name: true,
          title: true,
          qualification: true,
          phone: true,
        },
      });
    },

    async fillMissingUserFields(id, data) {
      if (Object.keys(data).length === 0) {
        return db.user.findUniqueOrThrow({
          where: { id },
          select: {
            id: true,
            email: true,
            name: true,
            title: true,
            qualification: true,
            phone: true,
          },
        });
      }
      return db.user.update({
        where: { id },
        data,
        select: {
          id: true,
          email: true,
          name: true,
          title: true,
          qualification: true,
          phone: true,
        },
      });
    },

    async upsertLecturerRole(userId, roleId, programmeId) {
      await db.userRoleAssignment.upsert({
        where: { userId_roleId: { userId, roleId } },
        update: { programmeId },
        create: { userId, roleId, programmeId },
      });
    },

    async upsertLecturerProfile(userId, data) {
      await db.lecturerProfile.upsert({
        where: { userId },
        update: data,
        create: { userId, ...data },
      });
    },
  };
}

function parseArgs(argv: string[]) {
  const inputPath = argv.find((arg) => !arg.startsWith("--"));
  if (!inputPath) {
    throw new Error(
      "Usage: bun run lecturer-profile:import <path-to-json> [--commit]. Dry-run is the default.",
    );
  }
  const unknownFlags = argv.filter((arg) => arg.startsWith("--") && arg !== "--commit");
  if (unknownFlags.length > 0) throw new Error(`Unknown option(s): ${unknownFlags.join(", ")}`);
  return { inputPath, commit: argv.includes("--commit") };
}

function printSummary(summary: LecturerImportSummary) {
  console.log(`Lecturer profile import (${summary.mode})`);
  for (const result of summary.results) {
    console.log(`- ${result.action}: ${result.email} (${result.name})`);
    for (const warning of result.warnings) console.warn(`  WARNING: ${warning}`);
  }
  console.log(
    `Total ${summary.total}; create ${summary.createCount}; update ${summary.updateCount}; warnings ${summary.warningCount}`,
  );
  if (summary.mode === "dry-run") {
    console.log("No database changes were made. Rerun with --commit after reviewing this output.");
  }
}

async function main() {
  const { inputPath, commit } = parseArgs(process.argv.slice(2));
  const raw = JSON.parse(await readFile(inputPath, "utf8")) as unknown;
  const document = parseLecturerImportDocument(raw);

  if (document.programme.trim().toLowerCase() !== "dse") {
    throw new Error(`This one-time importer only supports programme DSE; received '${document.programme}'`);
  }

  const prisma = new PrismaClient();
  try {
    const summary = commit
      ? await prisma.$transaction(
          (tx) => importLecturerProfiles(createPrismaStore(tx), document, true),
          { timeout: 30_000 },
        )
      : await importLecturerProfiles(createPrismaStore(prisma), document, false);
    printSummary(summary);
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
