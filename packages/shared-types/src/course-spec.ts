import { z } from "zod";
import { CourseTypeSchema } from "./courses.ts";
import { SemesterSchema } from "./offerings.ts";

/**
 * Course Specification wizard contract. The full RUPP syllabus (Part 2 §1–25) is
 * captured as one JSON document per course. This module defines:
 *  - the ordered SECTION registry that drives the wizard stepper,
 *  - reference constants (Bloom-style level guides, legends) for the inline guides
 *    and dropdowns, and
 *  - per-section input schemas (Phase 1: Course Information §1–13).
 *
 * Storage lives in the CourseSpec table: `data[sectionId]` holds a section's content,
 * `status[sectionId]` tracks draft/complete so a lecturer can save and resume.
 */

/* ------------------------------------------------------------------ sections */

/** Whether a wizard section is implemented yet or a placeholder for a later phase. */
export type SpecSectionState = "ready" | "soon";

export interface SpecSectionMeta {
  /** Stable key used in CourseSpec.data / .status and the route hash. */
  id: string;
  /** Step label in the stepper. */
  title: string;
  /** Syllabus reference shown as a subtitle, e.g. "§1–13". */
  ref?: string;
  /** "Part 1" (programme, read-only) or "Part 2" (course). */
  part: "Part 1" | "Part 2";
  state: SpecSectionState;
}

/** Ordered wizard steps. Part 1 is a read-only programme reference; Part 2 is §1–25. */
export const SPEC_SECTIONS: readonly SpecSectionMeta[] = [
  {
    id: "programme",
    title: "Programme",
    ref: "Part 1",
    part: "Part 1",
    state: "ready",
  },
  {
    id: "courseInfo",
    title: "Course Information",
    ref: "§1–13",
    part: "Part 2",
    state: "ready",
  },
  {
    id: "clos",
    title: "Course Learning Outcomes",
    ref: "§14",
    part: "Part 2",
    state: "ready",
  },
  {
    id: "slt",
    title: "Weekly Plan",
    ref: "§18",
    part: "Part 2",
    state: "ready",
  },
  {
    id: "assessmentPlan",
    title: "Course Assessment Plan",
    ref: "§17",
    part: "Part 2",
    state: "ready",
  },
  {
    id: "mapping",
    title: "CLO Alignment Mapping",
    ref: "§14–18",
    part: "Part 2",
    state: "ready",
  },
  {
    id: "resources",
    title: "Required Resources",
    ref: "§19",
    part: "Part 2",
    state: "soon",
  },
  {
    id: "references",
    title: "References / Textbooks",
    ref: "§20",
    part: "Part 2",
    state: "soon",
  },
  {
    id: "responsibility",
    title: "Student Responsibility",
    ref: "§21",
    part: "Part 2",
    state: "soon",
  },
  {
    id: "rubric",
    title: "Rubric & Rating Scale",
    ref: "§22",
    part: "Part 2",
    state: "soon",
  },
  {
    id: "policy",
    title: "Course Policy",
    ref: "§23",
    part: "Part 2",
    state: "soon",
  },
  {
    id: "ratingScale",
    title: "Rating Scale",
    ref: "§24",
    part: "Part 2",
    state: "soon",
  },
  { id: "date", title: "Date", ref: "§25", part: "Part 2", state: "soon" },
] as const;

export type SpecSectionId = (typeof SPEC_SECTIONS)[number]["id"];

/** Per-section completion tracking stored in CourseSpec.status. */
export const SpecSectionStatus = z.enum(["draft", "complete"]);
export type SpecSectionStatus = z.infer<typeof SpecSectionStatus>;

/** How many of a course's "ready" wizard sections are marked complete — backs the programme dashboard. */
export interface CourseSpecProgress {
  courseId: string;
  code: string;
  title: string;
  completed: number;
  total: number;
  /**
   * Completable sections not yet marked Complete (in wizard order) — the
   * deterministic, explainable basis for a lecturer-facing "Attention" detail
   * (issue #104), e.g. "CLO Alignment Mapping incomplete". Empty when `completed
   * === total`.
   */
  incompleteSections: { id: SpecSectionId; title: string }[];
}

/** Completion percentage (0–100) of a course's completable spec sections. */
export function specCompletionPercent(progress: Pick<CourseSpecProgress, "completed" | "total">): number {
  return progress.total ? Math.round((progress.completed / progress.total) * 100) : 0;
}

