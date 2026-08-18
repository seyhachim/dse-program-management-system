import { z } from "zod";
import type { MeetingActivityType, MeetingDay } from "./offerings.ts";

export interface PortalLecturer {
  id: string;
  name: string;
  email: string;
  title: string | null;
}

export interface PortalMeeting {
  id: string;
  dayOfWeek: MeetingDay;
  startTime: string;
  endTime: string;
  room: string | null;
  activityType: MeetingActivityType;
}

export interface PortalCriterionEvidence {
  assessmentItemId: string;
  rubricId: string;
  criterionId: string;
  criterionName: string;
  score: number;
  maxScore: number;
  rawPercentage: number;
  rubricLevelLabel: string | null;
  rubricContentHash: string;
  cloCodes: string[];
}

export interface PortalRubricCriterion {
  id: string;
  name: string;
  cloCodes: string[];
  levels: Array<{ id: string; label: string; points: number }>;
}

export interface PortalAssessmentResult {
  assessmentItemId: string;
  score: number;
  maxScore: number;
  percentage: number;
  weightedCourseContribution: number | null;
  feedback: string;
  publishedAt: string;
  criterionEvidence: PortalCriterionEvidence[];
}

export type CloAchievementStatus =
  | "achieved"
  | "developing"
  | "needs-attention"
  | "not-enough-evidence";

export interface PortalCloAchievement {
  code: string;
  description: string;
  percentage: number | null;
  status: CloAchievementStatus;
  evidenceCount: number;
  evidence: Array<{
    assessmentItemId: string;
    assessmentName: string;
    rawPercentage: number;
    source: "assessment" | "criterion";
    rubricId?: string;
    criterionId?: string;
    criterionName?: string;
    score?: number;
    maxScore?: number;
    rubricContentHash?: string;
  }>;
}

export interface PortalCourseSummary {
  offeringId: string;
  enrollmentId: string;
  courseId: string;
  code: string;
  title: string;
  description: string | null;
  credits: number | null;
  term: string;
  sectionCode: string;
  lecturer: PortalLecturer | null;
  coLecturers: PortalLecturer[];
  meetings: PortalMeeting[];
  specAvailable: boolean;
  nextAssessment: {
    id: string;
    name: string;
    dueAt: string | null;
    dueWeek: number | null;
  } | null;
}

export interface OfferingResultAccessPolicy {
  offeringId: string;
  requireSurveyBeforeResults: boolean;
}

export interface ProvisionalResultAccess {
  requireSurveyBeforeResults: boolean;
  surveyCompleted: boolean;
  canViewProvisionalResults: boolean;
  hiddenProvisionalAssessmentCount: number;
}

export interface PortalCourseDetail extends PortalCourseSummary {
  clos: Array<{
    code: string;
    description: string;
    level: string | null;
    mappedPlos: string[];
  }>;
  weeks: Array<{
    id: string;
    week: number;
    topic: string;
    cloCodes: string[];
    learningOutcomes: string[];
    activities: string[];
  }>;
  assessments: Array<{
    id: string;
    name: string;
    type: string;
    description: string;
    mode: "individual" | "group";
    cloCodes: string[];
    weight: number | null;
    countsTowardGrade: boolean;
    courseGradeWeight: number | null;
    dueAt: string | null;
    dueWeek: number | null;
    format: string;
    submissionMethod: string;
    instructions: string;
    rubricName: string;
    rubricCriteria?: PortalRubricCriterion[];
    result: PortalAssessmentResult | null;
  }>;
  resources: Array<{
    id: string;
    resourceType: string;
    title: string;
    url: string;
    notes: string;
  }>;
  totalCourseGrade: number | null;
  courseGradeComplete: boolean;
  completedGradeWeight: number;
  configuredGradeWeight: number;
  achievements: PortalCloAchievement[];
  overallAchievement: number | null;
  feedbackSubmitted: boolean;
  provisionalResultAccess?: ProvisionalResultAccess;
}

export interface PortalAnnouncement {
  id: string;
  offeringId: string;
  courseCode: string;
  courseTitle: string;
  sectionCode: string;
  title: string;
  body: string;
  pinned: boolean;
  authorName: string;
  publishedAt: string;
}

export interface StudentPortalHome {
  student: { id: string; name: string; studentId: string; email: string };
  courses: PortalCourseSummary[];
  upcomingAssessments: Array<{
    offeringId: string;
    courseCode: string;
    assessmentId: string;
    name: string;
    dueAt: string | null;
    dueWeek: number | null;
    weight: number | null;
  }>;
  announcements: PortalAnnouncement[];
  overallAchievement: number | null;
}

export const STUDENT_PORTAL_TIME_ZONE = "Asia/Phnom_Penh" as const;

