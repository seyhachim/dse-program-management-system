import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { Prisma, PrismaClient } from "@prisma/client";
import { isStableHttpsProfileImageUrl } from "@dse-pms/shared-types";

const PROGRAMME_ID = "dse";
const SOURCE_KEY = "staff-information:sheet1";

type EvidenceKind = "ResearchInterest" | "Publication" | "ExternalProfile" | "Other";

type ParsedEvidence = {
  kind: EvidenceKind;
  title: string;
  url: string;
  description: string;
  identifier: string;
  startDate: string | null;
  tags: string[];
};

export type StaffInformationRow = {
  sourceRow: number;
  name: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  qualification: string | null;
  profileImageUrl: string | null;
  gender: string | null;
  employmentType: string | null;
  fieldOfSpecialization: string | null;
  shortBio: string | null;
  programmeStartDate: string | null;
  evidence: ParsedEvidence[];
  sourceWarnings: string[];
};

export type StaffInformationImportResult = {
  sourceRow: number;
  email: string | null;
  name: string;
  action: "create" | "update" | "skip" | "conflict" | "manual-review";
  targetUserId: string | null;
  changedFields: string[];
  skippedFields: string[];
  conflicts: string[];
  manualReview: string[];
  evidenceCreated: string[];
  evidenceSkipped: string[];
};

export type StaffInformationImportReport = {
  schemaVersion: "staff-information-import-v1";
  source: string;
  mode: "dry-run" | "commit";
  generatedAt: string;
  summary: {
    total: number;
    create: number;
    update: number;
    skip: number;
    conflict: number;
    manualReview: number;
    evidenceCreated: number;
    evidenceSkipped: number;
  };
  results: StaffInformationImportResult[];
};

type ExistingProfile = {
  gender: string | null;
  employmentType: string | null;
  fieldOfSpecialization: string | null;
  yearsOfExperience: number | null;
  shortBio: string | null;
  programmeStartDate: Date | null;
};

type ExistingUser = {
  id: string;
  name: string;
  email: string;
  title: string | null;
  qualification: string | null;
  phone: string | null;
  profileImageUrl: string | null;
  lecturerProfile: ExistingProfile | null;
};

type ImportStore = {
  findUsersByEmail(email: string): Promise<ExistingUser[]>;
  ensureDependencies(): Promise<{ roleId: string }>;
  createUser(row: StaffInformationRow): Promise<ExistingUser>;
  updateUserMissingFields(user: ExistingUser, row: StaffInformationRow): Promise<{ user: ExistingUser; changed: string[]; skipped: string[]; conflicts: string[] }>;
  fillLecturerProfile(userId: string, row: StaffInformationRow, existing: ExistingProfile | null): Promise<{ changed: string[]; skipped: string[]; conflicts: string[] }>;
  ensureLecturerRole(userId: string, roleId: string): Promise<void>;
  evidenceExists(userId: string, identifier: string): Promise<boolean>;
  createEvidence(userId: string, evidence: ParsedEvidence): Promise<string>;
};

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function text(value: string | undefined): string | null {
  const normalized = value?.trim() ?? "";
  return normalized ? normalized : null;
}

export function inspectPhone(value: string | null): { value: string | null; warning?: string } {
  if (!value) return { value: null };
  const digits = value.replace(/\D/g, "");
  const startsInternational = value.startsWith("+") || digits.startsWith("855");
  const startsLocalZero = digits.startsWith("0");
  if (!startsInternational && !startsLocalZero && (digits.length === 8 || digits.length === 9)) {
    return {
      value: null,
      warning: `Phone '${value}' may have lost a leading zero; it was not imported.`,
    };
  }
  return { value };
}

