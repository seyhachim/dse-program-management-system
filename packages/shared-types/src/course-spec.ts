import { z } from "zod";
import { CourseTypeSchema } from "./courses.ts";
import { SemesterSchema } from "./offerings.ts";

export type SpecSectionState = "ready" | "soon";

export interface SpecSectionMeta {
  id: string;
  title: string;
  ref?: string;
  part: "Part 1" | "Part 2";
  state: SpecSectionState;
}

export const SPEC_SECTIONS: readonly SpecSectionMeta[] = [
  { id: "programme", title: "Programme", ref: "Part 1", part: "Part 1", state: "ready" },
  { id: "courseInfo", title: "Course Information", ref: "§1–13", part: "Part 2", state: "ready" },
  { id: "clos", title: "Course Learning Outcomes", ref: "§14", part: "Part 2", state: "ready" },
  { id: "assessmentPlan", title: "Course Assessment Plan", ref: "§17", part: "Part 2", state: "ready" },
  { id: "slt", title: "Weekly Plan", ref: "§18", part: "Part 2", state: "ready" },
  { id: "mapping", title: "CLO Alignment Mapping", ref: "§14–18", part: "Part 2", state: "ready" },
  { id: "resources", title: "Required Resources", ref: "§19–20", part: "Part 2", state: "ready" },
  { id: "references", title: "References / Textbooks", ref: "§20", part: "Part 2", state: "soon" },
  { id: "responsibility", title: "Student Responsibility", ref: "§21", part: "Part 2", state: "ready" },
  { id: "rubric", title: "Rubric & Rating Scale", ref: "§22", part: "Part 2", state: "soon" },
  { id: "policy", title: "Course Policy", ref: "§23", part: "Part 2", state: "ready" },
  { id: "ratingScale", title: "Rating Scale", ref: "§24", part: "Part 2", state: "soon" },
  { id: "date", title: "Date", ref: "§25", part: "Part 2", state: "soon" },
] as const;

export type SpecSectionId = (typeof SPEC_SECTIONS)[number]["id"];

export const SpecSectionStatus = z.enum(["draft", "complete"]);
export type SpecSectionStatus = z.infer<typeof SpecSectionStatus>;

export const CourseSpecReviewStatus = z.enum([
  "draft",
  "submitted",
  "underReview",
  "changesRequested",
  "resubmitted",
  "approved",
]);
export type CourseSpecReviewStatus = z.infer<typeof CourseSpecReviewStatus>;

export const CourseSpecReviewAction = z.object({
  id: z.string().uuid(),
  submissionVersion: z.number().int().nonnegative(),
  action: z.enum(["submitted", "resubmitted", "changesRequested", "approved"]),
  actorId: z.string().uuid(),
  note: z.string(),
  createdAt: z.string().datetime(),
});
export type CourseSpecReviewAction = z.infer<typeof CourseSpecReviewAction>;

export const CourseSpecReview = z.object({
  status: CourseSpecReviewStatus,
  submissionVersion: z.number().int().nonnegative(),
  submittedAt: z.string().datetime().nullable(),
  submittedById: z.string().uuid().nullable(),
  submissionNote: z.string(),
  actions: z.array(CourseSpecReviewAction),
});
export type CourseSpecReview = z.infer<typeof CourseSpecReview>;

export interface CourseSpecProgress {
  courseId: string;
  code: string;
  title: string;
  completed: number;
  total: number;
  incompleteSections: { id: SpecSectionId; title: string }[];
}

export function specCompletionPercent(
  progress: Pick<CourseSpecProgress, "completed" | "total">,
): number {
  return progress.total ? Math.round((progress.completed / progress.total) * 100) : 0;
}

export type SpecCompletionLabel = "Complete" | "In progress" | "Not started";

export function specCompletionLabel(
  progress: Pick<CourseSpecProgress, "completed" | "total">,
): SpecCompletionLabel {
  if (progress.total === 0 || progress.completed === 0) return "Not started";
  if (progress.completed === progress.total) return "Complete";
  return "In progress";
}

export type SpecAttentionLevel = "upToDate" | "itemsRemaining" | "needsAttention";

export interface SpecAttention {
  level: SpecAttentionLevel;
  items: { id: SpecSectionId; title: string }[];
}

