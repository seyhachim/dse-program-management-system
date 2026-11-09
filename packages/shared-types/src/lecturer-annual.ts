import { z } from "zod";
import type { LecturerPortfolioItemKind } from "./lecturer-portfolio.ts";

export const ReviewAnnualTeachingInput = z.object({
  lecturerId: z.string().uuid(),
  offeringId: z.string().uuid(),
  verdict: z.enum(["confirmed", "not_delivered"]),
  reason: z.string().trim().min(5).max(2000),
  evidenceUrl: z.union([z.literal(""), z.string().url().refine(v => /^https?:\/\//i.test(v))]).default(""),
}).strict();
export type ReviewAnnualTeachingInput = z.infer<typeof ReviewAnnualTeachingInput>;

export const LinkAnnualEvidenceInput = z.object({
  itemId: z.string().uuid(),
}).strict();
export type LinkAnnualEvidenceInput = z.infer<typeof LinkAnnualEvidenceInput>;

const AnnualDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const AnnualHttpUrl = z.string().url().refine(v => /^https?:\/\//i.test(v), "Use an http(s) URL");
export const UpdateAnnualReportingWindowInput = z.object({
  startDate: AnnualDate, endDate: AnnualDate,
  evidenceUrl: AnnualHttpUrl,
  reason: z.string().trim().min(5).max(2000),
}).strict().refine(v => v.endDate >= v.startDate, { path: ["endDate"], message: "End must be on or after start" });
export type UpdateAnnualReportingWindowInput = z.infer<typeof UpdateAnnualReportingWindowInput>;

export const ReviewAnnualStaffInput = z.object({
  lecturerId: z.string().uuid(),
  employmentType: z.enum(["full_time","part_time","other"]),
  qualification: z.string().trim().min(1).max(500),
  evidenceUrl: AnnualHttpUrl,
  reason: z.string().trim().min(5).max(2000),
}).strict();
export type ReviewAnnualStaffInput = z.infer<typeof ReviewAnnualStaffInput>;

export const SubmitAnnualActivityInput = z.object({
  note: z.string().trim().max(1000).default(""),
}).strict();

export interface AnnualYear {
  id: string;
  label: string;
  startYear: number;
  endYear: number;
}

export interface AnnualReportingWindow {
  startDate: string;
  endDate: string;
  evidenceUrl: string;
  reviewedAt: string;
}

export type AnnualEvidenceAttribution = "in_period" | "out_of_period" | "undated" | "period_unconfigured";

export interface AnnualTeaching {
  offeringId: string;
  courseCode: string;
  courseTitle: string;
  term: string;
  sectionCode: string;
  role: "Primary Lecturer" | "Co-Lecturer" | "Recorded Delivery";
  deliveredSessions: number;
  deliveredSessionIds: string[];
  reviewId: string | null;
  verdict: "confirmed" | "not_delivered" | null;
  evidenceUrl: string;
  confirmed: boolean;
  discrepancy: boolean;
}

export interface AnnualEvidence {
  id: string;
  kind: LecturerPortfolioItemKind;
  title: string;
  identifier: string;
  organization: string;
  url: string;
  verificationStatus: "self_declared" | "verified" | "rejected";
  verifiedByEventId: string | null;
  startDate: string | null;
  endDate: string | null;
  attribution: AnnualEvidenceAttribution;
}

export interface AnnualLecturer {
  lecturerId: string;
  name: string;
  employmentType: string | null;
  qualification: string | null;
  staffSnapshotStatus: "verified" | "missing";
  staffReviewEventId: string | null;
  classification: "teaching_active" | "other_contributor" | "unconfirmed";
  submissionStatus: "submitted" | "unreported";
  teaching: AnnualTeaching[];
  evidence: AnnualEvidence[];
  verifiedActivityCount: number;
}

export interface AnnualSummary {
  schemaVersion: "annual-lecturer-v1";
  academicYear: AnnualYear;
  generatedAt: string;
  reportingWindow: AnnualReportingWindow | null;
  staff: AnnualLecturer[];
  statistics: {
    totalInRegistry: number;
    activeTeaching: number;
    otherContributors: number;
    unconfirmed: number;
    unreported: number;
    distinctPublications: number;
    verifiedCpdActivities: number;
    evidenceGaps: number;
    staffSnapshotsMissing: number;
    unattributedEvidence: number;
  };
  releaseVersion: number | null;
  notes: string[];
}