function splitCsv(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index]!;
    if (quoted) {
      if (char === '"' && content[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows;
}

function evidenceIdentifier(sourceRow: number, kind: EvidenceKind, value: string): string {
  const hash = createHash("sha256").update(`${kind}\u0000${value.trim().toLowerCase()}`).digest("hex").slice(0, 16);
  return `${SOURCE_KEY}:${sourceRow}:${kind.toLowerCase()}:${hash}`;
}

function evidenceFromResearchInterests(sourceRow: number, value: string | null): ParsedEvidence[] {
  if (!value) return [];
  return value
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((interest) => ({
      kind: "ResearchInterest" as const,
      title: interest,
      url: "",
      description: "Imported from Staff Information research interests.",
      identifier: evidenceIdentifier(sourceRow, "ResearchInterest", interest),
      startDate: null,
      tags: ["import:staff-information", `source-row:${sourceRow}`],
    }));
}

function evidenceFromPublications(sourceRow: number, value: string | null, warnings: string[]): ParsedEvidence[] {
  if (!value) return [];
  return value
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const publication = /^publication\s*:/i.test(line);
      const achievement = /^achievement\s*:/i.test(line);
      const title = line.replace(/^(publication|achievement)\s*:\s*/i, "").trim();
      if (!publication && !achievement) {
        warnings.push(`Row ${sourceRow}: Publications/achievements entry needs review because it has no 'Publication:' or 'Achievement:' prefix.`);
      }
      const kind: EvidenceKind = publication ? "Publication" : "Other";
      return {
        kind,
        title,
        url: "",
        description: achievement
          ? "Imported from Staff Information as an achievement."
          : publication
            ? "Imported from Staff Information as a publication."
            : "Imported from Staff Information publications/achievements; type requires review.",
        identifier: evidenceIdentifier(sourceRow, kind, line),
        startDate: null,
        tags: ["import:staff-information", `source-row:${sourceRow}`, "source-column:publications-achievements"],
      };
    });
}