export function specAttention(progress: CourseSpecProgress): SpecAttention {
  if (progress.total > 0 && progress.completed === progress.total)
    return { level: "upToDate", items: [] };
  if (progress.completed === 0)
    return { level: "needsAttention", items: progress.incompleteSections };
  return { level: "itemsRemaining", items: progress.incompleteSections };
}

export interface LevelGuideEntry {
  code: string;
  name: string;
}

export const COGNITIVE_LEVELS: readonly LevelGuideEntry[] = [
  { code: "C1", name: "Remembering" },
  { code: "C2", name: "Understanding" },
  { code: "C3", name: "Applying" },
  { code: "C4", name: "Analyzing" },
  { code: "C5", name: "Evaluating" },
  { code: "C6", name: "Creating" },
] as const;

export const AFFECTIVE_LEVELS: readonly LevelGuideEntry[] = [
  { code: "A1", name: "Receiving" },
  { code: "A2", name: "Responding" },
  { code: "A3", name: "Valuing" },
  { code: "A4", name: "Organizing" },
  { code: "A5", name: "Internalizing" },
] as const;

export const PSYCHOMOTOR_LEVELS: readonly LevelGuideEntry[] = [
  { code: "P1", name: "Perception" },
  { code: "P2", name: "Set" },
  { code: "P3", name: "Guided Response" },
  { code: "P4", name: "Mechanism" },
  { code: "P5", name: "Complex Overt Response" },
  { code: "P6", name: "Adaptation" },
  { code: "P7", name: "Origination" },
] as const;

export const FOCUS_LEVELS: readonly { code: string; name: string; hint: string }[] = [
  { code: "F", name: "Fully", hint: "more than 50% of total SLT" },
  { code: "M", name: "Moderate", hint: "31%–50% of total SLT" },
  { code: "P", name: "Partial", hint: "less than 30% of total SLT" },
] as const;

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

export const GROUP_INDIVIDUAL: readonly { code: string; name: string }[] = [
  { code: "I", name: "Individual" },
  { code: "G", name: "Group" },
] as const;

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

export const SUBMISSION_METHODS: readonly string[] = [
  "LMS (Upload)",
  "In Class",
  "Email",
  "Printed Copy",
  "Online Quiz",
  "Live Presentation",
] as const;

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

export const PLOS: readonly { id: string; description: string }[] = [
  { id: "PLO1", description: "Apply knowledge in data science and engineering to develop appropriate solutions for real-world problems." },
  { id: "PLO2", description: "Analyze data-related problems using logical reasoning and systems thinking." },
  { id: "PLO3", description: "Utilize data science tools and technologies to develop technical solutions for practical applications." },
  { id: "PLO4", description: "Participate effectively in multicultural and multidisciplinary teams with intercultural competence and responsible citizenship." },
  { id: "PLO5", description: "Demonstrate leadership, accountability, and lifelong learning in professional practice." },
  { id: "PLO6", description: "Develop innovative and entrepreneurial data-driven solutions that support national development and cultural sustainability in Cambodia and the ASEAN region." },
  { id: "PLO7", description: "Make ethical decisions that reflect professional responsibility and awareness of social, cultural and environmental impacts." },
  { id: "PLO8", description: "Communicate ideas and findings clearly through oral, written, and visual form." },
  { id: "PLO9", description: "Utilize digital technologies and platforms to support communication, collaboration, and data-driven work." },
  { id: "PLO10", description: "Apply mathematical, logical, and statistical reasoning in data analysis and problem solving." },
] as const;

export const PLO_IDS = ["PLO1", "PLO2", "PLO3", "PLO4", "PLO5", "PLO6", "PLO7", "PLO8", "PLO9", "PLO10"] as const;
export const PloId = z.enum(PLO_IDS);
export type PloId = z.infer<typeof PloId>;

export const CAP_LEVELS: readonly LevelGuideEntry[] = [
  ...COGNITIVE_LEVELS,
  ...AFFECTIVE_LEVELS,
  ...PSYCHOMOTOR_LEVELS,
] as const;

const CAP_LEVEL_CODES = new Set(CAP_LEVELS.map((l) => l.code));
export const CapLevel = z.string().refine((v) => CAP_LEVEL_CODES.has(v), { message: "Unknown C/A/P level" });
export const FocusCode = z.enum(["F", "M", "P"]);
export type FocusCode = z.infer<typeof FocusCode>;

