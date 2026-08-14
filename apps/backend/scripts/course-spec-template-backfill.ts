import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({
  transactionOptions: { maxWait: 10_000, timeout: 60_000 },
});

type JsonObject = Record<string, unknown>;

type Options = {
  input: string;
  courseCode?: string;
  commit: boolean;
};

function parseArgs(argv: string[]): Options {
  const input = argv.find((arg) => !arg.startsWith("--"));
  if (!input) {
    throw new Error(
      "Usage: bun scripts/course-spec-template-backfill.ts <json-directory> [--course=CODE] [--commit]",
    );
  }
  const courseCode = argv
    .find((arg) => arg.startsWith("--course="))
    ?.slice("--course=".length)
    .trim()
    .toUpperCase();
  return { input, courseCode, commit: argv.includes("--commit") };
}

async function walkJsonFiles(path: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const full = join(path, entry.name);
    if (entry.isDirectory()) out.push(...(await walkJsonFiles(full)));
    else if (entry.isFile() && extname(entry.name).toLowerCase() === ".json") {
      out.push(full);
    }
  }
  return out.sort();
}

function clean(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function numeric(value: unknown): number | null {
  const text = clean(value).replace(/,/g, "");
  if (!/^\d+(?:\.\d+)?$/.test(text)) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function asRows(value: unknown): string[][] | null {
  if (!Array.isArray(value)) return null;
  const rows = value.filter(Array.isArray).map((row) => row.map(clean));
  return rows.length ? rows : null;
}

function collectTables(value: unknown, out: string[][][] = []): string[][][] {
  if (!value || typeof value !== "object") return out;
  if (Array.isArray(value)) {
    const rows = asRows(value);
    if (rows) out.push(rows);
    for (const item of value) collectTables(item, out);
    return out;
  }
  const object = value as JsonObject;
  const rows = asRows(object.rows);
  if (rows) out.push(rows);
  for (const item of Object.values(object)) collectTables(item, out);
  return out;
}

function recoverCloSltHours(doc: JsonObject): Map<string, number> {
  const result = new Map<string, number>();
  for (const rows of collectTables(doc.rawSections)) {
    const text = rows.flat().join(" ").toLowerCase();
    if (
      !text.includes("total hours for student learning time") &&
      !(text.includes("total hours") && text.includes("slt") && text.includes("plo"))
    ) {
      continue;
    }

    for (const row of rows) {
      const clo = row.find((cell) => /^CLO\s*\d+$/i.test(cell));
      if (!clo) continue;
      const values = row
        .filter((cell) => cell !== clo)
        .map(numeric)
        .filter((value): value is number => value != null && value > 0);
      if (!values.length) continue;
      result.set(
        clo.replace(/\s+/g, "").toUpperCase(),
        values.reduce((sum, value) => sum + value, 0),
      );
    }
  }
  return result;
}

type AssessmentSlt = {
  category: "continuous" | "final";
  physical: number | null;
  online: number | null;
  independent: number | null;
  total: number | null;
};

function recoverAssessmentSlt(doc: JsonObject): Map<string, AssessmentSlt> {
  const result = new Map<string, AssessmentSlt>();
  const slt = (doc.studentLearningTime ?? {}) as JsonObject;
  const tables = collectTables(slt.rawTables ?? slt);

  for (const rows of tables) {
    let category: "continuous" | "final" | null = null;
    for (const row of rows) {
      const joined = row.join(" ").toLowerCase();
      if (joined.includes("continuous assessment")) category = "continuous";
      if (joined.includes("final assessment")) category = "final";
      if (!category) continue;

      const name = clean(row[1]);
      const weight = numeric(row[2]);
      if (!name || weight == null) continue;
      result.set(name.toLowerCase(), {
        category,
        physical: numeric(row[3]),
        online: numeric(row[4]),
        independent: numeric(row[5]),
        total: numeric(row[6]),
      });
    }
  }

  return result;
}

type CourseContentSlt = {
  lecture: number | null;
  tutorial: number | null;
  practice: number | null;
  other: number | null;
  independent: number | null;
  total: number | null;
};

function sumNullable(a: number | null, b: number | null): number | null {
  if (a == null && b == null) return null;
  return (a ?? 0) + (b ?? 0);
}

function recoverCourseContentSlt(doc: JsonObject): Map<number, CourseContentSlt> {
  const result = new Map<number, CourseContentSlt>();
  const slt = (doc.studentLearningTime ?? {}) as JsonObject;
  const tables = collectTables(slt.rawTables ?? slt);

  for (const rows of tables) {
    const text = rows.flat().join(" ").toLowerCase();
    if (!text.includes("course content outline") || !text.includes("total slt")) {
      continue;
    }

    for (const row of rows) {
      const topicCell = clean(row[1]);
      const match = topicCell.match(/^Topic\s*(\d+)\s*:/i);
      if (!match) continue;
      const topicNumber = Number(match[1]);
      if (!Number.isInteger(topicNumber) || topicNumber < 1) continue;

      result.set(topicNumber, {
        lecture: sumNullable(numeric(row[3]), numeric(row[7])),
        tutorial: sumNullable(numeric(row[4]), numeric(row[8])),
        practice: sumNullable(numeric(row[5]), numeric(row[9])),
        other: sumNullable(numeric(row[6]), numeric(row[10])),
        independent: numeric(row[11]),
        total: numeric(row[12]),
      });
    }
  }

  return result;
}

function assessmentItems(doc: JsonObject): JsonObject[] {
  return Array.isArray(doc.assessments)
    ? doc.assessments.filter(
        (item): item is JsonObject =>
          !!item && typeof item === "object" && !Array.isArray(item),
      )
    : [];
}

function topicNumberFromTitle(value: string): number | null {
  const match = clean(value).match(/\bTopic\s*(\d+)\s*:/i);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

async function processFile(file: string, options: Options) {
  const doc = JSON.parse(await readFile(file, "utf8")) as JsonObject;
  const course = (doc.course ?? {}) as JsonObject;
  const code = clean(course.code).toUpperCase();
  if (!code || (options.courseCode && code !== options.courseCode)) return null;

  const stored = await prisma.course.findUnique({
    where: { code },
    include: {
      spec: {
        include: {
          clos: { orderBy: { order: "asc" } },
          weeks: { orderBy: { order: "asc" } },
          assessmentItems: { orderBy: { order: "asc" } },
        },
      },
    },
  });
  if (!stored?.spec) {
    return { courseCode: code, action: "skipped", reason: "CourseSpec not found" };
  }

  const cloSlt = recoverCloSltHours(doc);
  const contentSlt = recoverCourseContentSlt(doc);
  const sltByAssessment = recoverAssessmentSlt(doc);
  const sourceAssessments = assessmentItems(doc);

  const updates = stored.spec.assessmentItems.map((item, index) => {
    const source = sourceAssessments[index] ?? {};
    const sourceName = clean(source.name) || item.name;
    const recovered = sltByAssessment.get(sourceName.toLowerCase());
    const topicNumbers = Array.isArray(source.topicNumbers)
      ? source.topicNumbers
          .map(Number)
          .filter((value) => Number.isInteger(value) && value >= 1 && value <= 15)
      : [];
    const sourceTotal = numeric(source.sltHours);

    return {
      id: item.id,
      assessmentCategory: recovered?.category ?? "continuous",
      topicNumbers: [...new Set(topicNumbers)].sort((a, b) => a - b),
      physicalSltHours: recovered?.physical ?? null,
      onlineSltHours: recovered?.online ?? null,
      independentSltHours:
        recovered?.independent ??
        (recovered?.total == null && sourceTotal != null ? sourceTotal : null),
    };
  });

  const cloUpdates = stored.spec.clos.map((clo, index) => ({
    id: clo.id,
    hours: cloSlt.get(`CLO${index + 1}`) ?? null,
  }));

  const weekUpdates = stored.spec.weeks
    .map((week) => {
      const topicNumber = topicNumberFromTitle(week.topic);
      if (topicNumber == null) return null;
      const recovered = contentSlt.get(topicNumber);
      if (!recovered) return null;
      return {
        id: week.id,
        ...recovered,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item != null);

  if (options.commit) {
    await prisma.$transaction(async (tx) => {
      for (const update of updates) {
        await tx.courseSpecAssessmentItem.update({
          where: {
            courseSpecId_id: {
              courseSpecId: stored.spec!.id,
              id: update.id,
            },
          },
          data: {
            assessmentCategory: update.assessmentCategory,
            topicNumbers: update.topicNumbers,
            physicalSltHours: update.physicalSltHours,
            onlineSltHours: update.onlineSltHours,
            independentSltHours: update.independentSltHours,
          },
        });
      }
      for (const update of cloUpdates) {
        if (update.hours == null) continue;
        await tx.courseSpecClo.update({
          where: {
            courseSpecId_id: {
              courseSpecId: stored.spec!.id,
              id: update.id,
            },
          },
          data: { sltHours: Math.round(update.hours) },
        });
      }
      for (const update of weekUpdates) {
        await tx.courseSpecWeek.update({
          where: {
            courseSpecId_id: {
              courseSpecId: stored.spec!.id,
              id: update.id,
            },
          },
          data: {
            lectureHours: update.lecture,
            tutorialHours: update.tutorial,
            practiceHours: update.practice,
            otherHours: update.other,
            selfStudyHours: update.independent,
          },
        });
      }
    });
  }

  return {
    courseCode: code,
    action: options.commit ? "updated" : "ready",
    assessmentCount: updates.length,
    assessmentSltCount: updates.filter(
      (item) =>
        item.physicalSltHours != null ||
        item.onlineSltHours != null ||
        item.independentSltHours != null,
    ).length,
    topicMappedCount: updates.filter((item) => item.topicNumbers.length > 0).length,
    cloSltCount: cloUpdates.filter((item) => item.hours != null).length,
    courseContentMappedCount: weekUpdates.length,
    courseContentSltHours: [...contentSlt.values()].reduce(
      (sum, item) => sum + (item.total ?? 0),
      0,
    ),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const files = await walkJsonFiles(options.input);
  const results = [];
  for (const file of files) {
    if (file.endsWith("schema.json") || file.endsWith("import-report.json")) continue;
    const result = await processFile(file, options);
    if (result) results.push(result);
  }
  console.log(
    JSON.stringify(
      {
        mode: options.commit ? "commit" : "dry-run",
        total: results.length,
        results,
      },
      null,
      2,
    ),
  );
}

main().finally(() => prisma.$disconnect());
