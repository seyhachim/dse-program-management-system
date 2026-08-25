import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { DEFAULT_PROGRAMME_ID } from "../src/core/programme.ts";
import {
  courseInfoSnapshotFromDocument,
  courseInfoSnapshotWarnings,
} from "./course-spec-import-course-info.ts";
import { ensureCourseForCourseSpecImport } from "./course-spec-import-course.ts";

const prisma = new PrismaClient();

const ValidationSchema = z.object({
  status: z.string().default("valid"),
  warnings: z.array(z.union([z.string(), z.record(z.unknown())])).default([]),
  errors: z.array(z.union([z.string(), z.record(z.unknown())])).default([]),
});

const CanonicalCourseSchema = z
  .object({
    schemaVersion: z.literal("dse-course-spec-import-v1"),
    source: z.object({
      fileName: z.string(),
      relativePath: z.string().optional(),
      sha256: z.string().optional(),
      yearFolder: z.number().nullable().optional(),
      semesterFolder: z.number().nullable().optional(),
    }),
    course: z
      .object({
        programmeTitle: z.string().nullable().optional(),
        code: z.string().min(1),
        title: z.string().min(1),
        credits: z
          .object({ total: z.number().nullable().optional() })
          .passthrough()
          .optional(),
        prerequisites: z.string().nullable().optional(),
        courseType: z.string().nullable().optional(),
        availability: z
          .object({
            semester: z.number().nullable().optional(),
            year: z.number().nullable().optional(),
          })
          .passthrough()
          .optional(),
        description: z.string().nullable().optional(),
      })
      .passthrough(),
    lecturers: z
      .object({
        primary: z
          .object({
            name: z.string().default(""),
            title: z.string().nullable().optional(),
            qualification: z.string().nullable().optional(),
            email: z.string().nullable().optional(),
            phone: z.string().nullable().optional(),
          })
          .passthrough(),
        coLecturers: z.array(z.string()).default([]),
      })
      .passthrough(),
    clos: z
      .array(
        z
          .object({
            code: z.string(),
            description: z.string().min(1),
            mappedPlos: z.array(z.string()).default([]),
            level: z.string().nullable().optional(),
            status: z.string().default("active"),
            teachingMethodsRaw: z.string().nullable().optional(),
            assessmentMethodsRaw: z.string().nullable().optional(),
          })
          .passthrough(),
      )
      .default([]),
    studentLearningTime: z
      .object({
        contentRows: z.array(z.array(z.string())).default([]),
        continuousAssessmentRows: z.array(z.array(z.string())).default([]),
      })
      .passthrough()
      .optional(),
    assessments: z
      .array(
        z
          .object({
            clo: z.string().nullable().optional(),
            plos: z.array(z.string()).default([]),
            name: z.string().min(1),
            mode: z.string().default("individual"),
            weightPercent: z.number().nullable().optional(),
          })
          .passthrough(),
      )
      .default([]),
    lessonPlan: z
      .object({
        topics: z
          .array(
            z
              .object({
                number: z.number().nullable().optional(),
                title: z.string().default(""),
                clos: z.array(z.string()).default([]),
                llosRaw: z.string().default(""),
              })
              .passthrough(),
          )
          .default([]),
        weeks: z
          .array(
            z
              .object({
                week: z.number(),
                hoursRaw: z.string().default(""),
                lectureTopic: z.string().default(""),
                clos: z.array(z.string()).default([]),
                teachingMethodsRaw: z.string().default(""),
                activeLearningRaw: z.string().default(""),
                assessmentRaw: z.string().default(""),
                resourcesRaw: z.string().default(""),
              })
              .passthrough(),
          )
          .default([]),
      })
      .passthrough()
      .optional(),
    resources: z
      .object({
        requiredResourcesRaw: z.string().default(""),
        references: z
          .object({
            required: z.array(z.record(z.unknown())).default([]),
            recommended: z.array(z.record(z.unknown())).default([]),
          })
          .passthrough()
          .optional(),
      })
      .passthrough()
      .optional(),
    studentResponsibilitiesRaw: z.string().nullable().optional(),
    coursePolicyRaw: z.string().nullable().optional(),
    validation: ValidationSchema.default({
      status: "valid",
      warnings: [],
      errors: [],
    }),
  })
  .passthrough();