export interface PortalAssessmentOverview {
  offeringId: string;
  courseCode: string;
  courseTitle: string;
  sectionCode: string;
  term: string;
  assessmentId: string;
  name: string;
  type: string;
  description: string;
  mode: "individual" | "group";
  cloCodes: string[];
  weight: number | null;
  dueAt: string | null;
  dueWeek: number | null;
  format: string;
  submissionMethod: string;
  instructions: string;
  rubricName: string;
  rubricCriteria: PortalRubricCriterion[];
}

export interface PortalCourseDocumentDownload {
  fileName: string;
  contentType: "text/html; charset=utf-8";
  content: string;
}

export type PortalAssessmentDeadlineState = "overdue" | "upcoming" | "week-only" | "unscheduled";

export function portalAssessmentDeadlineState(
  assessment: Pick<PortalAssessmentOverview, "dueAt" | "dueWeek">,
  now = new Date(),
): PortalAssessmentDeadlineState {
  if (assessment.dueAt) {
    return new Date(assessment.dueAt).getTime() < now.getTime() ? "overdue" : "upcoming";
  }
  return assessment.dueWeek !== null ? "week-only" : "unscheduled";
}

export function comparePortalAssessmentDeadlines(
  left: Pick<PortalAssessmentOverview, "dueAt" | "dueWeek" | "courseCode" | "name">,
  right: Pick<PortalAssessmentOverview, "dueAt" | "dueWeek" | "courseCode" | "name">,
): number {
  if (left.dueAt && right.dueAt) {
    const exact = left.dueAt.localeCompare(right.dueAt);
    if (exact !== 0) return exact;
  } else if (left.dueAt) {
    return -1;
  } else if (right.dueAt) {
    return 1;
  } else if (left.dueWeek !== null && right.dueWeek !== null) {
    const week = left.dueWeek - right.dueWeek;
    if (week !== 0) return week;
  } else if (left.dueWeek !== null) {
    return -1;
  } else if (right.dueWeek !== null) {
    return 1;
  }

  const course = left.courseCode.localeCompare(right.courseCode);
  return course !== 0 ? course : left.name.localeCompare(right.name);
}

export const CourseFeedbackInput = z.object({
  overallRating: z.coerce.number().int().min(1).max(5),
  teachingClarityRating: z.coerce.number().int().min(1).max(5),
  assessmentClarityRating: z.coerce.number().int().min(1).max(5),
  workload: z.enum(["light", "appropriate", "heavy"]),
  positiveComment: z.string().trim().max(2000).default(""),
  improvementComment: z.string().trim().max(2000).default(""),
});
export type CourseFeedbackInput = z.infer<typeof CourseFeedbackInput>;

export const PublishAnnouncementInput = z.object({
  offeringId: z.string().uuid(),
  title: z.string().trim().min(1).max(160),
  body: z.string().trim().min(1).max(10000),
  pinned: z.boolean().default(false),
});
export type PublishAnnouncementInput = z.infer<typeof PublishAnnouncementInput>;

export const SetOfferingResultAccessPolicyInput = z.object({
  requireSurveyBeforeResults: z.boolean(),
});
export type SetOfferingResultAccessPolicyInput = z.infer<typeof SetOfferingResultAccessPolicyInput>;

/** Save one lecturer-entered assessment result without making it student-visible. */
export const SaveAssessmentResultInput = z.object({
  enrollmentId: z.string().uuid(),
  assessmentItemId: z.string().min(1),
  score: z.coerce.number().min(0),
  maxScore: z.coerce.number().positive(),
  feedback: z.string().trim().max(5000).default(""),
}).refine((value) => value.score <= value.maxScore, {
  message: "Score cannot exceed maximum score",
  path: ["score"],
});
export type SaveAssessmentResultInput = z.infer<typeof SaveAssessmentResultInput>;

/** Replace the private criterion-score set for one draft whole-assessment result. */
export const SaveAssessmentCriterionScoresInput = z.object({
  enrollmentId: z.string().uuid(),
  assessmentItemId: z.string().min(1),
  scores: z.array(z.object({
    criterionId: z.string().min(1),
    score: z.coerce.number().min(0),
    rubricLevelId: z.string().nullable().optional(),
  })),
});
export type SaveAssessmentCriterionScoresInput = z.infer<typeof SaveAssessmentCriterionScoresInput>;

/** Explicitly publish every complete draft row for one assessment in one offering. */
export const PublishAssessmentResultsInput = z.object({
  offeringId: z.string().uuid(),
  assessmentItemId: z.string().min(1),
});
export type PublishAssessmentResultsInput = z.infer<typeof PublishAssessmentResultsInput>;