export const CourseInfoSection = z.object({
  courseTitle: z.string().min(1, "Course title is required"),
  courseCode: z.string().min(1, "Course code is required"),
  credits: z.coerce.number().int().min(1).max(30).nullable().optional(),
  courseType: CourseTypeSchema.nullable().optional(),
  prerequisites: z.string().optional(),
  description: z.string().optional(),
  instructorName: z.string().optional(),
  qualification: z.string().optional(),
  email: z.string().email("A valid email is required").or(z.literal("")).optional(),
  telephone: z.string().optional(),
  otherLecturers: z.string().optional(),
  semester: SemesterSchema.nullable().optional(),
  programmeYear: z.coerce.number().int().min(1).max(10).nullable().optional(),
});
export type CourseInfoSection = z.infer<typeof CourseInfoSection>;

export const PolicySection = z.object({
  attendancePreparation: z.string(),
  academicIntegrity: z.string(),
  assignmentsLateSubmission: z.string(),
  examinationRules: z.string(),
  penaltiesConsequences: z.string(),
});
export type PolicySection = z.infer<typeof PolicySection>;

export const CourseInfoInput = z.object({
  prerequisites: z.string().optional(),
  description: z.string().optional(),
});
export type CourseInfoInput = z.infer<typeof CourseInfoInput>;

export const CLO_STATUSES = ["active", "inactive"] as const;
export const CloStatus = z.enum(CLO_STATUSES);
export type CloStatus = z.infer<typeof CloStatus>;

export const CloItem = z.object({
  id: z.string().min(1),
  code: z.string().min(1),
  description: z.string().min(1, "Describe what students will be able to do"),
  level: CapLevel.nullable().optional(),
  mappedPlos: z.array(PloId).default([]),
  sltHours: z.coerce.number().int().min(0).max(1000).nullable().optional(),
  teachingMethodIds: z.array(z.string()).default([]),
  activeLearningStrategyIds: z.array(z.string()).default([]),
  assessmentMethodIds: z.array(z.string()).default([]),
  status: CloStatus.default("active"),
  notes: z.string().default(""),
});
export type CloItem = z.infer<typeof CloItem>;

export const TeachingLearningProfile = z.object({
  philosophyTags: z.array(z.string()).default([]),
  philosophyStatement: z.string().default(""),
  teachingMethodIds: z.array(z.string()).default([]),
  activeLearningStrategyIds: z.array(z.string()).default([]),
  independentLearningTypes: z.array(z.string()).default([]),
  resourceTypes: z.array(z.string()).default([]),
  technologyTypes: z.array(z.string()).default([]),
});
export type TeachingLearningProfile = z.infer<typeof TeachingLearningProfile>;

export type TeachingLearningCloSupport = Pick<CloItem, "status" | "teachingMethodIds">;

export function teachingLearningIsReady(profile: TeachingLearningProfile, clos: TeachingLearningCloSupport[]): boolean {
  const activeClos = clos.filter((clo) => clo.status === "active");
  const hasPhilosophy = profile.philosophyTags.length > 0 || profile.philosophyStatement.trim().length > 0;
  return hasPhilosophy && profile.teachingMethodIds.length > 0 && profile.activeLearningStrategyIds.length > 0 && activeClos.length > 0 && activeClos.every((clo) => clo.teachingMethodIds.length > 0);
}

export const ClosSection = z.object({ items: z.array(CloItem) });
export type ClosSection = z.infer<typeof ClosSection>;

export function cloFocusPercent(sltHours: number | null | undefined, totalSlt: number | null | undefined): number | null {
  if (!totalSlt || !sltHours) return null;
  return Math.round((sltHours / totalSlt) * 100);
}

export function cloFocusCode(percent: number | null): FocusCode | null {
  if (percent == null) return null;
  if (percent > 50) return "F";
  if (percent >= 31) return "M";
  return "P";
}

const WeekHours = z.coerce.number().min(0).max(200);