type CanonicalCourse = z.infer<typeof CanonicalCourseSchema>;
type Tx = Prisma.TransactionClient;

type CliOptions = {
  input: string;
  commit: boolean;
  replaceExisting: boolean;
  allowWarnings: boolean;
  courseCode?: string;
  reportPath?: string;
};

type ImportResult = {
  file: string;
  courseCode: string;
  action: "ready" | "created" | "replaced" | "skipped" | "blocked" | "failed";
  warnings: string[];
  error?: string;
};

const ACTIVE_LEARNING_ALIASES: Array<[RegExp, string]> = [
  [/think[–-]?pair[–-]?share/i, "think-pair-share"],
  [/group discussion|discussion in groups?/i, "group-discussion"],
  [/peer instruction/i, "peer-instruction"],
  [/jigsaw/i, "jigsaw"],
  [/team problem|group problem/i, "team-problem-solving"],
  [/problem[- ]based/i, "problem-based-learning"],
  [/case[- ]based|case study/i, "case-based-learning"],
  [/inquiry/i, "inquiry-activity"],
  [/data investigation|data exploration/i, "data-investigation"],
  [/hands[- ]on|lab exercise/i, "hands-on-lab"],
  [/coding|code exercise/i, "coding-exercise"],
  [/project[- ]based|project work/i, "project-based-learning"],
  [/prototype|build task/i, "prototype-build"],
  [/peer review/i, "peer-review"],
  [/minute paper/i, "minute-paper"],
  [/reflection/i, "reflection"],
  [/self[- ]assessment/i, "self-assessment"],
  [/presentation/i, "presentation"],
  [/debate/i, "debate"],
  [/\bdemo(nstration)?\b/i, "demo"],
  [/poster/i, "poster-sharing"],
];

const TEACHING_METHOD_ALIASES: Array<[RegExp, string]> = [
  [/\blecture\b/i, "Lecture"],
  [/guided.*lab|guided.*hands/i, "Guided Hands-on Lab"],
  [/\bdemo(nstration)?\b/i, "Demonstration"],
  [/lab[- ]based|\blab\b/i, "Lab-based Learning"],
  [/step[- ]by[- ]step.*cod/i, "Step-by-step Coding"],
  [/scaffold/i, "Scaffolded Exercises"],
  [/tutor/i, "Tutoring"],
  [/practice/i, "Practice"],
  [/case stud/i, "Case Study"],
  [/seminar/i, "Seminar"],
  [/team[- ]based/i, "Team-based Learning"],
  [/project[- ]based/i, "Project-Based Learning"],
  [/presentation/i, "Presentation"],
  [/flipped/i, "Flipped Classroom"],
  [/group discussion|discussion/i, "Group Discussion"],
];

const ASSESSMENT_METHOD_ALIASES: Array<[RegExp, string]> = [
  [/assignment/i, "Assignment"],
  [/mid[- ]?term.*quiz/i, "Mid-term Quiz"],
  [/final exam/i, "Final Exam"],
  [/\bquiz/i, "Quiz"],
  [/lab report/i, "Lab Report"],
  [/project/i, "Project"],
  [/presentation.*defen|defen.*presentation/i, "Presentation & Defence"],
  [/peer review/i, "Peer Review"],
  [/reflection/i, "Reflection Journal"],
];

function parseArgs(argv: string[]): CliOptions {
  const positional = argv.filter((a) => !a.startsWith("--"));
  const input = positional[0];
  if (!input) {
    throw new Error(
      "Usage: bun run course-spec:import <json-directory> [--commit] [--replace-existing] [--allow-warnings] [--course=CODE] [--report=path]",
    );
  }
  const value = (name: string) =>
    argv.find((a) => a.startsWith(`${name}=`))?.slice(name.length + 1);
  return {
    input,
    commit: argv.includes("--commit"),
    replaceExisting: argv.includes("--replace-existing"),
    allowWarnings: argv.includes("--allow-warnings"),
    courseCode: value("--course")?.toUpperCase(),
    reportPath: value("--report"),
  };
}

