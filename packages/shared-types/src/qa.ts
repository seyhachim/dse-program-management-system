import { z } from "zod";

export const AUN_QA_V4_ID = "aun-qa-programme-v4";
export const AUN_QA_V4_SOURCE_URL =
  "https://www.aunsec.org/application/files/9117/7942/9691/Guide_to_AUN-QA_Assessment_at_Programme_Level_Version_4.0.pdf";

/**
 * Concise, product-facing labels for the official AUN-QA Programme Assessment
 * v4.0 catalogue. These are navigational summaries rather than copies of the
 * guide's requirement text; the source URL remains the canonical reference.
 */
export const AUN_QA_V4_CATALOG = [
  {
    code: "1",
    title: "Expected Learning Outcomes",
    summary: "How programme and course outcomes are formulated, aligned, informed, and achieved.",
    requirements: [
      ["1.1", "Outcome formulation, institutional alignment, and communication"],
      ["1.2", "Course outcomes aligned with programme outcomes"],
      ["1.3", "Balance of generic and discipline-specific outcomes"],
      ["1.4", "Stakeholder needs reflected in expected outcomes"],
      ["1.5", "Graduate achievement of expected outcomes"],
    ],
  },
  {
    code: "2",
    title: "Programme Structure and Content",
    summary: "How curriculum content is specified, aligned, sequenced, reviewed, and communicated.",
    requirements: [
      ["2.1", "Current and accessible programme and course specifications"],
      ["2.2", "Constructive alignment of the curriculum"],
      ["2.3", "Stakeholder feedback in curriculum design"],
      ["2.4", "Clear course contribution to programme outcomes"],
      ["2.5", "Logical sequencing and integration of courses"],
      ["2.6", "Major or minor specialisation options"],
      ["2.7", "Periodic, industry-relevant curriculum review"],
    ],
  },
  {
    code: "3",
    title: "Teaching and Learning Approach",
    summary: "How educational philosophy and learning activities create active, responsible, lifelong learners.",
    requirements: [
      ["3.1", "Educational philosophy communicated and reflected in practice"],
      ["3.2", "Responsible student participation in learning"],
      ["3.3", "Active learning"],
      ["3.4", "Learning-to-learn and lifelong-learning development"],
      ["3.5", "Creativity, innovation, and entrepreneurial mindset"],
      ["3.6", "Continuous improvement and outcome alignment"],
    ],
  },
  {
    code: "4",
    title: "Student Assessment",
    summary: "How assessment is aligned, fair, transparent, timely, and continuously improved.",
    requirements: [
      ["4.1", "Varied and constructively aligned assessment methods"],
      ["4.2", "Explicit and consistently applied assessment and appeal policies"],
      ["4.3", "Clear progression and degree-completion standards"],
      ["4.4", "Valid, reliable, and fair assessment instruments"],
      ["4.5", "Measurement of course and programme outcomes"],
      ["4.6", "Timely assessment feedback"],
      ["4.7", "Continuous review and improvement of assessment"],
    ],
  },
  {
    code: "5",
    title: "Academic Staff",
    summary: "How academic staffing, workload, competence, development, and performance are managed.",
    requirements: [
      ["5.1", "Academic workforce and succession planning"],
      ["5.2", "Staff workload measurement and monitoring"],
      ["5.3", "Academic staff competence management"],
      ["5.4", "Duties aligned with qualifications and experience"],
      ["5.5", "Merit-based promotion"],
      ["5.6", "Defined rights, roles, ethics, and accountability"],
      ["5.7", "Systematic staff training and development"],
      ["5.8", "Performance management, reward, and recognition"],
    ],
  },
  {
    code: "6",
    title: "Student Support Services",
    summary: "How admissions, progress monitoring, co-curricular support, and support services meet student needs.",
    requirements: [
      ["6.1", "Clear and current admission policy and procedures"],
      ["6.2", "Planning for sufficient, quality support services"],
      ["6.3", "Student progress, performance, and workload monitoring"],
      ["6.4", "Co-curricular and employability support"],
      ["6.5", "Support staff competence and role clarity"],
      ["6.6", "Evaluation, benchmarking, and enhancement of support"],
    ],
  },
  {
    code: "7",
    title: "Facilities and Infrastructure",
    summary: "How physical, digital, safety, accessibility, and wellbeing resources support the programme.",
    requirements: [
      ["7.1", "Sufficient physical and technology resources"],
      ["7.2", "Current and available laboratories and equipment"],
      ["7.3", "Digital library provision"],
      ["7.4", "Information systems meeting staff and student needs"],
      ["7.5", "Accessible computer and network infrastructure"],
      ["7.6", "Environment, health, safety, and accessibility standards"],
      ["7.7", "Environment supporting learning, research, and wellbeing"],
      ["7.8", "Facilities support-staff competence"],
      ["7.9", "Facilities evaluation and enhancement"],
    ],
  },
  {
    code: "8",
    title: "Output and Outcomes",
    summary: "How graduate, employment, research, outcome-achievement, and satisfaction results are monitored and improved.",
    requirements: [
      ["8.1", "Completion, dropout, and time-to-graduate performance"],
      ["8.2", "Employment, entrepreneurship, and further-study outcomes"],
      ["8.3", "Research and creative-work outputs"],
      ["8.4", "Direct achievement of programme outcomes"],
      ["8.5", "Stakeholder satisfaction and benchmarking"],
    ],
  },
] as const;

