// Temporary branch-only smoke test; removed before merge.
import { AUN_QA_V4_ID } from "@dse-pms/shared-types";
import { prisma } from "../src/core/db/prisma.ts";
import { runDeterministicQaAnalysis } from "../src/plugins/qa/analysis/deterministic-engine.ts";
import { listQaEvidenceAnalyses } from "../src/plugins/qa/analysis/service.ts";

const suffix = Date.now().toString(36);
const programmeId = `qa-smoke-188-${suffix}`;
const lecturerId = crypto.randomUUID();
const courseId = crypto.randomUUID();
const offeringId = crypto.randomUUID();
const cycleId = crypto.randomUUID();

await prisma.programme.create({
  data: {
    id: programmeId,
    code: `QA188-${suffix}`,
    name: "Issue 188 deterministic analysis smoke programme",
  },
});
await prisma.user.create({
  data: {
    id: lecturerId,
    email: `qa188-${suffix}@example.com`,
    name: "QA 188 Smoke Lecturer",
    qualification: "MSc Data Science",
  },
});
await prisma.course.create({
  data: {
    id: courseId,
    code: `Q188${suffix}`,
    title: "QA Deterministic Analysis Smoke Course",
    programmeId,
    lecturerId,
  },
});
await prisma.offering.create({
  data: {
    id: offeringId,
    courseId,
    lecturerId,
    term: "2026-smoke",
    sectionCode: "A",
    status: "Active",
  },
});
await prisma.offeringMeeting.create({
  data: {
    offeringId,
    dayOfWeek: "Monday",
    startTime: "09:00",
    endTime: "11:00",
    room: "QA Lab",
    activityType: "Lecture",
  },
});
await prisma.qaAssessmentCycle.create({
  data: {
    id: cycleId,
    programmeId,
    frameworkId: AUN_QA_V4_ID,
    title: "Issue 188 deterministic analysis smoke cycle",
    reportingStart: new Date("2026-01-01T00:00:00.000Z"),
    reportingEnd: new Date("2026-12-31T00:00:00.000Z"),
    status: "Active",
  },
});

try {
  const identified = await runDeterministicQaAnalysis(programmeId, cycleId, "5.2");
  const gap = await runDeterministicQaAnalysis(programmeId, cycleId, "1.2");
  const expert = await runDeterministicQaAnalysis(programmeId, cycleId, "1.5");

  if (identified[0]?.state !== "evidenceIdentified") {
    throw new Error(`Expected 5.2 evidenceIdentified, got ${identified[0]?.state}`);
  }
  if ((identified[0]?.sources.length ?? 0) < 2) {
    throw new Error("Expected 5.2 to persist lecturer assignment and workload provenance");
  }
  if (gap[0]?.state !== "potentialEvidenceGap") {
    throw new Error(`Expected 1.2 potentialEvidenceGap, got ${gap[0]?.state}`);
  }
  if (expert[0]?.state !== "expertReviewRequired") {
    throw new Error(`Expected 1.5 expertReviewRequired, got ${expert[0]?.state}`);
  }

  const history = await listQaEvidenceAnalyses(programmeId, cycleId);
  if (history.length !== 3) {
    throw new Error(`Expected 3 persisted deterministic analyses, got ${history.length}`);
  }
  if (!history.every((item) => item.engine === "deterministic-rules" && item.engineVersion === "1.0.0")) {
    throw new Error("Deterministic analysis engine/version metadata was not persisted consistently");
  }
  if (history.some((item) => item.confidence !== null)) {
    throw new Error("Deterministic engine must not manufacture probabilistic confidence");
  }

  console.log("Issue 188 three-state deterministic analysis smoke test passed.");
} finally {
  await prisma.qaAssessmentCycle.delete({ where: { id: cycleId } });
  await prisma.course.delete({ where: { id: courseId } });
  await prisma.user.delete({ where: { id: lecturerId } });
  await prisma.programme.delete({ where: { id: programmeId } });
  await prisma.$disconnect();
}