/** Human label for `specCompletionPercent` — backs the lecturer "My Courses" table (issue #104). */
export type SpecCompletionLabel = "Complete" | "In progress" | "Not started";

export function specCompletionLabel(progress: Pick<CourseSpecProgress, "completed" | "total">): SpecCompletionLabel {
  if (progress.total === 0 || progress.completed === 0) return "Not started";
  if (progress.completed === progress.total) return "Complete";
  return "In progress";
}

/**
 * Deterministic "Attention" status for the lecturer "My Courses" table (issue
 * #104) — derived purely from `completed`/`total`/`incompleteSections`, never
 * invented client-side:
 *  - "upToDate": every completable section is marked Complete.
 *  - "needsAttention": nothing has been saved yet (critical — no content at all).
 *  - "itemsRemaining": some but not all sections are complete.
 */
export type SpecAttentionLevel = "upToDate" | "itemsRemaining" | "needsAttention";

export interface SpecAttention {
  level: SpecAttentionLevel;
  /** The same list as `progress.incompleteSections` — empty when `level === "upToDate"`. */
  items: { id: SpecSectionId; title: string }[];
}

export function specAttention(progress: CourseSpecProgress): SpecAttention {
  if (progress.total > 0 && progress.completed === progress.total) return { level: "upToDate", items: [] };
  if (progress.completed === 0) return { level: "needsAttention", items: progress.incompleteSections };
  return { level: "itemsRemaining", items: progress.incompleteSections };
}

/* ------------------------------------------------------- reference constants */

/** A Bloom-style level: code (e.g. "C3"), short name, and ordinal. */
export interface LevelGuideEntry {
  code: string;
  name: string;
}

/** §14 Cognitive domain (C1–C6). */
export const COGNITIVE_LEVELS: readonly LevelGuideEntry[] = [
  { code: "C1", name: "Remembering" },
  { code: "C2", name: "Understanding" },
  { code: "C3", name: "Applying" },
  { code: "C4", name: "Analyzing" },
  { code: "C5", name: "Evaluating" },
  { code: "C6", name: "Creating" },
] as const;

/** §14 Affective domain (A1–A5). */
export const AFFECTIVE_LEVELS: readonly LevelGuideEntry[] = [
  { code: "A1", name: "Receiving" },
  { code: "A2", name: "Responding" },
  { code: "A3", name: "Valuing" },
  { code: "A4", name: "Organizing" },
  { code: "A5", name: "Internalizing" },
] as const;

/** §14 Psychomotor domain (P1–P7). */
export const PSYCHOMOTOR_LEVELS: readonly LevelGuideEntry[] = [
  { code: "P1", name: "Perception" },
  { code: "P2", name: "Set" },
  { code: "P3", name: "Guided Response" },
  { code: "P4", name: "Mechanism" },
  { code: "P5", name: "Complex Overt Response" },
  { code: "P6", name: "Adaptation" },
  { code: "P7", name: "Origination" },
] as const;

/** §14 focus of a CLO on its mapped PLOs relative to total SLT. */
export const FOCUS_LEVELS: readonly {
  code: string;
  name: string;
  hint: string;
}[] = [
  { code: "F", name: "Fully", hint: "more than 50% of total SLT" },
  { code: "M", name: "Moderate", hint: "31%–50% of total SLT" },
  { code: "P", name: "Partial", hint: "less than 30% of total SLT" },
] as const;

/**
 * §18 Weekly Plan learning-activity vocabulary — the presets offered in the
 * "Learning Activities" multi-select. Lecturers may also type their own, so this
 * is a starting list rather than a closed set.
 */
export const LEARNING_ACTIVITIES: readonly string[] = [
  "Lecture",
  "Class Discussion",
  "Lab Exercise",
  "Practice",
  "Group Activity",
  "Peer Review",
  "Hands-on",
  "Case Study",
  "Project Work",
  "Consultation",
  "Presentation",
  "Peer Evaluation",
] as const;

/** §17 assessment grouping. */
export const GROUP_INDIVIDUAL: readonly { code: string; name: string }[] = [
  { code: "I", name: "Individual" },
  { code: "G", name: "Group" },
] as const;

