import { z } from "zod";

export const LECTURER_PORTFOLIO_ITEM_KINDS = [
  "qualification",
  "research_interest",
  "research_project",
  "publication",
  "professional_development",
  "certification",
  "membership",
  "external_profile",
  "supervision",
  "academic_service",
  "other",
] as const;
export const LecturerPortfolioItemKindSchema = z.enum(LECTURER_PORTFOLIO_ITEM_KINDS);
export type LecturerPortfolioItemKind = z.infer<typeof LecturerPortfolioItemKindSchema>;

export const LECTURER_PORTFOLIO_ITEM_LABELS: Record<LecturerPortfolioItemKind, string> = {
  qualification: "Qualifications",
  research_interest: "Research Interests",
  research_project: "Research & Projects",
  publication: "Publications",
  professional_development: "Professional Development",
  certification: "Certifications",
  membership: "Professional Memberships",
  external_profile: "External Academic Profiles",
  supervision: "Supervision",
  academic_service: "Academic Service",
  other: "Other Professional Evidence",
};

export const LECTURER_PORTFOLIO_VERIFICATION_STATUSES = [
  "self_declared",
  "verified",
  "rejected",
] as const;
export const LecturerPortfolioVerificationStatusSchema = z.enum(
  LECTURER_PORTFOLIO_VERIFICATION_STATUSES,
);
export type LecturerPortfolioVerificationStatus = z.infer<
  typeof LecturerPortfolioVerificationStatusSchema
>;

export const LECTURER_PORTFOLIO_VERIFICATION_ACTIONS = [
  "verified",
  "rejected",
  "reset",
] as const;
export const LecturerPortfolioVerificationActionSchema = z.enum(
  LECTURER_PORTFOLIO_VERIFICATION_ACTIONS,
);
export type LecturerPortfolioVerificationAction = z.infer<
  typeof LecturerPortfolioVerificationActionSchema
>;

export const LECTURER_EVIDENCE_PERIOD_CONTEXTS = [
  "prior_to_dse",
  "during_dse",
  "unclassified",
] as const;
export const LecturerEvidencePeriodContextSchema = z.enum(LECTURER_EVIDENCE_PERIOD_CONTEXTS);
export type LecturerEvidencePeriodContext = z.infer<typeof LecturerEvidencePeriodContextSchema>;

/** Reporting classification is derived from dates, never manually authored. */
export function classifyLecturerEvidencePeriod(
  evidenceDate: string | null | undefined,
  programmeStartDate: string | null | undefined,
): LecturerEvidencePeriodContext {
  if (!evidenceDate || !programmeStartDate) return "unclassified";
  return evidenceDate < programmeStartDate ? "prior_to_dse" : "during_dse";
}

const DateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .nullable();

const OptionalHttpUrlSchema = z
  .union([z.literal(""), z.string().trim().url().refine((value) => /^https?:\/\//i.test(value), "Use an http(s) URL")])
  .default("");

const PortfolioItemShape = z.object({
  kind: LecturerPortfolioItemKindSchema,
  title: z.string().trim().min(1, "Title is required").max(300),
  organization: z.string().trim().max(300).default(""),
  description: z.string().trim().max(4000).default(""),
  role: z.string().trim().max(300).default(""),
  identifier: z.string().trim().max(300).default(""),
  url: OptionalHttpUrlSchema,
  startDate: DateOnlySchema.default(null),
  endDate: DateOnlySchema.default(null),
  tags: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  isPublic: z.boolean().default(false),
  isFeatured: z.boolean().default(false),
});

function refineDateOrder(
  data: { startDate?: string | null; endDate?: string | null },
  ctx: z.RefinementCtx,
): void {
  if (data.startDate && data.endDate && data.endDate < data.startDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["endDate"],
      message: "End date must be on or after start date",
    });
  }
}

export const CreateLecturerPortfolioItemInput = PortfolioItemShape.strict().superRefine(
  refineDateOrder,
);
export type CreateLecturerPortfolioItemInput = z.infer<
  typeof CreateLecturerPortfolioItemInput
>;

export const UpdateLecturerPortfolioItemInput = PortfolioItemShape.partial()
  .strict()
  .superRefine(refineDateOrder);
export type UpdateLecturerPortfolioItemInput = z.infer<
  typeof UpdateLecturerPortfolioItemInput
>;

export const ReviewLecturerPortfolioItemInput = z
  .object({
    action: z.enum(["verified", "rejected"]),
    note: z.string().trim().max(2000).default(""),
  })
  .strict();
export type ReviewLecturerPortfolioItemInput = z.infer<
  typeof ReviewLecturerPortfolioItemInput
>;

export interface LecturerPortfolioVerificationEvent {
  id: string;
  action: LecturerPortfolioVerificationAction;
  note: string;
  actor: { id: string; name: string };
  createdAt: string;
}

export interface LecturerPortfolioItem {
  id: string;
  lecturerId: string;
  kind: LecturerPortfolioItemKind;
  title: string;
  organization: string;
  description: string;
  role: string;
  identifier: string;
  url: string;
  startDate: string | null;
  endDate: string | null;
  tags: string[];
  isPublic: boolean;
  isFeatured: boolean;
  verificationStatus: LecturerPortfolioVerificationStatus;
  createdAt: string;
  updatedAt: string;
  verificationEvents: LecturerPortfolioVerificationEvent[];
}

export interface LecturerPortfolioCanonicalEvidence {
  id: string;
  category: "teaching" | "supervision" | "academic_service";
  title: string;
  detail: string;
  period: string | null;
  sourceDomain: "Offering" | "PMS";
  sourceEntityType: string;
  sourceEntityId: string;
  authoritative: true;
}

export interface LecturerAunQaEvidenceItem {
  id: string;
  category: string;
  title: string;
  detail: string;
  source: string;
  sourceEntityId: string | null;
  verification: "authoritative_pms" | "verified_professional" | "self_declared";
  periodContext: LecturerEvidencePeriodContext;
}

export interface LecturerAunQaEvidenceExport {
  schemaVersion: "lecturer-aun-qa-evidence-v1";
  generatedAt: string;
  lecturer: {
    id: string;
    name: string;
    academicPosition: string | null;
    qualification: string | null;
    employmentType: string | null;
    fieldOfSpecialization: string | null;
    yearsOfExperience: number | null;
    programmeStartDate: string | null;
  };
  evidence: LecturerAunQaEvidenceItem[];
  note: string;
}
