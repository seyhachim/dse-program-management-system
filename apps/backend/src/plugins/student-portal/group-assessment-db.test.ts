import { afterAll, describe, expect, test } from "bun:test";
import { prisma } from "../../core/db/prisma.ts";

const run = process.env.GROUP_ASSESSMENT_DB_TESTS === "1";
const dbDescribe = run ? describe : describe.skip;

dbDescribe("group assessment database integrity", () => {
  afterAll(async () => { await prisma.$disconnect(); });

  test("migration exposes GroupIndividual and RLS-protects every new provenance table", async () => {
    const enumRows = await prisma.$queryRaw<Array<{ enumlabel: string }>>`
      SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'AssessmentItemMode'
    `;
    expect(enumRows.map((row) => row.enumlabel)).toContain("GroupIndividual");

    const rows = await prisma.$queryRaw<Array<{ relname: string; relrowsecurity: boolean }>>`
      SELECT c.relname::text, c.relrowsecurity
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname IN (
        'AssessmentGroup','AssessmentGroupMember','AssessmentGroupScore','AssessmentGroupCriterionScore',
        'AssessmentIndividualComponent','AssessmentIndividualCriterionScore','AssessmentGroupScoreCorrection',
        'AssessmentIndividualComponentCorrection','AssessmentGroupAuditEvent'
      ) ORDER BY c.relname
    `;
    expect(rows).toHaveLength(9);
    expect(rows.every((row) => row.relrowsecurity)).toBe(true);
  });

  test("group audit history is append-only", async () => {
    const actor = await prisma.user.findFirst({ select: { id: true } });
    if (!actor) throw new Error("Seed user required");
    const event = await prisma.assessmentGroupAuditEvent.create({ data: { offeringId: crypto.randomUUID(), courseSpecId: crypto.randomUUID(), assessmentItemId: crypto.randomUUID(), action: "GroupsConfigured", actorId: actor.id, details: { test: true } } });
    await expect(async () => {
      await prisma.assessmentGroupAuditEvent.update({ where: { id: event.id }, data: { reason: "rewrite" } });
    }).toThrow(/append-only/i);
    await expect(async () => {
      await prisma.assessmentGroupAuditEvent.delete({ where: { id: event.id } });
    }).toThrow(/append-only/i);
  });
});
