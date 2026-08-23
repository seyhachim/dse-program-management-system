import type {
  PublicStudentPortfolio,
  PublicStudentPortfolioEvidence,
  StudentPortfolioProfessionalLink,
  StudentPortfolioProfessionalProvider,
  StudentPortfolioSoftSkillSummary,
} from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";
import { PortalNotFoundError } from "./service.ts";
import { studentPortfolioVerificationService } from "./portfolio-verification.ts";
import { softSkillsForStudentId } from "./portfolio-soft-skills.ts";
import { competenciesForStudentId } from "./portfolio-competencies.ts";

const PROVIDER_FROM_DB: Record<string, StudentPortfolioProfessionalProvider> = {
  GitHub: "github",
  GitLab: "gitlab",
  LinkedIn: "linkedin",
  Kaggle: "kaggle",
  HuggingFace: "hugging_face",
  Website: "website",
  ORCID: "orcid",
  GoogleScholar: "google_scholar",
  ResearchGate: "research_gate",
  CodingPractice: "coding_practice",
  BIProfile: "bi_profile",
  CV: "cv",
  Other: "other",
};

const ORIGIN_FROM_DB: Record<string, any> = {
  ExternalProject: "external_project",
  CourseAssessment: "course_assessment",
  Practicum: "practicum",
  Internship: "internship",
  FinalProject: "final_project",
  Competition: "competition",
  Achievement: "achievement",
  Other: "other",
};
const KIND_FROM_DB: Record<string, any> = {
  Repository: "repository",
  Demo: "demo",
  Report: "report",
  Presentation: "presentation",
  Dataset: "dataset",
  Other: "other",
};

type PublicProfileRow = {
  studentId: string;
  name: string;
  headline: string;
  bio: string;
  careerInterests: string[];
  publicSlug: string;
};

type PublicLinkRow = {
  provider: string;
  label: string;
  url: string;
};

function publicVerification(summary: Awaited<ReturnType<typeof studentPortfolioVerificationService.summary>>) {
  return {
    state: summary.state,
    context: summary.context,
    verifiedAt: summary.verifiedAt,
    actorName: null,
  };
}

function recalculatePublicSoftSkill(summary: StudentPortfolioSoftSkillSummary, allowedEvidenceIds: Set<string>): StudentPortfolioSoftSkillSummary {
  const evidence = summary.evidence
    .filter((item) => allowedEvidenceIds.has(item.id))
    .map((item) => ({ ...item, verification: publicVerification(item.verification) }));
  const verifiedExperienceCount = evidence.filter((item) => item.verification.state === "verified").length;
  return {
    ...summary,
    evidence,
    evidenceCount: evidence.length,
    verifiedExperienceCount,
    status: evidence.length === 0 ? "not_yet_evidenced" : verifiedExperienceCount >= 2 ? "demonstrated" : "developing",
  };
}

export const studentPortfolioPublicService = {
  async get(slug: string): Promise<PublicStudentPortfolio> {
    const profiles = await prisma.$queryRaw<PublicProfileRow[]>`
      SELECT s."id" AS "studentId", s."name", p."headline", p."bio", p."careerInterests", p."publicSlug"
      FROM "StudentPortfolioProfile" p
      JOIN "Student" s ON s."id" = p."studentId"
      WHERE p."publicSlug" = ${slug} AND p."isPublic" = true AND s."status" = 'Active'
      LIMIT 1
    `;
    const profile = profiles[0];
    if (!profile) throw new PortalNotFoundError("Public portfolio was not found");

    const linkRows = await prisma.$queryRaw<PublicLinkRow[]>`
      SELECT "provider"::text AS "provider", "label", "url"
      FROM "StudentPortfolioProfessionalLink"
      WHERE "studentId" = ${profile.studentId} AND "isPublic" = true
      ORDER BY "createdAt" ASC
    `;

    // Course-linked public evidence is only eligible while the canonical source remains
    // enrolled/approved/active. Self-added evidence has no academic source to re-authorize.
    const evidenceRows = await prisma.studentPortfolioEvidence.findMany({
      where: {
        studentId: profile.studentId,
        isPublic: true,
      },
      orderBy: [{ isFeatured: "desc" }, { updatedAt: "desc" }],
      include: {
        links: { orderBy: { createdAt: "asc" } },
        sourceOffering: { select: { id: true, courseSpecId: true } },
        sourceAssessmentItem: { select: { status: true, courseSpec: { select: { reviewStatus: true } } } },
      },
    });
    const enrolledOfferingIds = new Set((await prisma.enrollment.findMany({
      where: { studentId: profile.studentId },
      select: { offeringId: true },
    })).map((row) => row.offeringId));

    const safeEvidenceRows = evidenceRows.filter((row) => {
      if (!row.sourceOfferingId) return true;
      return enrolledOfferingIds.has(row.sourceOfferingId)
        && row.sourceOffering?.courseSpecId === row.sourceCourseSpecId
        && row.sourceAssessmentItem?.status === "Active"
        && row.sourceAssessmentItem.courseSpec.reviewStatus === "Approved";
    });

    const evidence: PublicStudentPortfolioEvidence[] = await Promise.all(safeEvidenceRows.map(async (row) => ({
      id: row.id,
      title: row.title,
      summary: row.summary,
      role: row.role,
      contribution: row.contribution,
      startDate: row.startDate ? row.startDate.toISOString().slice(0, 10) : null,
      endDate: row.endDate ? row.endDate.toISOString().slice(0, 10) : null,
      skills: row.skills,
      featured: row.isFeatured,
      links: row.links.map((link) => ({ kind: KIND_FROM_DB[link.kind], label: link.label, url: link.url })),
      verification: publicVerification(await studentPortfolioVerificationService.summary(row.id)),
    })));
    const allowedEvidenceIds = new Set(evidence.map((item) => item.id));

    const rawSoftSkills = await softSkillsForStudentId(profile.studentId, true);
    const softSkills = rawSoftSkills
      .map((item) => recalculatePublicSoftSkill(item, allowedEvidenceIds))
      .filter((item) => item.evidenceCount > 0);

    const competencies = (await competenciesForStudentId(profile.studentId, true))
      .map((competency) => ({
        ...competency,
        evidence: competency.evidence
          .filter((item) => allowedEvidenceIds.has(item.evidenceId))
          .map((item) => ({ ...item, verification: publicVerification(item.verification) })),
      }))
      .filter((competency) => competency.evidence.length > 0);

    return {
      slug: profile.publicSlug,
      name: profile.name,
      headline: profile.headline,
      bio: profile.bio,
      careerInterests: profile.careerInterests,
      links: linkRows.map((row) => ({
        provider: PROVIDER_FROM_DB[row.provider],
        label: row.label,
        url: row.url,
        status: "added" as const,
      })),
      evidence,
      softSkills,
      competencies,
    };
  },
};