/** §17 assessment types — the vocabulary for the "Type" column and picker. */
export const ASSESSMENT_TYPES = [
  "Assignment",
  "Quiz",
  "Exam",
  "Lab",
  "Project",
  "Presentation",
  "Report",
  "Peer Evaluation",
  "Participation",
] as const;

/**
 * §17 assessment format / deliverables — presets for the "Assessment Format /
 * Deliverables" picker. Lecturers may type their own, so this is a starting list.
 */
export const ASSESSMENT_FORMATS: readonly string[] = [
  "Written Report",
  "Presentation Slides",
  "Source Code",
  "Oral Presentation",
  "Poster",
  "Portfolio",
  "Video",
  "Written Exam",
  "Practical Exam",
] as const;

/** §17 submission methods — presets for the "Submission Method" picker. */
export const SUBMISSION_METHODS: readonly string[] = [
  "LMS (Upload)",
  "In Class",
  "Email",
  "Printed Copy",
  "Online Quiz",
  "Live Presentation",
] as const;

/** §24 letter-grade rating scale (fixed programme standard). */
export const LETTER_GRADES: readonly {
  grade: string;
  point: string;
  score: string;
  label: string;
}[] = [
  { grade: "A", point: "4.00", score: "85–100", label: "Excellent" },
  { grade: "B+", point: "3.50", score: "80–84", label: "Very Good" },
  { grade: "B", point: "3.00", score: "75–79", label: "Good" },
  { grade: "C+", point: "2.50", score: "70–74", label: "Fairly Good" },
  { grade: "C", point: "2.00", score: "65–69", label: "Fair" },
  { grade: "D+", point: "1.50", score: "60–64", label: "Poor" },
  { grade: "D", point: "1.00", score: "50–59", label: "Very Poor" },
  { grade: "F", point: "0.00", score: "<50", label: "Fail" },
] as const;

/** The ten programme learning outcomes (Part 1). Referenced by CLOs in §14. */
export const PLOS: readonly { id: string; description: string }[] = [
  {
    id: "PLO1",
    description:
      "Apply knowledge in data science and engineering to develop appropriate solutions for real-world problems.",
  },
  {
    id: "PLO2",
    description:
      "Analyze data-related problems using logical reasoning and systems thinking.",
  },
  {
    id: "PLO3",
    description:
      "Utilize data science tools and technologies to develop technical solutions for practical applications.",
  },
  {
    id: "PLO4",
    description:
      "Participate effectively in multicultural and multidisciplinary teams with intercultural competence and responsible citizenship.",
  },
  {
    id: "PLO5",
    description:
      "Demonstrate leadership, accountability, and lifelong learning in professional practice.",
  },
  {
    id: "PLO6",
    description:
      "Develop innovative and entrepreneurial data-driven solutions that support national development and cultural sustainability in Cambodia and the ASEAN region.",
  },
  {
    id: "PLO7",
    description:
      "Make ethical decisions that reflect professional responsibility and awareness of social, cultural and environmental impacts.",
  },
  {
    id: "PLO8",
    description:
      "Communicate ideas and findings clearly through oral, written, and visual form.",
  },
  {
    id: "PLO9",
    description:
      "Utilize digital technologies and platforms to support communication, collaboration, and data-driven work.",
  },
  {
    id: "PLO10",
    description:
      "Apply mathematical, logical, and statistical reasoning in data analysis and problem solving.",
  },
] as const;

export const PLO_IDS = [
  "PLO1",
  "PLO2",
  "PLO3",
  "PLO4",
  "PLO5",
  "PLO6",
  "PLO7",
  "PLO8",
  "PLO9",
  "PLO10",
] as const;
export const PloId = z.enum(PLO_IDS);
export type PloId = z.infer<typeof PloId>;

/** Every C/A/P Bloom level, flattened — drives the §14 "C/A/P Level" dropdown. */
export const CAP_LEVELS: readonly LevelGuideEntry[] = [
  ...COGNITIVE_LEVELS,
  ...AFFECTIVE_LEVELS,
  ...PSYCHOMOTOR_LEVELS,
] as const;

const CAP_LEVEL_CODES = new Set(CAP_LEVELS.map((l) => l.code));

/** A single Bloom level code (C1–C6, A1–A5, P1–P7), validated against CAP_LEVELS. */
export const CapLevel = z
  .string()
  .refine((v) => CAP_LEVEL_CODES.has(v), { message: "Unknown C/A/P level" });

