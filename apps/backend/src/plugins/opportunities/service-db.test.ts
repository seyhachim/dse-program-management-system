import { randomUUID } from "node:crypto";
import { describe, expect, test } from "bun:test";
import type { AuthUser } from "../../core/auth/token.ts";
import { prisma } from "../../core/db/prisma.ts";
import { registry } from "../../core/plugins/registry.ts";
import { studentPortalPlugin } from "../student-portal/index.ts";
import { OpportunityError, opportunitiesService } from "./service.ts";

// This test adds immutable portfolio verification history. Only run against an
// explicitly opted-in, disposable test database; never delete/disable audit triggers.
const dbName = (() => {
  try { return new URL(process.env.DATABASE_URL ?? "").pathname.slice(1); }
  catch { return ""; }
})();
const disposable = dbName === "dse_ci" || dbName.endsWith("_test") || dbName.endsWith("_integration");
const dbDescribe = process.env.OPPORTUNITIES_DB_TESTS === "1" && disposable ? describe : describe.skip;

dbDescribe("opportunity publication, authorization and consent database boundary", () => {
  test("draft/publish/expiry/archive and verified opt-in never expose private portfolio evidence", async () => {
    if (!registry.has("student-portal")) registry.register(studentPortalPlugin);
    const suffix = randomUUID();
    const programmeId = "opp-" + suffix;
    const anotherProgrammeId = "other-" + suffix;
    const u1 = await prisma.user.create({ data: { email: "opp-staff-" + suffix + "@dse.invalid", name: "Opportunity Staff" } });
    const u2 = await prisma.user.create({ data: { email: "opp-student-" + suffix + "@dse.invalid", name: "Opportunity Student" } });
    const programme = await prisma.programme.create({ data: { id: programmeId, code: "O-" + suffix, name: "Opportunity Test Programme" } });
    const other = await prisma.programme.create({ data: { id: anotherProgrammeId, code: "X-" + suffix, name: "Other Programme" } });
    const actor: AuthUser = { id: u1.id, email: u1.email, roles: ["program_coordinator"], programmeRoles: [{ role: "program_coordinator", programmeId }] };
    const wrongScope: AuthUser = { ...actor, programmeRoles: [{ role: "program_coordinator", programmeId: other.id }] };
    const student: AuthUser = { id: u2.id, email: u2.email, roles: ["student"], programmeRoles: [{ role: "student", programmeId }] };
    const studentRow = await prisma.student.create({ data: { userId: u2.id, email: u2.email, name: u2.name, status: "Active" } });
    const profile = await prisma.studentPortfolioProfile.create({ data: { studentId: studentRow.id, isPublic: true, publicSlug: "test-opp-" + suffix } });
    const evidence = await prisma.studentPortfolioEvidence.create({ data: {
      studentId: studentRow.id, title: "Competition winner evidence", origin: "Competition", isPublic: true,
      summary: "Participation and verified result", role: "Team member",
    } });
    try {
      await prisma.studentPortfolioVerificationEvent.create({ data: {
        id: randomUUID(), evidenceId: evidence.id, actorId: u1.id,
        actorContext: "Lecturer", previousState: "Unverified", newState: "Verified",
        reason: "Reviewed award document", snapshot: {}, snapshotHash: "test-fixture",
      } });
      const input = {
        programmeId, type: "competition" as const, title: "DSE Student Competition",
        organizer: "Official Event Organiser", summary: "An approved student competition with a published source.",
        eligibility: "Current university students may join.",
        sourceUrl: "https://example.org/event", applicationUrl: null, deadline: null,
      };
      await expect(opportunitiesService.create(wrongScope, input)).rejects.toMatchObject({ status: 403 });
      const created = await opportunitiesService.create(actor, input);
      expect(created.status).toBe("Draft");
      expect(await opportunitiesService.list(student, programmeId)).toHaveLength(0);
      expect((await opportunitiesService.publish(actor, created.id)).status).toBe("Published");
      expect(await opportunitiesService.list(student, programmeId)).toHaveLength(1);
      await expect(opportunitiesService.manage(wrongScope, programmeId)).rejects.toBeInstanceOf(OpportunityError);
      await expect(opportunitiesService.submitExperience(actor, created.id, {
        evidenceId: evidence.id, outcome: "Winner", consent: true,
      })).rejects.toHaveProperty("status", 403);
      const submission = await opportunitiesService.submitExperience(student, created.id, {
        evidenceId: evidence.id, outcome: "Winner", consent: true,
      });
      expect(submission.status).toBe("Pending");
      expect((await opportunitiesService.detail(student, created.id)).experiences).toHaveLength(0);
      const pending = await opportunitiesService.reviewList(actor, programmeId);
      expect(pending.map((item) => item.id)).toContain(submission.id);
      await opportunitiesService.reviewExperience(actor, submission.id, "approve");
      expect((await opportunitiesService.detail(student, created.id)).experiences).toHaveLength(1);
      expect((await opportunitiesService.myExperiences(student, created.id))[0]?.status).toBe("Approved");
      await expect(opportunitiesService.withdrawExperience(actor, created.id, submission.id)).rejects.toHaveProperty("status", 404);
      expect((await opportunitiesService.withdrawExperience(student, created.id, submission.id)).status).toBe("Hidden");
      expect((await opportunitiesService.detail(student, created.id)).experiences).toHaveLength(0);
      await expect(opportunitiesService.withdrawExperience(student, created.id, submission.id)).rejects.toHaveProperty("status", 409);
      const reconfirmed = await opportunitiesService.submitExperience(student, created.id, {
        evidenceId: evidence.id, outcome: "Winner", consent: true,
      });
      expect(reconfirmed.status).toBe("Pending");
      await opportunitiesService.reviewExperience(actor, submission.id, "approve");
      expect((await opportunitiesService.detail(student, created.id)).experiences).toHaveLength(1);
      await prisma.studentPortfolioProfile.update({ where: { id: profile.id }, data: { isPublic: false } });
      expect((await opportunitiesService.detail(student, created.id)).experiences).toHaveLength(0);
      await prisma.studentPortfolioProfile.update({ where: { id: profile.id }, data: { isPublic: true } });
      await prisma.studentPortfolioVerificationEvent.create({ data: {
        id: randomUUID(), evidenceId: evidence.id, actorId: u1.id,
        actorContext: "Lecturer", previousState: "Verified", newState: "Revoked",
        reason: "Proof revoked", snapshot: {}, snapshotHash: "revoked-fixture",
      } });
      expect((await opportunitiesService.detail(student, created.id)).experiences).toHaveLength(0);
      await opportunitiesService.reviewExperience(actor, submission.id, "hide");
      expect((await opportunitiesService.archive(actor, created.id)).status).toBe("Archived");
      expect(await opportunitiesService.list(student, programmeId)).toHaveLength(0);
      await expect(opportunitiesService.detail(student, created.id)).rejects.toHaveProperty("status", 404);
      const actions = await prisma.opportunityAuditEvent.findMany({ where: { opportunityId: created.id } });
      expect(actions.map((item) => item.action)).toEqual(expect.arrayContaining(["Created", "Published", "ExperienceConsented", "ExperienceApproved", "ExperienceWithdrawn", "ExperienceResubmitted", "ExperienceHidden", "Archived"]));
      const expired = await opportunitiesService.create(actor, { ...input, deadline: "2026-11-05" });
      await expect(opportunitiesService.publish(actor, expired.id, new Date("2026-11-06T10:00:00.000Z"))).rejects.toHaveProperty("status", 409);
    } finally {
      // Keep the isolated CI fixtures until PostgreSQL teardown. Verification
      // events are append-only, so deleting them as test cleanup would violate
      // the same academic-audit guarantees this feature must preserve.
    }
  });
});
