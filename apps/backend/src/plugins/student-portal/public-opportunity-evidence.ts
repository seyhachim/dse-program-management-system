import { prisma } from "../../core/db/prisma.ts";
import { studentPortfolioVerificationService } from "./portfolio-verification.ts";

/**
 * Narrow privacy-safe cross-plugin contract for Student Opportunities.
 * Never returns private academic records or trusts student-authored winner labels.
 * Rechecked on every display/approval, so unpublishing or revocation fails closed.
 */
export async function getPublicOpportunityEvidence(evidenceId: string): Promise<{
  studentUserId: string;
  studentName: string;
  evidenceTitle: string;
  publicPortfolioSlug: string;
} | null> {
  const row = await prisma.studentPortfolioEvidence.findUnique({
    where: { id: evidenceId },
    select: {
      id: true, origin: true, title: true, isPublic: true, archivedAt: true,
      sourceOfferingId: true, sourceAssessmentItemId: true,
      student: {
        select: {
          name: true, userId: true, status: true,
          portfolioProfile: { select: { isPublic: true, publicSlug: true } },
        },
      },
    },
  });
  if (!row || !row.isPublic || row.archivedAt || row.sourceOfferingId || row.sourceAssessmentItemId) return null;
  if (row.origin !== "Competition" && row.origin !== "Achievement") return null;
  if (row.student.status !== "Active" || !row.student.userId) return null;
  if (!row.student.portfolioProfile?.isPublic || !row.student.portfolioProfile.publicSlug) return null;
  const verification = await studentPortfolioVerificationService.summary(evidenceId);
  if (verification.state !== "verified") return null;
  return {
    studentUserId: row.student.userId,
    studentName: row.student.name,
    evidenceTitle: row.title,
    publicPortfolioSlug: row.student.portfolioProfile.publicSlug,
  };
}