/** §14 focus code (F/M/P) relative to total SLT on a CLO's mapped PLOs. */
export const FocusCode = z.enum(["F", "M", "P"]);
export type FocusCode = z.infer<typeof FocusCode>;

/* -------------------------------------------- §1–13 Course Information */

/**
 * Course Information (§1–13) as returned by `GET /:id/spec` — a read model, not
 * stored verbatim. Programme Title (§1) is fixed config; the administrative
 * scalars (§2–4, §11) come live from the Course row, the instructor block (§6–9)
 * from the assigned lecturer's profile, and availability/other-lecturers (§10,
 * §12) from the course's latest Offering — all recomputed on every read so
 * reassigning a lecturer or editing the course is reflected immediately. Only
 * Pre-requisites (§5) and Course Description (§14) are actually editable; see
 * `CourseInfoInput`, which is what `PUT /:id/spec/courseInfo` accepts.
 */
export const CourseInfoSection = z.object({
  // §2 / §3 / §4 / §11 — read live from Course; edited via the Course entity.
  courseTitle: z.string().min(1, "Course title is required"),
  courseCode: z.string().min(1, "Course code is required"),
  credits: z.coerce.number().int().min(1).max(30).nullable().optional(),
  courseType: CourseTypeSchema.nullable().optional(),
  // §5 / §14 — the only fields a save actually persists.
  prerequisites: z.string().optional(),
  description: z.string().optional(),
  // §6–9 — read live from the assigned lecturer's profile.
  instructorName: z.string().optional(),
  qualification: z.string().optional(),
  email: z
    .string()
    .email("A valid email is required")
    .or(z.literal(""))
    .optional(),
  telephone: z.string().optional(),
  // §10 — read live from the latest Offering; edited via the Offering entity.
  otherLecturers: z.string().optional(),
  // §12 — read live from the latest Offering; edited via the Offering entity.
  semester: SemesterSchema.nullable().optional(),
  programmeYear: z.coerce.number().int().min(1).max(10).nullable().optional(),
});
export type CourseInfoSection = z.infer<typeof CourseInfoSection>;

/**
 * What `PUT /:id/spec/courseInfo` actually accepts. Every other Course
 * Information field is admin/assignment-derived (see `CourseInfoSection`) and
 * must not be settable through the spec wizard — by a lecturer or an admin —
 * so the input schema, not just the form UI, is what enforces that boundary.
 */
export const CourseInfoInput = z.object({
  prerequisites: z.string().optional(),
  description: z.string().optional(),
});
export type CourseInfoInput = z.infer<typeof CourseInfoInput>;

/* --------------------------------------- §14 Course Learning Outcomes */

/** Whether a CLO counts toward mapping and reports. */
export const CLO_STATUSES = ["active", "inactive"] as const;
export const CloStatus = z.enum(CLO_STATUSES);
export type CloStatus = z.infer<typeof CloStatus>;

/**
 * One Course Learning Outcome (§14). `code` (CLO1, CLO2…) is assigned by position.
 * A CLO sits at one C/A/P Bloom level and contributes to one or more PLOs; the
 * teaching/assessment methods reference the shared `methods` vocabulary. `sltHours`
 * is the Student Learning Time this CLO accounts for — the sum across a course's
 * CLOs must equal the course's total SLT — and its Focus (F/M/P) is derived from
 * that share, not stored (see `cloFocusPercent`/`cloFocusCode` below). This section
 * used to be split across §14 (outcome + PLO) and a separate §15 mapping section
 * (SLT + methods); they were merged into one per-CLO form.
 */
export const CloItem = z.object({
  /** Stable identity (client-generated), unlike the position-derived `code` below. */
  id: z.string().min(1),
  code: z.string().min(1),
  description: z.string().min(1, "Describe what students will be able to do"),
  level: CapLevel.nullable().optional(),
  mappedPlos: z.array(PloId).default([]),
  sltHours: z.coerce.number().int().min(0).max(1000).nullable().optional(),
  teachingMethodIds: z.array(z.string()).default([]),
  assessmentMethodIds: z.array(z.string()).default([]),
  status: CloStatus.default("active"),
  notes: z.string().default(""),
});
export type CloItem = z.infer<typeof CloItem>;

export const ClosSection = z.object({
  items: z.array(CloItem),
});
export type ClosSection = z.infer<typeof ClosSection>;

