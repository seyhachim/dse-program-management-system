import { z } from "zod";

export const OpportunityKind = z.enum([
  "scholarship", "competition", "internship", "fellowship", "exchange",
  "hackathon", "research", "training", "conference", "grant", "career", "other",
]);
export type OpportunityKind = z.infer<typeof OpportunityKind>;
export const OpportunityStatus = z.enum(["Draft", "Published", "Archived"]);
export type OpportunityStatus = z.infer<typeof OpportunityStatus>;
export const OpportunityOutcome = z.enum(["Winner", "Finalist", "Participant"]);
export type OpportunityOutcome = z.infer<typeof OpportunityOutcome>;

const httpsUrl = z.string().url().max(2048).refine((value) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      && !url.hostname.endsWith(".local");
  } catch {
    return false;
  }
}, "Use an official HTTPS URL without credentials or localhost");

export const OpportunityDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(value + "T00:00:00.000Z");
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}, "Use a valid YYYY-MM-DD date");

export const CreateOpportunityInput = z.object({
  programmeId: z.string().min(1).max(80).default("dse"),
  type: OpportunityKind,
  title: z.string().trim().min(5).max(180),
  organizer: z.string().trim().min(2).max(180),
  summary: z.string().trim().min(10).max(3000),
  eligibility: z.string().trim().min(5).max(2000),
  sourceUrl: httpsUrl,
  applicationUrl: httpsUrl.nullable().default(null),
  deadline: OpportunityDate.nullable().default(null),
}).strict();
export type CreateOpportunityInput = z.infer<typeof CreateOpportunityInput>;

export const SubmitOpportunityExperienceInput = z.object({
  evidenceId: z.string().uuid(),
  outcome: OpportunityOutcome,
  consent: z.literal(true),
}).strict();
export type SubmitOpportunityExperienceInput = z.infer<typeof SubmitOpportunityExperienceInput>;

export interface OpportunityView {
  id: string;
  programmeId: string;
  type: OpportunityKind;
  title: string;
  organizer: string;
  summary: string;
  eligibility: string;
  sourceUrl: string;
  applicationUrl: string | null;
  deadline: string | null;
  status: OpportunityStatus;
  publishedAt: string | null;
}

export interface OpportunityExperienceView {
  id: string;
  outcome: OpportunityOutcome;
  studentName: string;
  evidenceTitle: string;
  publicPortfolioSlug: string;
}

export interface OpportunityDetailView extends OpportunityView {
  experiences: OpportunityExperienceView[];
}

export interface OpportunityExperienceReviewView {
  id: string;
  opportunityId: string;
  opportunityTitle: string;
  evidenceId: string;
  outcome: OpportunityOutcome;
  status: "Pending" | "Approved" | "Hidden";
  consentedAt: string;
  publicStudent: OpportunityExperienceView | null;
}
