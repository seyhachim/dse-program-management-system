import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { serializeDocumentContent } from "@dse-pms/shared-types";
import { prisma } from "../../../core/db/prisma.ts";
import {
  addQaSarBookSectionEvidenceReference,
  deleteQaSarBookSectionEvidenceReference,
  getQaSarBookEvidenceRegister,
  updateQaSarBookTerminology,
} from "./evidence-register-service.ts";
import { saveQaSarBookNarrativeSection } from "./narrative-service.ts";

const runDbTests =
  process.env.QA_SAR_BOOK_DB_TESTS === "1" ||
  process.env.BACKEND_INTEGRATION_TESTS === "1";
const dbDescribe = runDbTests ? describe : describe.skip;

function documentWithText(text: string) {
  return serializeDocumentContent({
    type: "doc",
    version: 1,
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  });
}

dbDescribe("SAR book evidence register integrity", () => {
  test("deduplicates canonical evidence, pins static revisions, and never deletes the source evidence", async () => {
    const suffix = randomUUID();
    const programme = await prisma.programme.findFirstOrThrow({ select: { id: true } });
    const framework = await prisma.qaFramework.findFirstOrThrow({ select: { id: true } });
    const user = await prisma.user.create({
      data: { email: `sar-evidence-${suffix}@dse.invalid`, name: "SAR Evidence Test User" },
    });
    const cycle = await prisma.qaAssessmentCycle.create({
      data: {
        programmeId: programme.id,
        frameworkId: framework.id,
        title: `SAR Evidence Test ${suffix}`,
        reportingStart: new Date("2026-01-01T00:00:00.000Z"),
        reportingEnd: new Date("2026-12-31T00:00:00.000Z"),
        createdById: user.id,
      },
    });
    const evidence = await prisma.qaEvidence.create({
      data: {
        programmeId: programme.id,
        title: `Canonical evidence ${suffix}`,
        kind: "SystemLink",
        sourceRef: `test:${suffix}`,
        reportingPeriod: "2026",
        status: "Reviewed",
        createdById: user.id,
      },
    });

    const first = await saveQaSarBookNarrativeSection(
      cycle.id,
      "part1.executive-summary",
      { programmeId: programme.id, content: documentWithText("Executive summary"), baseRevisionId: null },
      user.id,
    );
    const second = await saveQaSarBookNarrativeSection(
      cycle.id,
      "part3.strengths",
      { programmeId: programme.id, content: documentWithText("Strengths"), baseRevisionId: null },
      user.id,
    );
    if (!first.revisionId || !second.revisionId) throw new Error("Expected exact SAR book revisions");

    const firstRef = await addQaSarBookSectionEvidenceReference(
      cycle.id,
      "part1.executive-summary",
      {
        programmeId: programme.id,
        evidenceId: evidence.id,
        revisionId: first.revisionId,
        appendixGroup: "governance",
      },
      user.id,
    );
    await addQaSarBookSectionEvidenceReference(
      cycle.id,
      "part3.strengths",
      {
        programmeId: programme.id,
        evidenceId: evidence.id,
        revisionId: second.revisionId,
        appendixGroup: "governance",
      },
      user.id,
    );

    const register = await getQaSarBookEvidenceRegister(programme.id, cycle.id);
    expect(register.items).toHaveLength(1);
    expect(register.items[0]?.evidenceId).toBe(evidence.id);
    expect(register.items[0]?.usages.map((usage) => usage.sectionKey)).toEqual([
      "part1.executive-summary",
      "part3.strengths",
    ]);
    expect(register.items[0]?.appendixGroup).toBe("governance");

    const terminology = await updateQaSarBookTerminology(
      {
        programmeId: programme.id,
        terminology: { ...register.terminology, evidenceCitationLabel: "Exhibition" },
      },
      user.id,
    );
    expect(terminology.evidenceCitationLabel).toBe("Exhibition");
    const relabelled = await getQaSarBookEvidenceRegister(programme.id, cycle.id);
    expect(relabelled.items[0]?.citationText.startsWith("Exhibition ")).toBe(true);

    await deleteQaSarBookSectionEvidenceReference(programme.id, cycle.id, firstRef.id);
    expect(await prisma.qaEvidence.findUnique({ where: { id: evidence.id } })).not.toBeNull();
  });
});
