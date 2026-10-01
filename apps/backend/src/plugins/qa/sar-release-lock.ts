import { Prisma } from "@prisma/client";

export const QA_SAR_RELEASE_VERSION_LOCK_PREFIX = "qa-sar-release-version:";

/**
 * QaSarRelease is shared by the legacy Part-2 renderer and the full SAR Book.
 * Both finalisers must serialize version allocation in the same cycle namespace.
 */
export async function lockQaSarReleaseVersion(
  tx: Prisma.TransactionClient,
  cycleId: string,
): Promise<void> {
  await tx.$executeRaw(
    Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`${QA_SAR_RELEASE_VERSION_LOCK_PREFIX}${cycleId}`})::bigint)`,
  );
}

/**
 * Hold a stable committed source state while the full-book snapshot is assembled.
 *
 * PostgreSQL SHARE table locks allow SELECTs (including the existing read services
 * that use the shared Prisma client) while blocking INSERT/UPDATE/DELETE until the
 * finalisation transaction commits. Acquiring the locks first also waits for any
 * already-running source mutation to finish, so every subsequent assembler read
 * observes one stable committed state.
 *
 * Keep this list aligned with canonical data read by the SAR Book assembler,
 * readiness, Part 2/3, and Evidence Register services. QaSarRelease itself is
 * governed separately by the cycle advisory lock above.
 */
export async function lockQaSarBookFinalizationSources(
  tx: Prisma.TransactionClient,
): Promise<void> {
  await tx.$executeRaw(Prisma.sql`
    LOCK TABLE
      "QaFramework",
      "QaCriterion",
      "QaRequirement",
      "QaAssessmentCycle",
      "QaEvidence",
      "QaEvidenceMapping",
      "QaImprovementAction",
      "QaImprovementActionFollowUp",
      "QaRequirementAssignment",
      "QaSarSection",
      "QaSarSubmission",
      "QaSarReview",
      "QaSarBookNarrativeSection",
      "QaSarBookSectionRevision",
      "QaSarBookSectionAssignment",
      "QaSarBookTerminology",
      "QaSarBookSectionEvidenceReference",
      "QaSarBookEvidencePresentation",
      "QaSarBookSectionReview",
      "QaSarBookRequirementRatingRevision",
      "QaSarBookCriterionRatingRevision",
      "QaSarBookPart3Association"
    IN SHARE MODE
  `);
}