export const StudentLearningActivity = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().default(""),
  lloIds: z.array(z.string()).default([]),
});
export type StudentLearningActivity = z.infer<typeof StudentLearningActivity>;

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
  teachingMethodIds: z.array(z.string()).default([]),
  teachingResourceTypes: z.array(z.string()).default([]),
  assessmentMethodIds: z.array(z.string()).default([]),
  assessment: z.string().default(""),
});
export type WeeklyPlanRow = z.infer<typeof WeeklyPlanRow>;

export const WeeklyPlanSection = z.object({ weeks: z.array(WeeklyPlanRow).default([]) });
export type WeeklyPlanSection = z.infer<typeof WeeklyPlanSection>;

export function weekContactHours(row: { lectureHours?: number | null; tutorialHours?: number | null; practiceHours?: number | null; otherHours?: number | null }): number {
  return (row.lectureHours ?? 0) + (row.tutorialHours ?? 0) + (row.practiceHours ?? 0) + (row.otherHours ?? 0);
}

export function weekSlt(row: { lectureHours?: number | null; tutorialHours?: number | null; practiceHours?: number | null; otherHours?: number | null; selfStudyHours?: number | null }): number {
  return weekContactHours(row) + (row.selfStudyHours ?? 0);
}

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
    { lectureHours: 0, tutorialHours: 0, practiceHours: 0, otherHours: 0, selfStudyHours: 0, slt: 0 },
  );
}

export const CourseResourceItem = z.object({
  id: z.string().min(1),
  resourceType: z.string().min(1),
  title: z.string().default(""),
  url: z.union([z.literal(""), z.string().url("Enter a valid URL")]).default(""),
  notes: z.string().default(""),
  evidenceWeekIds: z.array(z.string().min(1)).default([]),
  kind: z.string().default("OTHER"),
  authors: z.string().default(""),
  publisher: z.string().default(""),
  year: z.string().default(""),
  isbn: z.string().default(""),
  basedOn: z.string().default(""),
});
export type CourseResourceItem = z.infer<typeof CourseResourceItem>;

export const ResourcesSection = z.object({ items: z.array(CourseResourceItem).default([]) });
export type ResourcesSection = z.infer<typeof ResourcesSection>;

export const StudentResponsibilityItem = z.object({
  id: z.string().min(1),
  text: z.string().trim().min(1, "A responsibility statement is required"),
});
export type StudentResponsibilityItem = z.infer<typeof StudentResponsibilityItem>;

export const StudentResponsibilitySection = z.object({ items: z.array(StudentResponsibilityItem).default([]) });
export type StudentResponsibilitySection = z.infer<typeof StudentResponsibilitySection>;

export const AssessmentType = z.enum(ASSESSMENT_TYPES);
export type AssessmentType = z.infer<typeof AssessmentType>;
export const AssessmentMode = z.enum(["individual", "group"]);
export type AssessmentMode = z.infer<typeof AssessmentMode>;
export const AssessmentStatus = z.enum(["active", "inactive"]);
export type AssessmentStatus = z.infer<typeof AssessmentStatus>;
export const AssessmentCategory = z.enum(["continuous", "final"]);
export type AssessmentCategory = z.infer<typeof AssessmentCategory>;

const AssessmentHours = z.coerce.number().min(0).max(200);

export const AssessmentItem = z.object({
  id: z.string().min(1),
  name: z.string().min(1, "An assessment name is required"),
  type: AssessmentType,
  description: z.string().default(""),
  mode: AssessmentMode.default("individual"),
  status: AssessmentStatus.default("active"),
  cloCodes: z.array(z.string()).default([]),
  weight: z.coerce.number().min(0).max(100).nullable().default(null),
  dueWeek: z.coerce.number().int().min(1).max(52).nullable().optional(),
  durationWeeks: z.coerce.number().min(0).max(52).nullable().optional(),
  assessmentCategory: AssessmentCategory.default("continuous"),
  topicNumbers: z.array(z.coerce.number().int().min(1).max(15)).default([]),
  physicalHours: AssessmentHours.nullable().default(null),
  onlineHours: AssessmentHours.nullable().default(null),
  independentHours: AssessmentHours.nullable().default(null),
  format: z.string().default(""),
  submissionMethod: z.string().default(""),
  instructions: z.string().default(""),
  rubric: z.string().default(""),
  feedbackMethod: z.string().default(""),
  feedbackTimeline: z.string().default(""),
  mappedPlos: z.array(PloId).default([]),
  notes: z.string().default(""),
});
export type AssessmentItem = z.infer<typeof AssessmentItem>;

