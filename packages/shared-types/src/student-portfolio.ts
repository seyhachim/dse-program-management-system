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
  url: z.string().trim().max(2048).refine(safeHttpUrl, "Use a valid http or https URL"),
});
export type StudentPortfolioArtifactLinkInput = z.infer<typeof StudentPortfolioArtifactLinkInput>;

const PortfolioDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD").nullable().default(null);

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
  links: z
    .array(StudentPortfolioArtifactLinkInput)
    .max(8)
    .default([])
    .transform((items) => {
      const seen = new Set<string>();
      return items.filter((item) => {
        const key = `${item.kind}:${item.url}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }),
};

function validateEvidenceDates(value: { startDate: string | null; endDate: string | null }, ctx: z.RefinementCtx) {
  if (value.startDate && value.endDate && value.endDate < value.startDate) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endDate"], message: "End date cannot be before start date" });
  }
}

export const StudentPortfolioCourseAssessmentSourceInput = z.object({
  type: z.literal("course_assessment"),
  offeringId: z.string().uuid(),
  assessmentItemId: z.string().trim().min(1).max(100),
});
export type StudentPortfolioCourseAssessmentSourceInput = z.infer<typeof StudentPortfolioCourseAssessmentSourceInput>;

export const StudentPortfolioEvidenceCreateInput = z
  .object({
    origin: StudentPortfolioEvidenceOrigin,
    ...evidencePresentationShape,
    source: StudentPortfolioCourseAssessmentSourceInput.nullable().default(null),
  })
  .superRefine((value, ctx) => {
    validateEvidenceDates(value, ctx);
    if (value.origin === "course_assessment" && !value.source) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["source"], message: "Course assessment evidence requires an eligible PMS source" });
    }
    if (value.origin !== "course_assessment" && value.source) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["source"], message: "Only course assessment evidence can carry a PMS assessment source" });
    }
  });
export type StudentPortfolioEvidenceCreateInput = z.infer<typeof StudentPortfolioEvidenceCreateInput>;

export const StudentPortfolioEvidenceUpdateInput = z.object(evidencePresentationShape).superRefine(validateEvidenceDates);
export type StudentPortfolioEvidenceUpdateInput = z.infer<typeof StudentPortfolioEvidenceUpdateInput>;

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

export const StudentPortfolioProfessionalProvider = z.enum([
  "github",
  "gitlab",
  "linkedin",
  "kaggle",
  "hugging_face",
  "website",
  "orcid",
  "google_scholar",
  "research_gate",
  "coding_practice",
  "bi_profile",
  "cv",
  "other",
]);
export type StudentPortfolioProfessionalProvider = z.infer<typeof StudentPortfolioProfessionalProvider>;

const PROVIDER_HOSTS: Partial<Record<StudentPortfolioProfessionalProvider, string[]>> = {
  github: ["github.com"],
  gitlab: ["gitlab.com"],
  linkedin: ["linkedin.com", "www.linkedin.com"],
  kaggle: ["kaggle.com", "www.kaggle.com"],
  hugging_face: ["huggingface.co"],
  orcid: ["orcid.org"],
  google_scholar: ["scholar.google.com"],
  research_gate: ["researchgate.net", "www.researchgate.net"],
};

function validProviderUrl(provider: StudentPortfolioProfessionalProvider, value: string): boolean {
  if (!safeHttpUrl(value)) return false;
  const hosts = PROVIDER_HOSTS[provider];
  if (!hosts) return true;
  const host = new URL(value).hostname.toLowerCase();
  return hosts.includes(host);
}

export const StudentPortfolioProfessionalLinkInput = z
  .object({
    provider: StudentPortfolioProfessionalProvider,
    label: z.string().trim().max(80).default(""),
    url: z.string().trim().max(2048),
    visibility: StudentPortfolioVisibility.default("private"),
  })
  .superRefine((value, ctx) => {
    if (!validProviderUrl(value.provider, value.url)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["url"], message: "Use a valid public URL for the selected provider" });
    }
  });
export type StudentPortfolioProfessionalLinkInput = z.infer<typeof StudentPortfolioProfessionalLinkInput>;

export interface StudentPortfolioProfessionalLink extends StudentPortfolioProfessionalLinkInput {
  id: string;
  status: "added";
  createdAt: string;
  updatedAt: string;
}

export const StudentPortfolioVerificationState = z.enum(["unverified", "verified", "needs_changes", "revoked"]);
export type StudentPortfolioVerificationState = z.infer<typeof StudentPortfolioVerificationState>;
export const StudentPortfolioVerificationContext = z.enum(["lecturer", "supervisor", "system"]);
export type StudentPortfolioVerificationContext = z.infer<typeof StudentPortfolioVerificationContext>;

export const StudentPortfolioVerificationDecisionInput = z.object({
  state: z.enum(["verified", "needs_changes", "revoked"]),
  reason: z.string().trim().max(1000).default(""),
}).superRefine((value, ctx) => {
  if ((value.state === "needs_changes" || value.state === "revoked") && !value.reason) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["reason"], message: "A reason is required for this verification decision" });
  }
});
export type StudentPortfolioVerificationDecisionInput = z.infer<typeof StudentPortfolioVerificationDecisionInput>;

export interface StudentPortfolioVerificationEvent {
  id: string;
  previousState: StudentPortfolioVerificationState;
  newState: StudentPortfolioVerificationState;
  actorContext: StudentPortfolioVerificationContext;
  actorName: string | null;
  reason: string;
  createdAt: string;
}

export interface StudentPortfolioVerificationSummary {
  state: StudentPortfolioVerificationState;
  context: StudentPortfolioVerificationContext | null;
  verifiedAt: string | null;
  actorName: string | null;
}

export const StudentPortfolioSupervisorRelationshipInput = z.object({
  studentRecordId: z.string().uuid(),
  supervisorUserId: z.string().uuid(),
});
export type StudentPortfolioSupervisorRelationshipInput = z.infer<typeof StudentPortfolioSupervisorRelationshipInput>;

export const StudentPortfolioSoftSkillCode = z.enum([
  "teamwork",
  "communication",
  "leadership",
  "problem_solving",
  "presentation",
  "professionalism",
  "adaptability",
  "time_management",
]);
export type StudentPortfolioSoftSkillCode = z.infer<typeof StudentPortfolioSoftSkillCode>;

export const STUDENT_PORTFOLIO_SOFT_SKILLS: ReadonlyArray<{ code: StudentPortfolioSoftSkillCode; name: string; description: string }> = [
  { code: "teamwork", name: "Teamwork", description: "Collaborates effectively and contributes reliably to shared outcomes." },
  { code: "communication", name: "Communication", description: "Communicates technical and professional ideas clearly to appropriate audiences." },
  { code: "leadership", name: "Leadership", description: "Coordinates people and work responsibly toward shared goals." },
  { code: "problem_solving", name: "Problem Solving", description: "Frames problems, evaluates options, and develops workable solutions." },
  { code: "presentation", name: "Presentation", description: "Presents work and evidence clearly in written, visual, and oral forms." },
  { code: "professionalism", name: "Professionalism", description: "Demonstrates reliability, ethics, accountability, and professional conduct." },
  { code: "adaptability", name: "Adaptability", description: "Responds constructively to changing requirements, tools, or contexts." },
  { code: "time_management", name: "Time Management", description: "Plans and delivers work within agreed priorities and deadlines." },
];

export const StudentPortfolioSoftSkillMappingInput = z.object({
  skillCodes: z.array(StudentPortfolioSoftSkillCode).max(STUDENT_PORTFOLIO_SOFT_SKILLS.length).default([]).transform((items) => [...new Set(items)]),
});
export type StudentPortfolioSoftSkillMappingInput = z.infer<typeof StudentPortfolioSoftSkillMappingInput>;

export interface StudentPortfolioEvidenceSummary {
  id: string;
  title: string;
  origin: StudentPortfolioEvidenceOrigin;
  public: boolean;
  sourceLabel: string | null;
  verification: StudentPortfolioVerificationSummary;
}

export interface StudentPortfolioSoftSkillSummary {
  code: StudentPortfolioSoftSkillCode;
  name: string;
  description: string;
  evidenceCount: number;
  verifiedExperienceCount: number;
  status: "not_yet_evidenced" | "developing" | "demonstrated";
  evidence: StudentPortfolioEvidenceSummary[];
}

export type StudentPortfolioCompetencyStatus = "not_yet_evidenced" | "supporting" | "practiced" | "demonstrated";
export type StudentPortfolioEvidenceStrength = "supporting" | "practiced" | "demonstrated";

export interface StudentPortfolioCompetencyEvidence {
  evidenceId: string;
  evidenceTitle: string;
  courseCode: string;
  courseTitle: string;
  cloCode: string;
  ploCodes: string[];
  strength: StudentPortfolioEvidenceStrength;
  verification: StudentPortfolioVerificationSummary;
}

export interface StudentPortfolioCompetencySummary {
  competencyId: string;
  code: string;
  name: string;
  description: string | null;
  status: StudentPortfolioCompetencyStatus;
  linkedPloCodes: string[];
  ruleVersion: "portfolio-competency-v1";
  evidence: StudentPortfolioCompetencyEvidence[];
}

export interface StudentPortfolioCompletion {
  percentage: number;
  completed: string[];
  remaining: string[];
}

export interface StudentPortfolioOverview {
  profile: StudentPortfolioProfile;
  completion: StudentPortfolioCompletion;
  links: StudentPortfolioProfessionalLink[];
  featuredEvidence: StudentPortfolioEvidence[];
  softSkills: StudentPortfolioSoftSkillSummary[];
  competencies: StudentPortfolioCompetencySummary[];
}

export interface PublicStudentPortfolioEvidence {
  id: string;
  title: string;
  summary: string;
  role: string;
  contribution: string;
  startDate: string | null;
  endDate: string | null;
  skills: string[];
  featured: boolean;
  links: Array<{ kind: StudentPortfolioArtifactKind; label: string; url: string }>;
  verification: StudentPortfolioVerificationSummary;
}

export interface PublicStudentPortfolio {
  slug: string;
  name: string;
  headline: string;
  bio: string;
  careerInterests: string[];
  links: Array<{ provider: StudentPortfolioProfessionalProvider; label: string; url: string; status: "added" }>;
  evidence: PublicStudentPortfolioEvidence[];
  softSkills: StudentPortfolioSoftSkillSummary[];
  competencies: StudentPortfolioCompetencySummary[];
}
