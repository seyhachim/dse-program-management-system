import { z } from "zod";

export const ResearchAssignmentRoleSchema = z.enum([
  "LEAD_RESEARCHER",
  "CO_RESEARCHER",
  "REVIEWER",
]);
export const ResearchAssignmentStatusSchema = z.enum([
  "ASSIGNED",
  "ACCEPTED",
  "IN_PROGRESS",
  "SUBMITTED",
  "REVISION_REQUIRED",
  "COMPLETED",
]);
export const ResearchCycleStatusSchema = z.enum([
  "DRAFT",
  "PROTOCOL_REVIEW",
  "PROTOCOL_APPROVED",
  "BASELINE_LOCKED",
  "INTERVENTION_ACTIVE",
  "OBSERVATION",
  "ANALYSIS",
  "REFLECTION",
  "SUBMITTED",
  "REVISION_REQUIRED",
  "APPROVED",
  "COMPLETED",
]);
export const ResearchProtocolStatusSchema = z.enum([
  "DRAFT",
  "SUBMITTED",
  "REVISION_REQUIRED",
  "APPROVED",
]);
export const ResearchProtocolReviewActionSchema = z.enum([
  "REQUEST_REVISION",
  "APPROVE",
]);

const OptionalId = z.string().trim().min(1).max(120).optional().nullable();
const OptionalText = (max: number) => z.string().trim().max(max).optional().default("");

export const CreateResearchProjectSchema = z.object({
  programmeId: z.string().trim().min(1),
  title: z.string().trim().min(3).max(180),
  problemStatement: z.string().trim().min(20).max(6000),
  researchQuestion: z.string().trim().max(1200).optional().default(""),
  courseId: OptionalId,
  offeringId: OptionalId,
  cohortId: OptionalId,
  academicYear: z.string().trim().max(30).optional().default(""),
  semester: z.string().trim().max(30).optional().default(""),
  cloId: OptionalId,
  ploId: OptionalId,
});

export const ResearchProjectListQuerySchema = z.object({
  programmeId: z.string().trim().min(1),
});

export const CreateResearchAssignmentSchema = z.object({
  programmeId: z.string().trim().min(1),
  assigneeId: z.string().trim().min(1),
  role: ResearchAssignmentRoleSchema,
  instructions: z.string().trim().max(4000).optional().default(""),
  dueDate: z.coerce.date().optional().nullable(),
});

export const UpdateResearchAssignmentStatusSchema = z.object({
  programmeId: z.string().trim().min(1),
  status: z.enum(["ACCEPTED", "IN_PROGRESS"]),
});

export const SaveResearchProtocolSchema = z.object({
  programmeId: z.string().trim().min(1),
  practicalProblem: z.string().trim().min(20).max(6000),
  researchQuestion: z.string().trim().min(10).max(2000),
  systemBoundary: z.string().trim().min(10).max(4000),
  baselinePattern: OptionalText(5000),
  dynamicHypothesis: OptionalText(5000),
  interventionPlan: OptionalText(7000),
  expectedDelay: OptionalText(1000),
  primaryIndicators: z.array(z.string().trim().min(1).max(200)).max(30).default([]),
  secondaryIndicators: z.array(z.string().trim().min(1).max(200)).max(50).default([]),
  successCriteria: OptionalText(4000),
  comparisonDesign: OptionalText(4000),
  dataSources: z.array(z.string().trim().min(1).max(500)).max(50).default([]),
  analysisPlan: OptionalText(7000),
  fidelityPlan: OptionalText(5000),
  ethicsPrivacyStatus: OptionalText(2000),
  validityRisks: OptionalText(5000),
  plannedReflectionDate: z.coerce.date().optional().nullable(),
});

export const ResearchScopeSchema = z.object({
  programmeId: z.string().trim().min(1),
});

export const ReviewResearchProtocolSchema = z.object({
  programmeId: z.string().trim().min(1),
  action: ResearchProtocolReviewActionSchema,
  comment: z.string().trim().min(3).max(5000),
});