export const AssessmentPlanSection = z.object({ items: z.array(AssessmentItem).default([]) });
export type AssessmentPlanSection = z.infer<typeof AssessmentPlanSection>;

export function assessmentPlanTotalWeight(section: AssessmentPlanSection): number {
  return section.items.filter((a) => a.status === "active").reduce((sum, a) => sum + (a.weight ?? 0), 0);
}

export function assessmentItemSlt(item: Pick<AssessmentItem, "physicalHours" | "onlineHours" | "independentHours">): number | null {
  if (item.physicalHours == null && item.onlineHours == null && item.independentHours == null) return null;
  return (item.physicalHours ?? 0) + (item.onlineHours ?? 0) + (item.independentHours ?? 0);
}

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

export const MappingComponentKind = z.enum(["week", "assessment"]);
export type MappingComponentKind = z.infer<typeof MappingComponentKind>;

export const MappingCell = z.object({
  cloCode: z.string().min(1),
  kind: MappingComponentKind,
  ref: z.string().min(1),
  strength: z.coerce.number().int().min(0).max(3),
});
export type MappingCell = z.infer<typeof MappingCell>;

export const MappingSection = z.object({ cells: z.array(MappingCell).default([]) });
export type MappingSection = z.infer<typeof MappingSection>;

export function mappingCellKey(kind: MappingComponentKind, ref: string, cloCode: string): string {
  return `${kind}:${ref}:${cloCode}`;
}

export function alignmentBand(strength: number | null | undefined) {
  if (strength == null || Number.isNaN(strength)) return null;
  const rounded = Math.max(0, Math.min(3, Math.round(strength)));
  return ALIGNMENT_STRENGTHS.find((s) => s.value === rounded) ?? null;
}

export function meanStrength(cells: readonly MappingCell[]): number | null {
  if (cells.length === 0) return null;
  const sum = cells.reduce((acc, c) => acc + c.strength, 0);
  return Math.round((sum / cells.length) * 100) / 100;
}

export function mappingOverallPercent(cells: readonly MappingCell[]): number {
  const mean = meanStrength(cells);
  return mean == null ? 0 : Math.round((mean / 3) * 100);
}

export function mappingDistribution(cells: readonly MappingCell[]): Record<0 | 1 | 2 | 3, number> {
  const dist: Record<0 | 1 | 2 | 3, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
  for (const c of cells) {
    const v = Math.max(0, Math.min(3, Math.round(c.strength))) as 0 | 1 | 2 | 3;
    dist[v] += 1;
  }
  return dist;
}

export function cloAlignmentAverages(cells: readonly MappingCell[], cloCodes: readonly string[]): { code: string; average: number | null }[] {
  return cloCodes.map((code) => ({ code, average: meanStrength(cells.filter((c) => c.cloCode === code)) }));
}

export function componentsMapped(cells: readonly MappingCell[], kind: MappingComponentKind, refs: readonly string[]): number {
  const aligned = new Set(cells.filter((c) => c.kind === kind && c.strength >= 1).map((c) => c.ref));
  return refs.filter((r) => aligned.has(r)).length;
}

export const SPEC_SECTION_SCHEMAS: Partial<Record<SpecSectionId, z.ZodTypeAny>> = {
  courseInfo: CourseInfoInput,
  clos: ClosSection,
  slt: WeeklyPlanSection,
  assessmentPlan: AssessmentPlanSection,
  mapping: MappingSection,
  resources: ResourcesSection,
  responsibility: StudentResponsibilitySection,
  policy: PolicySection,
};

export const COMPLETABLE_SPEC_SECTIONS: readonly SpecSectionMeta[] = SPEC_SECTIONS.filter((s) => s.id in SPEC_SECTION_SCHEMAS);

export const CourseSpecSchema = z.object({
  courseId: z.string().uuid(),
  data: z.record(z.string(), z.unknown()),
  status: z.record(z.string(), SpecSectionStatus),
  review: CourseSpecReview,
});
export type CourseSpecView = z.infer<typeof CourseSpecSchema>;