/** A CLO's share of the course's total SLT, as a whole percent. `null` when not yet computable. */
export function cloFocusPercent(
  sltHours: number | null | undefined,
  totalSlt: number | null | undefined,
): number | null {
  if (!totalSlt || !sltHours) return null;
  return Math.round((sltHours / totalSlt) * 100);
}

/** F/M/P category derived from a focus percentage (legend: F >50%, M 31–50%, P ≤30%). */
export function cloFocusCode(percent: number | null): FocusCode | null {
  if (percent == null) return null;
  if (percent > 50) return "F";
  if (percent >= 31) return "M";
  return "P";
}

/* --------------------------------------- §18 Weekly Plan (Course Outline & Lesson Plan) */

/** One SLT hour value (Contact or Self-Study). Absent = 0. 0–200 (a generous weekly cap). */
const WeekHours = z.coerce.number().min(0).max(200);

/**
 * A structured student learning activity within a weekly plan.
 *
 * Unlike `activities`, which is retained for backward compatibility,
 * this represents what students actually do and which LLOs the
 * activity supports.
 */
export const StudentLearningActivity = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().default(""),
  lloIds: z.array(z.string()).default([]),
});

export type StudentLearningActivity = z.infer<typeof StudentLearningActivity>;
/**
 * One week of the course outline. `cloCodes` reference §14 CLOs by code; `activities`
 * are learning-activity labels (LEARNING_ACTIVITIES presets or custom); `lloItems` are
 * this lesson's Lesson Learning Outcomes, in display order. Contact time is captured
 * as Lecture (L) / Tutorial (T) / Practice (P) / Other (O) hours rather than a single
 * combined figure — see `weekContactHours`. Weekly SLT is derived — contact hours +
 * `selfStudyHours` — not stored.
 */

export const LessonLearningOutcome = z.object({
  id: z.string().min(1),
  description: z.string().default(""),
});

export type LessonLearningOutcome = z.infer<typeof LessonLearningOutcome>;

export const WeeklyPlanRow = z.object({
  id: z.string().min(1),
  week: z.coerce.number().int().min(1).max(52),
  topic: z.string().default(""),
  cloCodes: z.array(z.string()).default([]),
  lloItems: z.array(z.string()).default([]),
  lessonLearningOutcomes: z.array(LessonLearningOutcome).default([]),
  activities: z.array(z.string()).default([]),
  studentLearningActivities: z.array(StudentLearningActivity).default([]),
  lectureHours: WeekHours.nullable().default(null),
  tutorialHours: WeekHours.nullable().default(null),
  practiceHours: WeekHours.nullable().default(null),
  otherHours: WeekHours.nullable().default(null),
  selfStudyHours: WeekHours.nullable().default(null),
  assessment: z.string().default(""),
});
export type WeeklyPlanRow = z.infer<typeof WeeklyPlanRow>;

export const WeeklyPlanSection = z.object({
  weeks: z.array(WeeklyPlanRow).default([]),
});
export type WeeklyPlanSection = z.infer<typeof WeeklyPlanSection>;

/** Contact Hours for one week: Lecture + Tutorial + Practice + Other. Nulls count as 0. */
export function weekContactHours(row: {
  lectureHours?: number | null;
  tutorialHours?: number | null;
  practiceHours?: number | null;
  otherHours?: number | null;
}): number {
  return (
    (row.lectureHours ?? 0) +
    (row.tutorialHours ?? 0) +
    (row.practiceHours ?? 0) +
    (row.otherHours ?? 0)
  );
}

/** SLT for one week: Contact Hours (L+T+P+O) + Self-Study Hours. Nulls count as 0. */
export function weekSlt(row: {
  lectureHours?: number | null;
  tutorialHours?: number | null;
  practiceHours?: number | null;
  otherHours?: number | null;
  selfStudyHours?: number | null;
}): number {
  return weekContactHours(row) + (row.selfStudyHours ?? 0);
}