function evidenceFromOnlineResources(sourceRow: number, value: string | null, warnings: string[]): ParsedEvidence[] {
  if (!value) return [];
  return value
    .split(/[\n;]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .flatMap((url) => {
      try {
        const parsed = new URL(url);
        if (!/^https?:$/.test(parsed.protocol)) throw new Error("not http");
      } catch {
        warnings.push(`Row ${sourceRow}: online resource '${url}' is not a valid http(s) URL and was not imported.`);
        return [];
      }
      return [{
        kind: "ExternalProfile" as const,
        title: new URL(url).hostname,
        url,
        description: "Imported from Staff Information online resources.",
        identifier: evidenceIdentifier(sourceRow, "ExternalProfile", url),
        startDate: null,
        tags: ["import:staff-information", `source-row:${sourceRow}`],
      }];
    });
}

function parsePosition(value: string | null): { title: string | null; employmentType: string | null } {
  if (!value) return { title: null, employmentType: null };
  const match = value.match(/^(.+?)\s*\((Full\s*Time|Part\s*Time)\)\s*$/i);
  if (!match) return { title: value, employmentType: null };
  const rawMode = match[2]!.replace(/\s+/g, " ").toLowerCase();
  return {
    title: match[1]!.trim(),
    employmentType: rawMode === "full time" ? "Full Time" : "Part Time",
  };
}

/**
 * Parse the current Staff Information Google Sheet CSV export. The sheet uses a
 * four-row header; actual lecturer data starts at row 5. Fixed columns A-M are
 * intentionally documented here so a future sheet change fails visibly instead
 * of silently remapping staff data.
 */
export function parseStaffInformationCsv(content: string): StaffInformationRow[] {
  const rows = splitCsv(content);
  const parsed: StaffInformationRow[] = [];

  for (let index = 4; index < rows.length; index += 1) {
    const cells = rows[index] ?? [];
    if (!cells.some((cell) => cell.trim())) continue;
    const sourceRow = index + 1;
    const warnings: string[] = [];
    const firstNamePart = text(cells[2]);
    const secondNamePart = text(cells[3]);
    const name = [firstNamePart, secondNamePart].filter(Boolean).join(" ").trim();
    const rawEmail = text(cells[8]);
    const email = rawEmail ? normalizeEmail(rawEmail) : null;
    if (!name) warnings.push(`Row ${sourceRow}: name is missing.`);
    if (!email) warnings.push(`Row ${sourceRow}: email is missing; identity cannot be matched safely.`);
    else if (!/^\S+@\S+\.\S+$/.test(email)) warnings.push(`Row ${sourceRow}: email '${email}' is invalid.`);

    const position = parsePosition(text(cells[5]));
    const rawImage = text(cells[1]);
    const profileImageUrl = rawImage && isStableHttpsProfileImageUrl(rawImage) ? rawImage : null;
    if (rawImage && !profileImageUrl) warnings.push(`Row ${sourceRow}: profile image must be a stable HTTPS URL; image was not imported.`);

    const rawPhone = text(cells[9]);
    const phone = inspectPhone(rawPhone);
    if (phone.warning) warnings.push(`Row ${sourceRow}: ${phone.warning}`);
    const specialization = text(cells[7]);
    const publicationEvidence = evidenceFromPublications(sourceRow, text(cells[10]), warnings);
    const onlineEvidence = evidenceFromOnlineResources(sourceRow, text(cells[12]), warnings);

    parsed.push({
      sourceRow,
      name,
      email: email && /^\S+@\S+\.\S+$/.test(email) ? email : null,
      phone: phone.value,
      title: position.title,
      qualification: text(cells[6]),
      profileImageUrl,
      gender: text(cells[4]),
      employmentType: position.employmentType,
      fieldOfSpecialization: specialization,
      shortBio: text(cells[11]),
      programmeStartDate: null,
      evidence: [
        ...evidenceFromResearchInterests(sourceRow, specialization),
        ...publicationEvidence,
        ...onlineEvidence,
      ],
      sourceWarnings: warnings,
    });
  }

  return parsed;
}

function dateOnly(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

export function classifyEvidencePeriod(
  evidenceDate: string | null,
  programmeStartDate: string | null,
): "prior_to_dse" | "during_dse" | "unclassified" {
  if (!evidenceDate || !programmeStartDate) return "unclassified";
  return evidenceDate < programmeStartDate ? "prior_to_dse" : "during_dse";
}

function compareField(
  field: string,
  existing: string | number | null,
  incoming: string | number | null,
  changed: string[],
  skipped: string[],
  conflicts: string[],
): boolean {
  if (incoming === null || incoming === "") {
    skipped.push(field);
    return false;
  }
  if (existing === null || existing === "") {
    changed.push(field);
    return true;
  }
  if (String(existing).trim() !== String(incoming).trim()) conflicts.push(field);
  else skipped.push(field);
  return false;
}

function profileIncoming(row: StaffInformationRow) {
  return {
    gender: row.gender,
    employmentType: row.employmentType,
    fieldOfSpecialization: row.fieldOfSpecialization,
    shortBio: row.shortBio,
    programmeStartDate: row.programmeStartDate,
  };
}

function dbStore(db: Prisma.TransactionClient | PrismaClient): ImportStore {
  return {
    async findUsersByEmail(email) {
      return db.user.findMany({
        where: { email: { equals: email, mode: "insensitive" } },
        select: {
          id: true,
          name: true,
          email: true,
          title: true,
          qualification: true,
          phone: true,
          profileImageUrl: true,
          lecturerProfile: {
            select: {
              gender: true,
              employmentType: true,
              fieldOfSpecialization: true,
              yearsOfExperience: true,
              shortBio: true,
              programmeStartDate: true,
            },
          },
        },
        take: 2,
      });
    },

    async ensureDependencies() {
      const [role, programme] = await Promise.all([
        db.role.findUnique({ where: { slug: "lecturer" }, select: { id: true } }),
        db.programme.findUnique({ where: { id: PROGRAMME_ID }, select: { id: true } }),
      ]);
      if (!role) throw new Error("Required lecturer role is missing");
      if (!programme) throw new Error(`Required programme '${PROGRAMME_ID}' is missing`);
      return { roleId: role.id };
    },

    async createUser(row) {
      return db.user.create({
        data: {
          name: row.name,
          email: row.email!,
          phone: row.phone,
          title: row.title,
          qualification: row.qualification,
          profileImageUrl: row.profileImageUrl,
        },
        select: {
          id: true,
          name: true,
          email: true,
          title: true,
          qualification: true,
          phone: true,
          profileImageUrl: true,
          lecturerProfile: {
            select: {
              gender: true,
              employmentType: true,
              fieldOfSpecialization: true,
              yearsOfExperience: true,
              shortBio: true,
              programmeStartDate: true,
            },
          },
        },
      });
    },

    async updateUserMissingFields(user, row) {
      const changed: string[] = [];
      const skipped: string[] = [];
      const conflicts: string[] = [];
      const patch: Prisma.UserUpdateInput = {};
      if (compareField("title", user.title, row.title, changed, skipped, conflicts)) patch.title = row.title;
      if (compareField("qualification", user.qualification, row.qualification, changed, skipped, conflicts)) patch.qualification = row.qualification;
      if (compareField("phone", user.phone, row.phone, changed, skipped, conflicts)) patch.phone = row.phone;
      if (compareField("profileImageUrl", user.profileImageUrl, row.profileImageUrl, changed, skipped, conflicts)) patch.profileImageUrl = row.profileImageUrl;
      if (user.name.trim() !== row.name.trim()) conflicts.push("name");
      else skipped.push("name");
      if (Object.keys(patch).length === 0) return { user, changed, skipped, conflicts };
      const updated = await db.user.update({
        where: { id: user.id },
        data: patch,
        select: {
          id: true,
          name: true,
          email: true,
          title: true,
          qualification: true,
          phone: true,
          profileImageUrl: true,
          lecturerProfile: {
            select: {
              gender: true,
              employmentType: true,
              fieldOfSpecialization: true,
              yearsOfExperience: true,
              shortBio: true,
              programmeStartDate: true,
            },
          },
        },
      });
      return { user: updated, changed, skipped, conflicts };
    },

    async fillLecturerProfile(userId, row, existing) {
      const changed: string[] = [];
      const skipped: string[] = [];
      const conflicts: string[] = [];
      const incoming = profileIncoming(row);
      const patch: Prisma.LecturerProfileUpdateInput = {};
      const current = existing ?? {
        gender: null,
        employmentType: null,
        fieldOfSpecialization: null,
        yearsOfExperience: null,
        shortBio: null,
        programmeStartDate: null,
      };
      if (compareField("gender", current.gender, incoming.gender, changed, skipped, conflicts)) patch.gender = incoming.gender;
      if (compareField("employmentType", current.employmentType, incoming.employmentType, changed, skipped, conflicts)) patch.employmentType = incoming.employmentType;
      if (compareField("fieldOfSpecialization", current.fieldOfSpecialization, incoming.fieldOfSpecialization, changed, skipped, conflicts)) patch.fieldOfSpecialization = incoming.fieldOfSpecialization;
      if (compareField("shortBio", current.shortBio, incoming.shortBio, changed, skipped, conflicts)) patch.shortBio = incoming.shortBio;
      if (compareField("programmeStartDate", dateOnly(current.programmeStartDate), incoming.programmeStartDate, changed, skipped, conflicts)) {
        patch.programmeStartDate = incoming.programmeStartDate ? new Date(`${incoming.programmeStartDate}T00:00:00.000Z`) : null;
      }
      if (!existing) {
        await db.lecturerProfile.create({
          data: {
            userId,
            gender: incoming.gender,
            employmentType: incoming.employmentType,
            fieldOfSpecialization: incoming.fieldOfSpecialization,
            shortBio: incoming.shortBio,
            programmeStartDate: incoming.programmeStartDate ? new Date(`${incoming.programmeStartDate}T00:00:00.000Z`) : null,
          },
        });
      } else if (Object.keys(patch).length > 0) {
        await db.lecturerProfile.update({ where: { userId }, data: patch });
      }
      return { changed, skipped, conflicts };
    },

    async ensureLecturerRole(userId, roleId) {
      await db.userRoleAssignment.upsert({
        where: { userId_roleId: { userId, roleId } },
        update: { programmeId: PROGRAMME_ID },
        create: { userId, roleId, programmeId: PROGRAMME_ID },
      });
    },

    async evidenceExists(userId, identifier) {
      const rows = await db.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM lecturer_portfolio."LecturerPortfolioItem"
        WHERE "lecturerId" = ${userId} AND "identifier" = ${identifier}
        LIMIT 1
      `;
      return rows.length > 0;
    },

    async createEvidence(userId, evidence) {
      const id = randomUUID();
      const tags = evidence.tags.length === 0
        ? Prisma.sql`ARRAY[]::text[]`
        : Prisma.sql`ARRAY[${Prisma.join(evidence.tags)}]::text[]`;
      await db.$executeRaw(Prisma.sql`
        INSERT INTO lecturer_portfolio."LecturerPortfolioItem" (
          "id", "lecturerId", "kind", "title", "description", "identifier",
          "url", "startDate", "tags", "isPublic", "isFeatured", "verificationStatus"
        ) VALUES (
          ${id}, ${userId}, ${evidence.kind}::lecturer_portfolio."LecturerPortfolioItemKind",
          ${evidence.title}, ${evidence.description}, ${evidence.identifier}, ${evidence.url},
          ${evidence.startDate ? new Date(`${evidence.startDate}T00:00:00.000Z`) : null},
          ${tags}, false, false,
          'SelfDeclared'::lecturer_portfolio."LecturerPortfolioVerificationStatus"
        )
      `);
      return id;
    },
  };
}

function noWriteStore(store: ImportStore): ImportStore {
  return {
    ...store,
    async createUser(row) {
      return {
        id: `dry-run:${row.sourceRow}`,
        name: row.name,
        email: row.email!,
        title: row.title,
        qualification: row.qualification,
        phone: row.phone,
        profileImageUrl: row.profileImageUrl,
        lecturerProfile: null,
      };
    },
    async updateUserMissingFields(user, row) {
      const changed: string[] = [];
      const skipped: string[] = [];
      const conflicts: string[] = [];
      compareField("title", user.title, row.title, changed, skipped, conflicts);
      compareField("qualification", user.qualification, row.qualification, changed, skipped, conflicts);
      compareField("phone", user.phone, row.phone, changed, skipped, conflicts);
      compareField("profileImageUrl", user.profileImageUrl, row.profileImageUrl, changed, skipped, conflicts);
      if (user.name.trim() !== row.name.trim()) conflicts.push("name");
      else skipped.push("name");
      return { user, changed, skipped, conflicts };
    },
    async fillLecturerProfile(_userId, row, existing) {
      const changed: string[] = [];
      const skipped: string[] = [];
      const conflicts: string[] = [];
      const incoming = profileIncoming(row);
      const current = existing ?? { gender: null, employmentType: null, fieldOfSpecialization: null, yearsOfExperience: null, shortBio: null, programmeStartDate: null };
      compareField("gender", current.gender, incoming.gender, changed, skipped, conflicts);
      compareField("employmentType", current.employmentType, incoming.employmentType, changed, skipped, conflicts);
      compareField("fieldOfSpecialization", current.fieldOfSpecialization, incoming.fieldOfSpecialization, changed, skipped, conflicts);
      compareField("shortBio", current.shortBio, incoming.shortBio, changed, skipped, conflicts);
      compareField("programmeStartDate", dateOnly(current.programmeStartDate), incoming.programmeStartDate, changed, skipped, conflicts);
      return { changed, skipped, conflicts };
    },
    async ensureLecturerRole() {},
    async createEvidence(_userId, evidence) { return `dry-run:${evidence.identifier}`; },
  };
}

export async function importStaffInformation(
  baseStore: ImportStore,
  rows: StaffInformationRow[],
  commit: boolean,
): Promise<StaffInformationImportReport> {
  const store = commit ? baseStore : noWriteStore(baseStore);
  const { roleId } = await baseStore.ensureDependencies();
  const results: StaffInformationImportResult[] = [];

  for (const row of rows) {
    const manualReview = [...row.sourceWarnings];
    if (!row.programmeStartDate) manualReview.push("DSE programme start date is not provided by the source sheet.");
    if (!row.email) {
      results.push({
        sourceRow: row.sourceRow,
        email: null,
        name: row.name,
        action: "manual-review",
        targetUserId: null,
        changedFields: [],
        skippedFields: [],
        conflicts: [],
        manualReview,
        evidenceCreated: [],
        evidenceSkipped: [],
      });
      continue;
    }

    const matches = await baseStore.findUsersByEmail(row.email);
    if (matches.length > 1) {
      results.push({
        sourceRow: row.sourceRow,
        email: row.email,
        name: row.name,
        action: "conflict",
        targetUserId: null,
        changedFields: [],
        skippedFields: [],
        conflicts: ["Multiple PMS users match this email case-insensitively."],
        manualReview,
        evidenceCreated: [],
        evidenceSkipped: [],
      });
      continue;
    }

    const existing = matches[0] ?? null;
    const userChange = existing
      ? await store.updateUserMissingFields(existing, row)
      : { user: await store.createUser(row), changed: ["name", "email", "title", "qualification", "phone", "profileImageUrl"].filter((field) => row[field as keyof StaffInformationRow] != null), skipped: [], conflicts: [] };

    await store.ensureLecturerRole(userChange.user.id, roleId);
    const profileChange = await store.fillLecturerProfile(userChange.user.id, row, existing?.lecturerProfile ?? null);
    const evidenceCreated: string[] = [];
    const evidenceSkipped: string[] = [];
    for (const evidence of row.evidence) {
      if (await baseStore.evidenceExists(userChange.user.id, evidence.identifier)) {
        evidenceSkipped.push(evidence.identifier);
        continue;
      }
      if (commit) await store.createEvidence(userChange.user.id, evidence);
      evidenceCreated.push(evidence.identifier);
    }

    const changedFields = [...userChange.changed, ...profileChange.changed];
    const skippedFields = [...userChange.skipped, ...profileChange.skipped];
    const conflicts = [...userChange.conflicts, ...profileChange.conflicts];
    const action: StaffInformationImportResult["action"] = conflicts.length > 0
      ? "conflict"
      : existing
        ? changedFields.length > 0 || evidenceCreated.length > 0
          ? "update"
          : manualReview.length > 0
            ? "manual-review"
            : "skip"
        : "create";

    results.push({
      sourceRow: row.sourceRow,
      email: row.email,
      name: row.name,
      action,
      targetUserId: commit || existing ? userChange.user.id : null,
      changedFields,
      skippedFields,
      conflicts,
      manualReview,
      evidenceCreated,
      evidenceSkipped,
    });
  }

  const count = (action: StaffInformationImportResult["action"]) => results.filter((result) => result.action === action).length;
  return {
    schemaVersion: "staff-information-import-v1",
    source: "Staff Information / Sheet1",
    mode: commit ? "commit" : "dry-run",
    generatedAt: new Date().toISOString(),
    summary: {
      total: results.length,
      create: count("create"),
      update: count("update"),
      skip: count("skip"),
      conflict: count("conflict"),
      manualReview: count("manual-review") + results.filter((result) => result.action !== "manual-review" && result.manualReview.length > 0).length,
      evidenceCreated: results.reduce((sum, result) => sum + result.evidenceCreated.length, 0),
      evidenceSkipped: results.reduce((sum, result) => sum + result.evidenceSkipped.length, 0),
    },
    results,
  };
}

function parseArgs(argv: string[]) {
  const inputPath = argv.find((arg) => !arg.startsWith("--"));
  if (!inputPath) throw new Error("Usage: bun run staff-information:import <staff-information.csv> [--commit] [--report=report.json]");
  const report = argv.find((arg) => arg.startsWith("--report="))?.slice("--report=".length) ?? null;
  const unknown = argv.filter((arg) => arg.startsWith("--") && arg !== "--commit" && !arg.startsWith("--report="));
  if (unknown.length > 0) throw new Error(`Unknown option(s): ${unknown.join(", ")}`);
  return { inputPath, commit: argv.includes("--commit"), report };
}

async function main() {
  const { inputPath, commit, report } = parseArgs(process.argv.slice(2));
  if (!inputPath.toLowerCase().endsWith(".csv")) throw new Error("Staff Information import expects a CSV export of Sheet1.");
  const rows = parseStaffInformationCsv(await readFile(inputPath, "utf8"));
  if (rows.length === 0) throw new Error("No lecturer rows found. Expected the current four-row Staff Information header and data from row 5.");

  const prisma = new PrismaClient();
  try {
    const result = commit
      ? await prisma.$transaction((tx) => importStaffInformation(dbStore(tx), rows, true), { timeout: 30_000 })
      : await importStaffInformation(dbStore(prisma), rows, false);
    const json = `${JSON.stringify(result, null, 2)}\n`;
    if (report) await writeFile(report, json, "utf8");
    process.stdout.write(json);
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
