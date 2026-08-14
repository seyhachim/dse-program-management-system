// Temporary branch-only smoke test; removed before merge.
import { AUN_QA_V4_ID } from "@dse-pms/shared-types";
import { prisma } from "../src/core/db/prisma.ts";
import { createQaEvidenceAnalysis } from "../src/plugins/qa/analysis/service.ts";
import { createQaAnalysisReview } from "../src/plugins/qa/reviews/service.ts";
import {
  QaImprovementActionEligibilityError,
  QaImprovementActionLifecycleError,
  carryForwardQaImprovementAction,
  createQaImprovementAction,
  listQaImprovementActions,
  updateQaImprovementAction,
} from "../src/plugins/qa/actions/service.ts";

const suffix = Date.now().toString(36);
const programmeId = `qa-smoke-192-${suffix}`;
const ownerId = crypto.randomUUID();
const cycleId = crypto.randomUUID();
const nextCycleId = crypto.randomUUID();

await prisma.programme.create({
  data: { id: programmeId, code: `QA192-${suffix}`, name: "QA 192 CQI smoke programme" },
});
await prisma.user.create({
  data: {
    id: ownerId,
    email: `qa192-${suffix}@example.com`,
    name: "QA CQI Smoke Owner",
  },
});
const requirement = await prisma.qaRequirement.findFirstOrThrow({
  where: { code: "1.2", criterion: { frameworkId: AUN_QA_V4_ID } },
  include: { expectations: { where: { active: true }, orderBy: { order: "asc" } } },
});
const expectation = requirement.expectations[0];
if (!expectation) throw new Error("Pilot expectation 1.2 not seeded");
await prisma.qaAssessmentCycle.createMany({
  data: [
    {
      id: cycleId,
      programmeId,
      frameworkId: AUN_QA_V4_ID,
      title: "Issue 192 CQI source cycle",
      reportingStart: new Date("2026-01-01T00:00:00Z"),
      reportingEnd: new Date("2026-06-30T00:00:00Z"),
      status: "Active",
    },
    {
      id: nextCycleId,
      programmeId,
      frameworkId: AUN_QA_V4_ID,
      title: "Issue 192 CQI target cycle",
      reportingStart: new Date("2026-07-01T00:00:00Z"),
      reportingEnd: new Date("2026-12-31T00:00:00Z"),
      status: "Draft",
    },
  ],
});

try {
  const gap = await createQaEvidenceAnalysis({
    programmeId,
    cycleId,
    requirementCode: "1.2",
    expectationId: expectation.id,
    state: "potentialEvidenceGap",
    explanation: "A required CLO-PLO mapping record is incomplete.",
    confidence: null,
    uncertaintyNote: "Evidence gap only.",
    engine: "deterministic-rules",
    engineVersion: "1.0.0",
    promptVersion: "",
    sources: [],
  });
  const confirmed = await createQaAnalysisReview(
    gap.id,
    { programmeId, decision: "confirmed", comment: "Confirmed evidence documentation gap." },
    ownerId,
  );
  const rejected = await createQaAnalysisReview(
    gap.id,
    { programmeId, decision: "rejected", comment: "The reviewer rejects this finding after checking the source." },
    ownerId,
  );

  const action = await createQaImprovementAction({
    programmeId,
    cycleId,
    analysisId: gap.id,
    reviewId: confirmed.id,
    ownerId,
    plannedAction: "Complete and approve all active CLO to PLO mapping evidence for the programme.",
    indicator: "Every active CLO has at least one approved PLO mapping and review record.",
    dueDate: new Date("2020-01-01T00:00:00Z"),
  });
  if (!action.overdue || action.status !== "open") {
    throw new Error("Open past-due CQI action was not reported as overdue");
  }

  let rejectedReviewBlocked = false;
  try {
    await createQaImprovementAction({
      programmeId,
      cycleId,
      analysisId: gap.id,
      reviewId: rejected.id,
      ownerId,
      plannedAction: "This action must not be created from a rejected finding.",
      indicator: "The service rejects this provenance path.",
      dueDate: null,
    });
  } catch (error) {
    rejectedReviewBlocked = error instanceof QaImprovementActionEligibilityError;
  }
  if (!rejectedReviewBlocked) throw new Error("Rejected human finding created a CQI action");

  const identified = await createQaEvidenceAnalysis({
    programmeId,
    cycleId,
    requirementCode: "1.2",
    expectationId: expectation.id,
    state: "evidenceIdentified",
    explanation: "Evidence was identified.",
    confidence: null,
    uncertaintyNote: "",
    engine: "deterministic-rules",
    engineVersion: "1.0.1",
    promptVersion: "",
    sources: [],
  });
  const identifiedReview = await createQaAnalysisReview(
    identified.id,
    { programmeId, decision: "confirmed", comment: "Confirmed evidence identified." },
    ownerId,
  );
  let identifiedBlocked = false;
  try {
    await createQaImprovementAction({
      programmeId,
      cycleId,
      analysisId: identified.id,
      reviewId: identifiedReview.id,
      ownerId,
      plannedAction: "This must not turn evidence identified into an automatic quality problem.",
      indicator: "The service blocks action creation.",
      dueDate: null,
    });
  } catch (error) {
    identifiedBlocked = error instanceof QaImprovementActionEligibilityError;
  }
  if (!identifiedBlocked) throw new Error("Evidence-identified finding created a CQI action");

  const inProgress = await updateQaImprovementAction(action.id, {
    programmeId,
    status: "inProgress",
  });
  if (inProgress.status !== "inProgress") throw new Error("Action did not enter in-progress state");

  const carried = await carryForwardQaImprovementAction(action.id, {
    programmeId,
    targetCycleId: nextCycleId,
    ownerId,
    dueDate: new Date("2026-10-01T00:00:00Z"),
  });
  if (carried.cycleId !== nextCycleId || carried.carriedFromActionId !== action.id) {
    throw new Error("Carry-forward action did not preserve source provenance");
  }

  const completed = await updateQaImprovementAction(action.id, {
    programmeId,
    status: "completed",
    result: "All active CLO to PLO mappings were completed and approved for the cycle.",
    effectivenessReview: "Follow-up QA review confirmed the evidence is complete, traceable, and usable.",
  });
  if (completed.status !== "completed" || !completed.completedAt) {
    throw new Error("Completed action did not retain closure metadata");
  }

  let terminalBlocked = false;
  try {
    await updateQaImprovementAction(action.id, {
      programmeId,
      plannedAction: "Attempted mutation after closure must fail.",
    });
  } catch (error) {
    terminalBlocked = error instanceof QaImprovementActionLifecycleError;
  }
  if (!terminalBlocked) throw new Error("Closed CQI action remained mutable");

  const targetActions = await listQaImprovementActions(programmeId, { cycleId: nextCycleId });
  if (targetActions.length !== 1 || targetActions[0]?.id !== carried.id) {
    throw new Error("Carried action was not visible in the target assessment cycle");
  }

  console.log("Issue 192 CQI improvement action smoke test passed.");
} finally {
  await prisma.qaAssessmentCycle.deleteMany({ where: { id: { in: [cycleId, nextCycleId] } } });
  await prisma.user.delete({ where: { id: ownerId } });
  await prisma.programme.delete({ where: { id: programmeId } });
  await prisma.$disconnect();
}
