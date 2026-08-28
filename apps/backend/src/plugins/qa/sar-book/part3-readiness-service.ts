import {
  QaSarBookReviewReadinessViewSchema,
  type QaSarBookReadinessBlocker,
  type QaSarBookReviewReadinessView,
  type QaSarBookStaticSectionReadiness,
} from "@dse-pms/shared-types";
import { getQaSarBookPart3 } from "./part3-service.ts";
import { getQaSarBookReviewReadiness } from "./review-service.ts";

const STRUCTURED_PART3_KEYS = new Set([
  "part3.self-ratings",
  "part3.improvement-plan",
]);

export async function getQaSarBookReviewReadinessWithPart3(
  programmeId: string,
  cycleId: string,
): Promise<QaSarBookReviewReadinessView> {
  const [base, part3] = await Promise.all([
    getQaSarBookReviewReadiness(programmeId, cycleId),
    getQaSarBookPart3(programmeId, cycleId),
  ]);

  const ratingsReady =
    part3.readiness.totalRequirements > 0 &&
    part3.readiness.ratedRequirements === part3.readiness.totalRequirements &&
    part3.readiness.totalCriteria > 0 &&
    part3.readiness.ratedCriteria === part3.readiness.totalCriteria;

  const structuredSections: QaSarBookStaticSectionReadiness[] = [
    {
      part: "part3",
      sectionKey: "part3.self-ratings",
      sectionTitle: "Self-Ratings",
      source: "structured",
      required: true,
      revisionId: null,
      revisionNumber: null,
      contentReady: ratingsReady,
      reviewStatus: ratingsReady ? "approved" : "missing",
      latestReview: null,
    },
    {
      part: "part3",
      sectionKey: "part3.improvement-plan",
      sectionTitle: "Improvement Plan",
      source: "structured",
      required: true,
      revisionId: null,
      revisionNumber: null,
      contentReady: true,
      reviewStatus: "approved",
      latestReview: null,
    },
  ];

  const blockers: QaSarBookReadinessBlocker[] = base.blockers.filter(
    (blocker) => !blocker.sectionKey || !STRUCTURED_PART3_KEYS.has(blocker.sectionKey),
  );

  if (!ratingsReady) {
    blockers.push({
      type: "missingSection",
      part: "part3",
      sectionKey: "part3.self-ratings",
      requirementCode: null,
      message: `Part 3 self-ratings are incomplete: ${part3.readiness.ratedRequirements}/${part3.readiness.totalRequirements} requirements and ${part3.readiness.ratedCriteria}/${part3.readiness.totalCriteria} criteria have explicit human ratings.`,
    });
  }

  const staticSections = [
    ...base.staticSections.filter((section) => !STRUCTURED_PART3_KEYS.has(section.sectionKey)),
    ...structuredSections,
  ];
  const part3Sections = staticSections.filter((section) => section.part === "part3");
  const part3Ready = part3Sections.filter((section) => section.reviewStatus === "approved").length;

  const parts = base.parts.map((part) =>
    part.part === "part3"
      ? {
          ...part,
          total: part3Sections.length,
          ready: part3Ready,
          blockers: blockers.filter((blocker) => blocker.part === "part3").length,
        }
      : {
          ...part,
          blockers: blockers.filter((blocker) => blocker.part === part.part).length,
        },
  );

  return QaSarBookReviewReadinessViewSchema.parse({
    ...base,
    generatedAt: new Date().toISOString(),
    readyForFinalisation: blockers.length === 0,
    parts,
    staticSections,
    blockers,
  });
}
