import { z } from "zod";

export const StudentPortfolioVisibility = z.enum(["private", "public"]);
export type StudentPortfolioVisibility = z.infer<typeof StudentPortfolioVisibility>;

const PortfolioSlug = z
  .string()
  .trim()
  .min(3)
  .max(48)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and single hyphens only");

export const StudentPortfolioProfileInput = z
  .object({
    headline: z.string().trim().max(120).default(""),
    bio: z.string().trim().max(1000).default(""),
    careerInterests: z
      .array(z.string().trim().min(1).max(80))
      .max(12)
      .default([])
      .transform((items) => [...new Set(items)]),
    visibility: StudentPortfolioVisibility.default("private"),
    publicSlug: PortfolioSlug.nullable().default(null),
  })
  .superRefine((value, ctx) => {
    if (value.visibility === "public" && !value.publicSlug) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["publicSlug"],
        message: "A public slug is required before a portfolio can be marked public",
      });
    }
  });
export type StudentPortfolioProfileInput = z.infer<typeof StudentPortfolioProfileInput>;

export interface StudentPortfolioIdentity {
  studentRecordId: string;
  studentId: string;
  name: string;
  email: string;
}

export interface StudentPortfolioProfile {
  identity: StudentPortfolioIdentity;
  headline: string;
  bio: string;
  careerInterests: string[];
  visibility: StudentPortfolioVisibility;
  publicSlug: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export const StudentPortfolioEvidenceOrigin = z.enum([
  "external_project",
  "course_assessment",
  "practicum",
  "internship",
  "final_project",
  "competition",
  "achievement",
  "other",
]);
export type StudentPortfolioEvidenceOrigin = z.infer<typeof StudentPortfolioEvidenceOrigin>;

export const StudentPortfolioArtifactKind = z.enum([
  "repository",
  "demo",
  "report",
  "presentation",
  "dataset",
  "other",
]);
export type StudentPortfolioArtifactKind = z.infer<typeof StudentPortfolioArtifactKind>;

function safeHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

export const StudentPortfolioArtifactLinkInput = z.object({
  kind: StudentPortfolioArtifactKind,
  label: z.string().trim().max(80).default(""),
  url: z
    .string()
    .trim()
    .max(2048)
    .refine(safeHttpUrl, "Use a valid http or https URL"),
});
export type StudentPortfolioArtifactLinkInput = z.infer<typeof StudentPortfolioArtifactLinkInput>;

const PortfolioDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .nullable()
  .default(null);

const evidencePresentationShape = {
  title: z.string().trim().min(1).max(160),
  summary: z.string().trim().max(1500).default(""),
  role: z.string().trim().max(120).default(""),
  contribution: z.string().trim().max(1500).default(""),
  startDate: PortfolioDate,
  endDate: PortfolioDate,
  skills: z
    .array(z.string().trim().min(1).max(80))
    .max(20)
    .default([])
    .transform((items) => [...new Set(items)]),
  visibility: StudentPortfolioVisibility.default("private"),
  featured: z.boolean().default(false),
  links: z.array(StudentPortfolioArtifactLinkInput).max(8).default([]),
};

function validateEvidenceDates(
  value: { startDate: string | null; endDate: string | null },
  ctx: z.RefinementCtx,
) {
  if (value.startDate && value.endDate && value.endDate < value.startDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["endDate"],
      message: "End date cannot be before start date",
    });
  }
}

export const StudentPortfolioCourseAssessmentSourceInput = z.object({
  type: z.literal("course_assessment"),
  offeringId: z.string().uuid(),
  assessmentItemId: z.string().trim().min(1).max(100),
});
export type StudentPortfolioCourseAssessmentSourceInput = z.infer<
  typeof StudentPortfolioCourseAssessmentSourceInput
>;

export const StudentPortfolioEvidenceCreateInput = z
  .object({
    origin: StudentPortfolioEvidenceOrigin,
    ...evidencePresentationShape,
    source: StudentPortfolioCourseAssessmentSourceInput.nullable().default(null),
  })
  .superRefine((value, ctx) => {
    validateEvidenceDates(value, ctx);
    if (value.origin === "course_assessment" && !value.source) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["source"],
        message: "Course assessment evidence requires an eligible PMS source",
      });
    }
    if (value.origin !== "course_assessment" && value.source) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["source"],
        message: "Only course assessment evidence can carry a PMS assessment source",
      });
    }
  });
export type StudentPortfolioEvidenceCreateInput = z.infer<
  typeof StudentPortfolioEvidenceCreateInput
>;

export const StudentPortfolioEvidenceUpdateInput = z
  .object(evidencePresentationShape)
  .superRefine(validateEvidenceDates);
export type StudentPortfolioEvidenceUpdateInput = z.infer<
  typeof StudentPortfolioEvidenceUpdateInput
>;

export interface StudentPortfolioArtifactLink {
  id: string;
  kind: StudentPortfolioArtifactKind;
  label: string;
  url: string;
}

export interface StudentPortfolioEvidenceSource {
  type: "course_assessment";
  offeringId: string;
  courseSpecId: string;
  assessmentItemId: string;
  available: boolean;
  courseCode: string | null;
  courseTitle: string | null;
  term: string | null;
  sectionCode: string | null;
  assessmentName: string | null;
  assessmentType: string | null;
}

export interface StudentPortfolioEvidence {
  id: string;
  origin: StudentPortfolioEvidenceOrigin;
  title: string;
  summary: string;
  role: string;
  contribution: string;
  startDate: string | null;
  endDate: string | null;
  skills: string[];
  visibility: StudentPortfolioVisibility;
  featured: boolean;
  links: StudentPortfolioArtifactLink[];
  source: StudentPortfolioEvidenceSource | null;
  createdAt: string;
  updatedAt: string;
}

export interface StudentPortfolioEligibleAssessmentSource {
  type: "course_assessment";
  offeringId: string;
  courseSpecId: string;
  assessmentItemId: string;
  courseCode: string;
  courseTitle: string;
  term: string;
  sectionCode: string;
  assessmentName: string;
  assessmentType: string;
}