/** Weekly-plan footer totals: each contact category, Self-Study, and the derived SLT, summed over all weeks. */
export function weeklyPlanTotals(section: WeeklyPlanSection) {
  return section.weeks.reduce(
    (acc, w) => {
      acc.lectureHours += w.lectureHours ?? 0;
      acc.tutorialHours += w.tutorialHours ?? 0;
      acc.practiceHours += w.practiceHours ?? 0;
      acc.otherHours += w.otherHours ?? 0;
      acc.selfStudyHours += w.selfStudyHours ?? 0;
      acc.slt += weekSlt(w);
      return acc;
    },
    {
      lectureHours: 0,
      tutorialHours: 0,
      practiceHours: 0,
      otherHours: 0,
      selfStudyHours: 0,
      slt: 0,
    },
  );
}

/* --------------------------------------- §17 Course Assessment Plan */

/** An assessment's type (Assignment, Quiz, …), validated against ASSESSMENT_TYPES. */
export const AssessmentType = z.enum(ASSESSMENT_TYPES);
export type AssessmentType = z.infer<typeof AssessmentType>;

/** Whether an assessment is done individually or as a group. */
export const AssessmentMode = z.enum(["individual", "group"]);
export type AssessmentMode = z.infer<typeof AssessmentMode>;

/** Whether an assessment counts toward the plan's weighting and reports. */
export const AssessmentStatus = z.enum(["active", "inactive"]);
export type AssessmentStatus = z.infer<typeof AssessmentStatus>;

/**
 * One §17 assessment. `cloCodes` reference §14 CLOs by code and `mappedPlos` the
 * Part 1 PLOs; `bloomLevel` is the targeted C/A/P level. `weight` is a percentage
 * of the final grade — the plan's weights are expected to total 100 across active
 * rows, checked in the UI rather than enforced per-row here.
 */
export const AssessmentItem = z.object({
  id: z.string().min(1),
  name: z.string().min(1, "An assessment name is required"),
  type: AssessmentType,
  description: z.string().default(""),
  mode: AssessmentMode.default("individual"),
  status: AssessmentStatus.default("active"),
  // Linking.
  cloCodes: z.array(z.string()).default([]),
  bloomLevel: CapLevel.nullable().optional(),
  // Weighting & scheduling.
  weight: z.coerce.number().min(0).max(100).nullable().default(null),
  dueWeek: z.coerce.number().int().min(1).max(52).nullable().optional(),
  durationWeeks: z.coerce.number().min(0).max(52).nullable().optional(),
  // Details.
  format: z.string().default(""),
  submissionMethod: z.string().default(""),
  instructions: z.string().default(""),
  rubric: z.string().default(""),
  // PLO mapping & notes.
  mappedPlos: z.array(PloId).default([]),
  notes: z.string().default(""),
});
export type AssessmentItem = z.infer<typeof AssessmentItem>;

export const AssessmentPlanSection = z.object({
  items: z.array(AssessmentItem).default([]),
});
export type AssessmentPlanSection = z.infer<typeof AssessmentPlanSection>;

/** Total weight (%) across active assessments — the figure the plan should sum to 100. */
export function assessmentPlanTotalWeight(
  section: AssessmentPlanSection,
): number {
  return section.items
    .filter((a) => a.status === "active")
    .reduce((sum, a) => sum + (a.weight ?? 0), 0);
}

/* --------------------------------------- Alignment Mapping (CLO × components) */

/**
 * Alignment strengths a lecturer can assign a matrix cell, richest first. Stored as
 * an integer 0–3 so cells can be averaged: 0 = explicitly "None" (rated, no
 * meaningful alignment), 1 = Low, 2 = Medium, 3 = High. A cell *absent* from
 * {@link MappingSection} `cells` is **unrated** — distinct from an explicit None.
 */
export const ALIGNMENT_STRENGTHS: readonly {
  value: 0 | 1 | 2 | 3;
  code: "none" | "low" | "medium" | "high";
  name: string;
  color: string;
}[] = [
  { value: 3, code: "high", name: "High", color: "#22c55e" },
  { value: 2, code: "medium", name: "Medium", color: "#f59e0b" },
  { value: 1, code: "low", name: "Low", color: "#ef4444" },
  { value: 0, code: "none", name: "None", color: "#94a3b8" },
] as const;

/** The component a mapping cell aligns a CLO to: a §18 Weekly Plan week or a §17 assessment. */
export const MappingComponentKind = z.enum(["week", "assessment"]);
export type MappingComponentKind = z.infer<typeof MappingComponentKind>;

/**
 * One matrix cell: the alignment `strength` (0–3) of `cloCode` (a §14 CLO) against
 * one component — a week or assessment identified by `ref` (that row's stable id).
 * The grid is sparse; only cells a lecturer has rated are stored.
 */