async function walkJsonFiles(path: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const full = join(path, entry.name);
    if (entry.isDirectory()) out.push(...(await walkJsonFiles(full)));
    else if (entry.isFile() && extname(entry.name).toLowerCase() === ".json")
      out.push(full);
  }
  return out.sort();
}

function stableId(...parts: Array<string | number>): string {
  return createHash("sha256")
    .update(parts.join("|"))
    .digest("hex")
    .slice(0, 32);
}

function cleanText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeName(value: string): string {
  return cleanText(value)
    .toLowerCase()
    .replace(/\b(prof|dr|mr|mrs|ms)\.?\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function warningText(value: string | Record<string, unknown>): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

function aliasesFromRaw(raw: string, aliases: Array<[RegExp, string]>): string[] {
  const found = aliases.filter(([rx]) => rx.test(raw)).map(([, name]) => name);
  return [...new Set(found)];
}

function activeLearningFromRaw(raw: string): string[] {
  return [...new Set(ACTIVE_LEARNING_ALIASES.filter(([rx]) => rx.test(raw)).map(([, id]) => id))];
}

function assessmentType(name: string): "Assignment" | "Quiz" | "Exam" | "Lab" | "Project" | "Presentation" | "Report" | "Peer Evaluation" | "Participation" {
  const v = name.toLowerCase();
  if (v.includes("quiz")) return "Quiz";
  if (v.includes("exam") || v.includes("midterm") || v.includes("mid-term")) return "Exam";
  if (v.includes("lab")) return "Lab";
  if (v.includes("project")) return "Project";
  if (v.includes("presentation") || v.includes("defence") || v.includes("defense")) return "Presentation";
  if (v.includes("report")) return "Report";
  if (v.includes("peer")) return "Peer Evaluation";
  if (v.includes("participation")) return "Participation";
  return "Assignment";
}

function prismaCourseType(value?: string | null): "Basic" | "Core" | "Elective" | "Specialization" | "MoeysHeip" | null {
  const v = cleanText(value).toLowerCase();
  if (!v) return null;
  if (v.includes("basic")) return "Basic";
  if (v.includes("core")) return "Core";
  if (v.includes("elective")) return "Elective";
  if (v.includes("special")) return "Specialization";
  if (v.includes("moeys") || v.includes("heip")) return "MoeysHeip";
  return null;
}

function grandTotalSlt(doc: CanonicalCourse): number | null {
  for (const row of doc.studentLearningTime?.continuousAssessmentRows ?? []) {
    if (cleanText(row[0]).toLowerCase() === "grand total slt") {
      const n = Number(row.findLast((cell) => /^\d+(\.\d+)?$/.test(cleanText(cell))));
      return Number.isFinite(n) ? Math.round(n) : null;
    }
  }
  return null;
}

function selfStudyByWeek(doc: CanonicalCourse): Map<number, number> {
  const result = new Map<number, number>();
  for (const row of doc.studentLearningTime?.contentRows ?? []) {
    const week = Number(cleanText(row[0]));
    if (!Number.isInteger(week) || week < 1) continue;
    const numbers = row.slice(3).map((c) => Number(cleanText(c))).filter(Number.isFinite);
    if (numbers.length >= 2) result.set(week, numbers[numbers.length - 2]!);
  }
  return result;
}

function parseContactHours(raw: string): [number | null, number | null, number | null, number | null] {
  const parts = raw.split("/").map((p) => Number(cleanText(p)));
  return [0, 1, 2, 3].map((i) => Number.isFinite(parts[i]) ? parts[i]! : null) as [number | null, number | null, number | null, number | null];
}

function llosFromRaw(raw: string, courseCode: string, topicIndex: number) {
  const matches = [...raw.matchAll(/LLO\s*\d+\s*:\s*([\s\S]*?)(?=\s+LLO\s*\d+\s*:|$)/gi)];
  return matches.map((m, i) => ({ id: stableId(courseCode, "llo", topicIndex, i), description: cleanText(m[1]) }));
}

function splitResponsibilities(raw?: string | null): string[] {
  const value = cleanText(raw);
  if (!value) return [];
  const bullets = value.split(/(?:^|\s)[•\-–]\s+/).map(cleanText).filter(Boolean);
  if (bullets.length > 1) return bullets;
  return value.split(/(?<=[.!?])\s+(?=[A-Z])/).map(cleanText).filter((x) => x.length > 8);
}

function parsePolicy(raw?: string | null) {
  const text = cleanText(raw);
  const labels: Array<[keyof ReturnType<typeof emptyPolicy>, RegExp]> = [
    ["attendancePreparation", /Attendance\s*&?\s*Preparation/i],
    ["academicIntegrity", /Academic Integrity/i],
    ["assignmentsLateSubmission", /Homework\s*&?\s*Assignments|Assignments?\s*&?\s*Late Submission/i],
    ["examinationRules", /Examinations?/i],
    ["penaltiesConsequences", /Penalties|Consequences/i],
  ];
  const found = labels.map(([key, rx]) => ({ key, match: rx.exec(text) })).filter((x) => x.match).sort((a, b) => a.match!.index - b.match!.index);
  const out = emptyPolicy();
  found.forEach((item, i) => {
    const start = item.match!.index + item.match![0].length;
    const end = found[i + 1]?.match!.index ?? text.length;
    out[item.key] = cleanText(text.slice(start, end));
  });
  return out;
}

function emptyPolicy() {
  return {
    attendancePreparation: "",
    academicIntegrity: "",
    assignmentsLateSubmission: "",
    examinationRules: "",
    penaltiesConsequences: "",
  };
}

async function resolveLecturer(doc: CanonicalCourse): Promise<{ id: string | null; warning?: string }> {
  const email = cleanText(doc.lecturers.primary.email);
  if (email) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) return { id: user.id };
  }
  const target = normalizeName(doc.lecturers.primary.name);
  if (!target) return { id: null, warning: "No primary lecturer name/email in document" };
  const users = await prisma.user.findMany({
    select: { id: true, name: true, roleAssignments: { select: { role: { select: { slug: true } } } } },
  });
  const matches = users.filter((u) => u.roleAssignments.some((r) => r.role.slug === "lecturer") && normalizeName(u.name) === target);
  if (matches.length === 1) return { id: matches[0]!.id };
  return {
    id: null,
    warning: matches.length > 1
      ? `Ambiguous lecturer match for ${doc.lecturers.primary.name}`
      : `Lecturer not found: ${doc.lecturers.primary.name}${email ? ` <${email}>` : ""}`,
  };
}

