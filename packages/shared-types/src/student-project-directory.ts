import { z } from "zod";
import { StudentPortfolioEvidenceOrigin, StudentPortfolioVerificationState } from "./student-portfolio.ts";

/** A read-only discovery projection. It never contains private portfolio fields or grades. */
export const StudentProjectDirectoryQuery = z.object({
  programmeId: z.string().trim().min(1).max(80).optional(),
  q: z.string().trim().max(120).default(""),
  course: z.string().trim().max(30).default(""),
  cohort: z.string().trim().max(60).default(""),
  skill: z.string().trim().max(80).default(""),
  origin: StudentPortfolioEvidenceOrigin.optional(),
  verification: StudentPortfolioVerificationState.optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(48).default(12),
});
export type StudentProjectDirectoryQuery = z.infer<typeof StudentProjectDirectoryQuery>;

export interface StudentProjectDirectoryItem {
  evidenceId: string;
  title: string;
  summary: string;
  studentName: string;
  publicSlug: string;
  courseCode: string | null;
  term: string | null;
  cohortCode: string | null;
  /** Calendar year of project start, or the evidence record creation when undated. */
  projectYear: number;
  origin: z.infer<typeof StudentPortfolioEvidenceOrigin>;
  skills: string[];
  featured: boolean;
  verification: z.infer<typeof StudentPortfolioVerificationState>;
}

export interface StudentProjectDirectoryPage {
  programmeId: string;
  page: number;
  limit: number;
  total: number;
  items: StudentProjectDirectoryItem[];
}