export const MappingCell = z.object({
  cloCode: z.string().min(1),
  kind: MappingComponentKind,
  ref: z.string().min(1),
  strength: z.coerce.number().int().min(0).max(3),
});
export type MappingCell = z.infer<typeof MappingCell>;

export const MappingSection = z.object({
  cells: z.array(MappingCell).default([]),
});
export type MappingSection = z.infer<typeof MappingSection>;

/** Stable key for a cell, used to look one up by CLO + component. */
export function mappingCellKey(
  kind: MappingComponentKind,
  ref: string,
  cloCode: string,
): string {
  return `${kind}:${ref}:${cloCode}`;
}

/** Band metadata (name/colour) for a strength, rounded to the nearest level; null when unrated. */
export function alignmentBand(strength: number | null | undefined) {
  if (strength == null || Number.isNaN(strength)) return null;
  const rounded = Math.max(0, Math.min(3, Math.round(strength)));
  return ALIGNMENT_STRENGTHS.find((s) => s.value === rounded) ?? null;
}

/** Mean strength of the given rated cells (2-dp), or null when none are rated. */
export function meanStrength(cells: readonly MappingCell[]): number | null {
  if (cells.length === 0) return null;
  const sum = cells.reduce((acc, c) => acc + c.strength, 0);
  return Math.round((sum / cells.length) * 100) / 100;
}

/** Overall alignment as a percentage of the maximum (3) across all rated cells, rounded. */
export function mappingOverallPercent(cells: readonly MappingCell[]): number {
  const mean = meanStrength(cells);
  return mean == null ? 0 : Math.round((mean / 3) * 100);
}

/** Count of rated cells in each strength band (0–3). */
export function mappingDistribution(
  cells: readonly MappingCell[],
): Record<0 | 1 | 2 | 3, number> {
  const dist: Record<0 | 1 | 2 | 3, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
  for (const c of cells) {
    const v = Math.max(0, Math.min(3, Math.round(c.strength))) as 0 | 1 | 2 | 3;
    dist[v] += 1;
  }
  return dist;
}

/** Per-CLO average strength over that CLO's rated cells; null when a CLO has none. */
export function cloAlignmentAverages(
  cells: readonly MappingCell[],
  cloCodes: readonly string[],
): { code: string; average: number | null }[] {
  return cloCodes.map((code) => ({
    code,
    average: meanStrength(cells.filter((c) => c.cloCode === code)),
  }));
}

/** How many of `refs` (week or assessment ids) have at least one aligned cell (strength ≥ 1). */
export function componentsMapped(
  cells: readonly MappingCell[],
  kind: MappingComponentKind,
  refs: readonly string[],
): number {
  const aligned = new Set(
    cells.filter((c) => c.kind === kind && c.strength >= 1).map((c) => c.ref),
  );
  return refs.filter((r) => aligned.has(r)).length;
}

/** Zod schema for a given section id. Extend as later phases add sections. */
export const SPEC_SECTION_SCHEMAS: Partial<
  Record<SpecSectionId, z.ZodTypeAny>
> = {
  courseInfo: CourseInfoInput,
  clos: ClosSection,
  slt: WeeklyPlanSection,
  assessmentPlan: AssessmentPlanSection,
  mapping: MappingSection,
};

/**
 * Ordered subset of SPEC_SECTIONS that a lecturer can actually fill in and mark
 * complete — i.e. sections with a save schema. Excludes "programme" (a
 * read-only Part 1 reference with no save path) and "soon" sections (not
 * implemented yet), so completion tracking (dashboard progress, the spec
 * page's completion summary) never counts work that can't be finished.
 */
export const COMPLETABLE_SPEC_SECTIONS: readonly SpecSectionMeta[] =
  SPEC_SECTIONS.filter((s) => s.id in SPEC_SECTION_SCHEMAS);

/* ------------------------------------------------------------- spec envelope */

/** Full spec as returned by the API: opaque per-section data + status map. */
export const CourseSpecSchema = z.object({
  courseId: z.string().uuid(),
  data: z.record(z.string(), z.unknown()),
  status: z.record(z.string(), SpecSectionStatus),
});
export type CourseSpecView = z.infer<typeof CourseSpecSchema>;