/** Finalize one fully-published assessment result set as the official locked state. */
export const FinalizeAssessmentResultsInput = z.object({
  offeringId: z.string().uuid(),
  assessmentItemId: z.string().min(1),
});
export type FinalizeAssessmentResultsInput = z.infer<typeof FinalizeAssessmentResultsInput>;

/** Apply one controlled correction to an already-finalized result. */
export const CorrectFinalizedAssessmentResultInput = z.object({
  assessmentResultId: z.string().uuid(),
  score: z.coerce.number().min(0),
  maxScore: z.coerce.number().positive(),
  feedback: z.string().trim().max(5000).default(""),
  reason: z.string().trim().min(1, "A correction reason is required").max(2000),
  expectedUpdatedAt: z.string().datetime(),
}).refine((value) => value.score <= value.maxScore, {
  message: "Score cannot exceed maximum score",
  path: ["score"],
});
export type CorrectFinalizedAssessmentResultInput = z.infer<typeof CorrectFinalizedAssessmentResultInput>;

export interface PublishAssessmentResultsResponse {
  offeringId: string;
  assessmentItemId: string;
  publishedCount: number;
  previouslyPublishedCount: number;
  publishedAt: string;
  publishedById: string;
}

export interface FinalizeAssessmentResultsResponse {
  offeringId: string;
  assessmentItemId: string;
  finalizedCount: number;
  finalizedAt: string;
  finalizedById: string;
}

export interface CorrectFinalizedAssessmentResultResponse {
  assessmentResultId: string;
  correctionId: string;
  score: number;
  maxScore: number;
  feedback: string;
  correctedAt: string;
  correctedById: string;
  updatedAt: string;
}

/** @deprecated Use SaveAssessmentResultInput. Kept temporarily for source compatibility. */
export const PublishAssessmentResultInput = SaveAssessmentResultInput;
export type PublishAssessmentResultInput = SaveAssessmentResultInput;

export const SetAssessmentDeadlineInput = z.object({
  offeringId: z.string().uuid(),
  assessmentItemId: z.string().min(1),
  dueAt: z.string().datetime(),
});
export type SetAssessmentDeadlineInput = z.infer<typeof SetAssessmentDeadlineInput>;

export interface CourseDeliveryRubricCriterion {
  id: string;
  name: string;
  cloCodes: string[];
  levels: Array<{ id: string; label: string; points: number }>;
}

export interface CourseDeliveryCriterionScore {
  criterionId: string;
  score: number;
  maxScore: number;
  rubricLevelId: string | null;
  rubricLevelLabel: string | null;
}

export interface CourseDeliveryResultRow {
  enrollmentId: string;
  studentId: string;
  studentCode: string;
  studentName: string;
  score: number | null;
  maxScore: number | null;
  feedback: string;
  publishedAt: string | null;
  finalizedAt: string | null;
  criterionScores: CourseDeliveryCriterionScore[];
}

export interface CourseDeliveryAssessment {
  id: string;
  name: string;
  type: string;
  weight: number | null;
  countsTowardGrade: boolean;
  courseGradeWeight: number | null;
  cloCodes: string[];
  dueWeek: number | null;
  dueAt: string | null;
  rubricId: string | null;
  rubricName: string;
  rubricContentHash: string | null;
  rubricCriteria: CourseDeliveryRubricCriterion[];
  results: CourseDeliveryResultRow[];
}

export interface CourseDeliveryAnnouncement {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  authorName: string;
  publishedAt: string | null;
}

export interface CourseFeedbackSummary {
  responseCount: number;
  minimumResponses: number;
  available: boolean;
  averages: {
    overall: number;
    teachingClarity: number;
    assessmentClarity: number;
  } | null;
  workload: {
    light: number;
    appropriate: number;
    heavy: number;
  };
  positiveComments: string[];
  improvementComments: string[];
}

export interface CourseDeliveryOffering {
  offeringId: string;
  courseId: string;
  code: string;
  title: string;
  term: string;
  sectionCode: string;
  status: string;
  specificationStatus: string | null;
  studentCount: number;
  assessments: CourseDeliveryAssessment[];
  announcements: CourseDeliveryAnnouncement[];
  feedback: CourseFeedbackSummary;
}

/** Lecturer-only calculation preview. Draft marks are included and must never be sent to student endpoints. */
export interface CourseDeliveryStudentResultReview {
  enrollmentId: string;
  studentId: string;
  studentCode: string;
  studentName: string;
  totalCourseGrade: number | null;
  courseGradeComplete: boolean;
  completedGradeWeight: number;
  configuredGradeWeight: number;
  achievements: PortalCloAchievement[];
  overallAchievement: number | null;
}

export interface CourseDeliveryResultReview {
  offeringId: string;
  courseSpecId: string;
  courseCode: string;
  courseTitle: string;
  sectionCode: string;
  rows: CourseDeliveryStudentResultReview[];
}