export const QaCycleStatusSchema = z.enum(["draft", "active", "underReview", "closed"]);
export const QaEvidenceKindSchema = z.enum(["systemLink", "externalLink", "document"]);
export const QaEvidenceStatusSchema = z.enum(["draft", "ready", "reviewed"]);

export const CreateQaCycleSchema = z
  .object({
    programmeId: z.string().trim().min(1),
    title: z.string().trim().min(3).max(160),
    reportingStart: z.coerce.date(),
    reportingEnd: z.coerce.date(),
  })
  .refine((value) => value.reportingEnd >= value.reportingStart, {
    message: "Reporting end must be on or after reporting start",
    path: ["reportingEnd"],
  });

export const CreateQaEvidenceSchema = z
  .object({
    programmeId: z.string().trim().min(1),
    requirementCode: z.string().regex(/^\d\.\d$/),
    title: z.string().trim().min(3).max(200),
    description: z.string().trim().max(2000).default(""),
    kind: QaEvidenceKindSchema,
    sourceUrl: z.string().url().optional().or(z.literal("")),
    sourceRef: z.string().trim().max(300).optional().default(""),
    reportingPeriod: z.string().trim().max(100).optional().default(""),
    status: QaEvidenceStatusSchema.default("draft"),
  })
  .superRefine((value, ctx) => {
    if (value.kind !== "systemLink" && !value.sourceUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A URL is required for external or document evidence",
        path: ["sourceUrl"],
      });
    }
    if (value.kind === "systemLink" && !value.sourceRef) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A system reference is required for system-linked evidence",
        path: ["sourceRef"],
      });
    }
  });

export const UpsertQaSelfAssessmentSchema = z.object({
  programmeId: z.string().trim().min(1),
  rating: z.number().int().min(1).max(7).nullable(),
  narrative: z.string().trim().min(20).max(5000),
});

export type CreateQaCycleInput = z.infer<typeof CreateQaCycleSchema>;
export type CreateQaEvidenceInput = z.infer<typeof CreateQaEvidenceSchema>;
export type UpsertQaSelfAssessmentInput = z.infer<typeof UpsertQaSelfAssessmentSchema>;

export interface QaCycleView {
  id: string;
  programmeId: string;
  title: string;
  reportingStart: string;
  reportingEnd: string;
  status: z.infer<typeof QaCycleStatusSchema>;
  createdAt: string;
}

export interface QaEvidenceView {
  id: string;
  requirementCode: string;
  title: string;
  description: string;
  kind: z.infer<typeof QaEvidenceKindSchema>;
  sourceUrl: string | null;
  sourceRef: string;
  reportingPeriod: string;
  status: z.infer<typeof QaEvidenceStatusSchema>;
  createdAt: string;
}

export interface QaSelfAssessmentView {
  requirementCode: string;
  rating: number | null;
  narrative: string;
  reviewerName: string;
  updatedAt: string;
}

export interface QaCriterionProgress {
  code: string;
  title: string;
  summary: string;
  requirements: { code: string; title: string }[];
  total: number;
  evidenceCovered: number;
  rated: number;
  reviewedEvidence: number;
}

export interface QaDashboardView {
  programmeId: string;
  framework: {
    id: string;
    name: string;
    version: string;
    sourceUrl: string;
  };
  cycles: QaCycleView[];
  selectedCycle: QaCycleView | null;
  criteria: QaCriterionProgress[];
  totals: {
    requirements: number;
    evidenceCovered: number;
    rated: number;
    reviewedEvidence: number;
  };
  evidence: QaEvidenceView[];
  selfAssessments: QaSelfAssessmentView[];
}
