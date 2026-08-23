import type { StudentPortfolioVerificationSummary } from "./student-portfolio.ts";

export interface StudentPortfolioVerificationInboxItem {
  evidenceId: string;
  studentName: string;
  title: string;
  summary: string;
  role: string;
  contribution: string;
  courseLabel: string | null;
  verification: StudentPortfolioVerificationSummary;
}