export const LockResearchBaselineSchema = z.object({
  programmeId: z.string().trim().min(1),
  baselineStart: z.coerce.date(),
  baselineEnd: z.coerce.date(),
  indicatorDefinitions: z.array(z.object({
    key: z.string().trim().min(1).max(200),
    label: z.string().trim().min(1).max(300),
    unit: z.string().trim().max(80).optional().default(""),
    denominator: z.number().int().nonnegative().optional().nullable(),
    sourceRef: z.string().trim().min(1).max(500),
    value: z.number().optional().nullable(),
  })).min(1).max(100),
}).refine((value) => value.baselineEnd >= value.baselineStart, {
  message: "Baseline end must be on or after baseline start",
  path: ["baselineEnd"],
});

export type ResearchAssignmentRole = z.infer<typeof ResearchAssignmentRoleSchema>;
export type ResearchAssignmentStatus = z.infer<typeof ResearchAssignmentStatusSchema>;
export type ResearchCycleStatus = z.infer<typeof ResearchCycleStatusSchema>;
export type ResearchProtocolStatus = z.infer<typeof ResearchProtocolStatusSchema>;
export type CreateResearchProjectInput = z.infer<typeof CreateResearchProjectSchema>;
export type CreateResearchAssignmentInput = z.infer<typeof CreateResearchAssignmentSchema>;
export type SaveResearchProtocolInput = z.infer<typeof SaveResearchProtocolSchema>;
export type ReviewResearchProtocolInput = z.infer<typeof ReviewResearchProtocolSchema>;
export type LockResearchBaselineInput = z.infer<typeof LockResearchBaselineSchema>;

export interface ResearchAssignmentView {
  id: string;
  projectId: string;
  assigneeId: string;
  assigneeName: string;
  assignedById: string;
  role: ResearchAssignmentRole;
  instructions: string;
  dueDate: string | null;
  acceptedAt: string | null;
  status: ResearchAssignmentStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ResearchProtocolView {
  id: string;
  cycleId: string;
  version: number;
  status: ResearchProtocolStatus;
  practicalProblem: string;
  researchQuestion: string;
  systemBoundary: string;
  baselinePattern: string;
  dynamicHypothesis: string;
  interventionPlan: string;
  expectedDelay: string;
  primaryIndicators: string[];
  secondaryIndicators: string[];
  successCriteria: string;
  comparisonDesign: string;
  dataSources: string[];
  analysisPlan: string;
  fidelityPlan: string;
  ethicsPrivacyStatus: string;
  validityRisks: string;
  plannedReflectionDate: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
  createdById: string;
  reviewedById: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ResearchBaselineLockView {
  id: string;
  cycleId: string;
  protocolId: string;
  baselineStart: string;
  baselineEnd: string;
  snapshot: z.infer<typeof LockResearchBaselineSchema>["indicatorDefinitions"];
  lockedById: string;
  lockedAt: string;
}

export interface ResearchCycleView {
  id: string;
  projectId: string;
  cycleNumber: number;
  status: ResearchCycleStatus;
  systemBoundary: string;
  dynamicHypothesis: string;
  baselineStart: string | null;
  baselineEnd: string | null;
  currentProtocol: ResearchProtocolView | null;
  baselineLock: ResearchBaselineLockView | null;
  createdAt: string;
  updatedAt: string;
}

export interface ResearchProjectView {
  id: string;
  programmeId: string;
  title: string;
  problemStatement: string;
  researchQuestion: string;
  courseId: string | null;
  offeringId: string | null;
  cohortId: string | null;
  academicYear: string;
  semester: string;
  cloId: string | null;
  ploId: string | null;
  status: string;
  createdById: string;
  currentCycle: ResearchCycleView | null;
  assignments: ResearchAssignmentView[];
  createdAt: string;
  updatedAt: string;
}

export interface MyActionResearchView {
  assignments: Array<ResearchAssignmentView & {
    project: Pick<ResearchProjectView, "id" | "programmeId" | "title" | "problemStatement" | "academicYear" | "semester">;
    currentStage: ResearchCycleStatus;
    nextAction: string;
    overdue: boolean;
  }>;
  counts: {
    assigned: number;
    inProgress: number;
    needsRevision: number;
    awaitingReview: number;
    completed: number;
  };
}