async function ensureTeachingMethod(tx: Tx, name: string) {
  return tx.teachingMethod.upsert({ where: { name }, create: { name }, update: {}, select: { id: true } });
}

async function ensureAssessmentMethod(tx: Tx, name: string) {
  return tx.assessmentMethod.upsert({ where: { name }, create: { name }, update: {}, select: { id: true } });
}

function dueWeekForAssessment(doc: CanonicalCourse, name: string): number | null {
  const needle = name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (!needle) return null;
  for (const week of doc.lessonPlan?.weeks ?? []) {
    const raw = cleanText(week.assessmentRaw);
    if (!raw || raw === "0" || raw === "-" || raw === "—") continue;
    const hay = raw.toLowerCase().replace(/\(\s*\d+(?:\.\d+)?\s*%\s*\)/g, " ").replace(/\b\d+(?:\.\d+)?\s*%\b/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
    if (!hay) continue;
    const candidate = hay.replace(/^\d+\s*/, "").trim();
    if (hay.includes(needle) || (candidate.length > 0 && needle.includes(candidate))) return week.week;
  }
  return null;
}

async function importOne(doc: CanonicalCourse, file: string, options: CliOptions): Promise<ImportResult> {
  const warnings = doc.validation.warnings.map(warningText);
  const errors = doc.validation.errors.map(warningText);
  const courseCode = doc.course.code.toUpperCase();
  if (errors.length) return { file, courseCode, action: "blocked", warnings, error: `Extraction errors: ${errors.join("; ")}` };
  if (warnings.length && !options.allowWarnings) return { file, courseCode, action: "blocked", warnings, error: "Extraction warnings require --allow-warnings after manual review" };

  const lecturer = await resolveLecturer(doc);
  if (lecturer.warning) warnings.push(lecturer.warning);
  if ((doc.lecturers.coLecturers ?? []).length) warnings.push("Co-lecturers were preserved in source JSON but not imported because they belong to a term-specific Offering");
  warnings.push(...courseInfoSnapshotWarnings(doc));
  if (
    doc.source.semesterFolder ||
    doc.source.yearFolder ||
    doc.course.availability?.semester ||
    doc.course.availability?.year
  ) {
    warnings.push(
      "Semester/programme year were snapshotted on the CourseSpec; no Offering was created because Offering requires a real term",
    );
  }

  const existingCourse = await prisma.course.findUnique({
    where: { code: courseCode },
    include: { specs: { orderBy: [{ versionMajor: "desc" }, { versionMinor: "desc" }], take: 1, select: { id: true } } },
  });
  if (existingCourse?.specs[0] && !options.replaceExisting) {
    return { file, courseCode, action: "skipped", warnings: [...warnings, "Existing CourseSpec found; pass --replace-existing to replace it"] };
  }
  if (!options.commit) return { file, courseCode, action: "ready", warnings };

  await prisma.$transaction(
    async (tx) => {
      const course = await ensureCourseForCourseSpecImport(tx, {
        programmeId: DEFAULT_PROGRAMME_ID,
        code: courseCode,
        title: doc.course.title,
        description: cleanText(doc.course.description) || null,
        prerequisites: cleanText(doc.course.prerequisites) || null,
        credits: doc.course.credits?.total ?? null,
        courseType: prismaCourseType(doc.course.courseType),
        totalSltHours: grandTotalSlt(doc),
        lecturerId: lecturer.id,
      });

      const oldSpec = await tx.courseSpec.findFirst({
        where: { courseId: course.id },
        orderBy: [{ versionMajor: "desc" }, { versionMinor: "desc" }],
        select: { id: true },
      });
      if (oldSpec && options.replaceExisting) await tx.courseSpec.delete({ where: { id: oldSpec.id } });
      const spec = await tx.courseSpec.create({
        data: {
          courseId: course.id,
          courseInfo: {
            create: courseInfoSnapshotFromDocument(doc, grandTotalSlt(doc)),
          },
        },
      });

      const teachingMethodNames = new Set<string>();
      const assessmentMethodNames = new Set<string>();
      for (const clo of doc.clos) {
        aliasesFromRaw(clo.teachingMethodsRaw ?? "", TEACHING_METHOD_ALIASES).forEach((x) => teachingMethodNames.add(x));
        aliasesFromRaw(clo.assessmentMethodsRaw ?? "", ASSESSMENT_METHOD_ALIASES).forEach((x) => assessmentMethodNames.add(x));
      }
      for (const week of doc.lessonPlan?.weeks ?? []) aliasesFromRaw(week.teachingMethodsRaw, TEACHING_METHOD_ALIASES).forEach((x) => teachingMethodNames.add(x));
      for (const item of doc.assessments) ASSESSMENT_METHOD_ALIASES.filter(([rx]) => rx.test(item.name)).forEach(([, x]) => assessmentMethodNames.add(x));

      const teachingMethodIds = new Map<string, string>();
      for (const name of teachingMethodNames) teachingMethodIds.set(name, (await ensureTeachingMethod(tx, name)).id);
      const assessmentMethodIds = new Map<string, string>();
      for (const name of assessmentMethodNames) assessmentMethodIds.set(name, (await ensureAssessmentMethod(tx, name)).id);

      const activeStrategyIds = [...new Set((doc.lessonPlan?.weeks ?? []).flatMap((w) => activeLearningFromRaw(w.activeLearningRaw)))];
      const selfStudy = selfStudyByWeek(doc);
      const topicByNumber = new Map((doc.lessonPlan?.topics ?? []).filter((t) => t.number != null).map((t) => [t.number!, t]));

      const cloRows = doc.clos.map((clo, order) => ({
        id: stableId(courseCode, "clo", order),
        courseSpecId: spec.id,
        order,
        description: clo.description,
        level: clo.level ?? null,
        mappedPlos: clo.mappedPlos,
        sltHours: null,
        status: clo.status === "inactive" ? ("Inactive" as const) : ("Active" as const),
        notes: "",
        activeLearningStrategyIds: activeStrategyIds,
      }));
      if (cloRows.length) await tx.courseSpecClo.createMany({ data: cloRows });
      const cloIdByCode = new Map(doc.clos.map((c, i) => [c.code, cloRows[i]!.id]));
      const cloTeachingLinks = doc.clos.flatMap((clo) => aliasesFromRaw(clo.teachingMethodsRaw ?? "", TEACHING_METHOD_ALIASES).flatMap((name) => {
        const id = teachingMethodIds.get(name);
        const cloId = cloIdByCode.get(clo.code);
        return id && cloId ? [{ courseSpecId: spec.id, cloId, teachingMethodId: id }] : [];
      }));
      if (cloTeachingLinks.length) await tx.courseSpecCloTeachingMethod.createMany({ data: cloTeachingLinks, skipDuplicates: true });
      const cloAssessmentLinks = doc.clos.flatMap((clo) => aliasesFromRaw(clo.assessmentMethodsRaw ?? "", ASSESSMENT_METHOD_ALIASES).flatMap((name) => {
        const id = assessmentMethodIds.get(name);
        const cloId = cloIdByCode.get(clo.code);
        return id && cloId ? [{ courseSpecId: spec.id, cloId, assessmentMethodId: id }] : [];
      }));
      if (cloAssessmentLinks.length) await tx.courseSpecCloAssessmentMethod.createMany({ data: cloAssessmentLinks, skipDuplicates: true });

      const weekRows = (doc.lessonPlan?.weeks ?? []).map((week, order) => {
        const [lectureHours, tutorialHours, practiceHours, otherHours] = parseContactHours(week.hoursRaw);
        const topicMatch = /Topic\s*(\d+)/i.exec(week.lectureTopic);
        const topic = topicMatch ? topicByNumber.get(Number(topicMatch[1])) : undefined;
        const llos = topic ? llosFromRaw(topic.llosRaw, courseCode, topic.number ?? order) : [];
        return {
          id: stableId(courseCode, "week", week.week),
          courseSpecId: spec.id,
          order,
          week: week.week,
          topic: cleanText(week.lectureTopic),
          cloCodes: week.clos,
          lloItems: llos.map((x) => x.description),
          lessonLearningOutcomes: llos as Prisma.InputJsonValue,
          activities: cleanText(week.activeLearningRaw) ? [cleanText(week.activeLearningRaw)] : [],
          studentLearningActivities: [] as unknown as Prisma.InputJsonValue,
          lectureHours,
          tutorialHours,
          practiceHours,
          otherHours,
          selfStudyHours: selfStudy.get(week.week) ?? null,
          teachingMethodIds: aliasesFromRaw(week.teachingMethodsRaw, TEACHING_METHOD_ALIASES).flatMap((name) => teachingMethodIds.get(name) ?? []),
          teachingResourceTypes: cleanText(week.resourcesRaw) ? week.resourcesRaw.split(/[,;]+/).map(cleanText).filter(Boolean) : [],
          assessmentMethodIds: aliasesFromRaw(week.assessmentRaw, ASSESSMENT_METHOD_ALIASES).flatMap((name) => assessmentMethodIds.get(name) ?? []),
          assessment: cleanText(week.assessmentRaw),
        };
      });
      if (weekRows.length) await tx.courseSpecWeek.createMany({ data: weekRows });

      const assessmentRows = doc.assessments.map((item, order) => ({
        id: stableId(courseCode, "assessment", order),
        courseSpecId: spec.id,
        order,
        name: item.name,
        type: assessmentType(item.name),
        description: "",
        mode: item.mode.toLowerCase().includes("group") ? ("Group" as const) : ("Individual" as const),
        status: "Active" as const,
        cloCodes: item.clo ? [item.clo] : [],
        feedbackMethod: "",
        feedbackTimeline: "",
        weight: item.weightPercent ?? null,
        dueWeek: dueWeekForAssessment(doc, item.name),
        durationWeeks: null,
        format: "",
        submissionMethod: "",
        instructions: "",
        rubricId: null,
        mappedPlos: item.plos,
        notes: "",
      }));
      if (assessmentRows.length) await tx.courseSpecAssessmentItem.createMany({ data: assessmentRows });

      const resourceRows: Prisma.CourseSpecResourceCreateManyInput[] = [];
      const seenResources = new Map<string, number>();
      for (const week of doc.lessonPlan?.weeks ?? []) {
        for (const title of week.resourcesRaw.split(/[,;]+/).map(cleanText).filter(Boolean)) {
          const key = title.toLowerCase();
          const existing = seenResources.get(key);
          if (existing != null) {
            const row = resourceRows[existing]!;
            const existingWeekIds = Array.isArray(row.evidenceWeekIds) ? row.evidenceWeekIds : (row.evidenceWeekIds?.set ?? []);
            row.evidenceWeekIds = [...new Set([...existingWeekIds, stableId(courseCode, "week", week.week)])];
          } else {
            seenResources.set(key, resourceRows.length);
            resourceRows.push({
              id: stableId(courseCode, "resource", resourceRows.length),
              courseSpecId: spec.id,
              order: resourceRows.length,
              resourceType: "Weekly resource",
              title,
              url: "",
              notes: "",
              evidenceWeekIds: [stableId(courseCode, "week", week.week)],
              kind: "OTHER",
              authors: "",
              publisher: "",
              year: "",
              isbn: "",
              basedOn: "",
            });
          }
        }
      }

      const refs = doc.resources?.references;
      for (const [kind, list] of [["REQUIRED", refs?.required ?? []], ["RECOMMENDED", refs?.recommended ?? []]] as const) {
        for (const ref of list) {
          const title = cleanText(String(ref.title ?? ""));
          if (!title) continue;
          resourceRows.push({
            id: stableId(courseCode, "reference", resourceRows.length),
            courseSpecId: spec.id,
            order: resourceRows.length,
            resourceType: "Reference",
            title,
            url: "",
            notes: "Imported from legacy DOCX reference table",
            evidenceWeekIds: [],
            kind,
            authors: cleanText(String(ref.authors ?? "")),
            publisher: cleanText(String(ref.publisher ?? "")),
            year: cleanText(String(ref.year ?? "")),
            isbn: cleanText(String(ref.isbn ?? "")),
            basedOn: "",
          });
        }
      }
      if (resourceRows.length) await tx.courseSpecResource.createMany({ data: resourceRows });

      const responsibilities = splitResponsibilities(doc.studentResponsibilitiesRaw);
      if (responsibilities.length) {
        await tx.courseSpecStudentResponsibility.createMany({
          data: responsibilities.map((text, order) => ({
            id: stableId(courseCode, "responsibility", order),
            courseSpecId: spec.id,
            order,
            text,
          })),
        });
      }

      const policy = parsePolicy(doc.coursePolicyRaw);
      if (Object.values(policy).some(Boolean)) await tx.courseSpecPolicy.create({ data: { courseSpecId: spec.id, ...policy } });

      const resourceTypes = [...new Set((doc.lessonPlan?.weeks ?? []).flatMap((w) => {
        const raw = w.resourcesRaw.toLowerCase();
        const values: string[] = [];
        if (raw.includes("slide")) values.push("Slides");
        if (raw.includes("dataset") || raw.includes("data set")) values.push("Datasets");
        if (raw.includes("worksheet")) values.push("Worksheets");
        if (raw.includes("video")) values.push("Videos");
        if (raw.includes("case")) values.push("Case Studies");
        return values;
      }))];
      const technologyTypes = [...new Set((doc.lessonPlan?.weeks ?? []).flatMap((w) => {
        const raw = w.resourcesRaw.toLowerCase();
        const values: string[] = [];
        if (raw.includes("jupyter")) values.push("Jupyter");
        if (raw.includes("github")) values.push("GitHub");
        if (raw.includes("colab")) values.push("Google Colab");
        if (raw.includes("lms")) values.push("LMS");
        return values;
      }))];

      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "CourseSpecTeachingLearning" ("courseSpecId", "philosophyTags", "philosophyStatement", "teachingMethodIds", "activeLearningStrategyIds", "independentLearningTypes", "resourceTypes", "technologyTypes", "updatedAt")
        VALUES (${spec.id}, ${[]}::text[], ${""}, ${[...teachingMethodIds.values()]}::text[], ${activeStrategyIds}::text[], ${[]}::text[], ${resourceTypes}::text[], ${technologyTypes}::text[], CURRENT_TIMESTAMP)
        ON CONFLICT ("courseSpecId") DO UPDATE SET "teachingMethodIds" = EXCLUDED."teachingMethodIds", "activeLearningStrategyIds" = EXCLUDED."activeLearningStrategyIds", "resourceTypes" = EXCLUDED."resourceTypes", "technologyTypes" = EXCLUDED."technologyTypes", "updatedAt" = CURRENT_TIMESTAMP
      `);

      const sections: Array<{ key: string; complete: boolean }> = [
        { key: "courseInfo", complete: true },
        { key: "clos", complete: cloRows.length > 0 },
        { key: "assessmentPlan", complete: assessmentRows.length > 0 },
        { key: "slt", complete: weekRows.length > 0 },
        { key: "resources", complete: resourceRows.length > 0 },
        { key: "responsibility", complete: responsibilities.length > 0 },
        { key: "policy", complete: Object.values(policy).some(Boolean) },
        { key: "teachingLearning", complete: false },
      ];
      await tx.courseSpecSection.createMany({
        data: sections
          .filter((s) => s.complete || s.key === "teachingLearning")
          .map((s) => ({
            courseSpecId: spec.id,
            sectionKey: s.key,
            status: s.complete ? ("Complete" as const) : ("Draft" as const),
          })),
      });
    },
    {
      maxWait: 10_000,
      timeout: 60_000,
    },
  );

  return {
    file,
    courseCode,
    action: existingCourse?.specs[0] ? "replaced" : "created",
    warnings,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const files = await walkJsonFiles(options.input);
  const results: ImportResult[] = [];
  for (const file of files) {
    if (file.endsWith("schema.json") || file.endsWith("import-report.json")) continue;
    try {
      const parsed = CanonicalCourseSchema.parse(JSON.parse(await readFile(file, "utf8")));
      if (options.courseCode && parsed.course.code.toUpperCase() !== options.courseCode) continue;
      results.push(await importOne(parsed, file, options));
    } catch (error) {
      results.push({
        file,
        courseCode: "UNKNOWN",
        action: "failed",
        warnings: [],
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  const summary = {
    mode: options.commit ? "commit" : "dry-run",
    total: results.length,
    ready: results.filter((r) => r.action === "ready").length,
    created: results.filter((r) => r.action === "created").length,
    replaced: results.filter((r) => r.action === "replaced").length,
    skipped: results.filter((r) => r.action === "skipped").length,
    blocked: results.filter((r) => r.action === "blocked").length,
    failed: results.filter((r) => r.action === "failed").length,
  };
  console.log(JSON.stringify({ summary, results }, null, 2));
  if (options.reportPath) await writeFile(options.reportPath, JSON.stringify({ summary, results }, null, 2));
  if (summary.failed > 0 || summary.blocked > 0) process.exitCode = 1;
}

main().finally(() => prisma.$disconnect());
