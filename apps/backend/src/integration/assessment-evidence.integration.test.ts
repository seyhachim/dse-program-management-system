import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { randomUUID } from "node:crypto";
import { signToken, type AuthUser, type Role } from "../core/auth/token.ts";
import { createApp } from "../core/app.ts";
import { prisma } from "../core/db/prisma.ts";
import { resultsLifecycleService } from "../plugins/student-portal/results-lifecycle.ts";

const isolated = process.env.BACKEND_INTEGRATION_TESTS === "1" ? describe : describe.skip;
isolated("assessment evidence protected API and immutable history", () => {
  let server: Server | undefined;
  let origin = "", base = "", sourceId = "", otherResultId = "";
  let lecturer: AuthUser, coordinator: AuthUser, student: AuthUser, unrelated: AuthUser;
  let wrongProgramme: AuthUser;
  const ref = "https://drive.google.com/file/d/synthetic-test-work/view";
  async function user(email: string, role: Role, programmeId: string): Promise<AuthUser> {
    const u = await prisma.user.findUniqueOrThrow({ where: { email } });
    return { id: u.id, email, roles: [role], programmeRoles: [{ role, programmeId }] };
  }
  async function request(url: string, actor: AuthUser | null, body?: object) {
    const headers = new Headers();
    if (actor) headers.set("Authorization", "Bearer " + signToken(actor));
    if (body) headers.set("Content-Type", "application/json");
    const res = await fetch(origin + url, { method: body ? "POST" : "GET", headers, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, body: await res.json(), cache: res.headers.get("cache-control") };
  }
  beforeAll(async () => {
    const host = new URL(process.env.DATABASE_URL ?? "postgresql://invalid:invalid@remote.invalid/db").hostname;
    if (host !== "localhost" && host !== "127.0.0.1") throw new Error("Use an isolated local PostgreSQL database");
    process.env.AUTH_MODE = "dev";
    process.env.JWT_SECRET = "assessment-evidence-isolated-ci-secret-at-least-32-characters";
    const spec = await prisma.courseSpec.findFirstOrThrow({
      where: { reviewStatus: "Approved", course: { programmeId: "dse" }, assessmentItems: { some: { id: "seed-assessment-1", status: "Active", mode: "Individual" } } },
      include: { assessmentItems: { where: { id: "seed-assessment-1", status: "Active", mode: "Individual" } } },
    });
    const item = spec.assessmentItems[0]!;
    [lecturer, coordinator, student, unrelated] = await Promise.all([
      user("lecturer@dse.dev", "lecturer", "dse"), user("coordinator@dse.dev", "program_coordinator", "dse"),
      user("student@dse.dev", "student", "dse"), user("hopper.lecturer@dse.dev", "lecturer", "dse"),
    ]);
    wrongProgramme = { ...lecturer, programmeRoles: [{ role: "lecturer", programmeId: "other-programme" }] };
    const createResult = async () => {
      const suffix = randomUUID();
      const offering = await prisma.offering.create({ data: {
        courseId: spec.courseId, courseSpecId: spec.id, lecturerId: lecturer.id,
        term: "evidence-ci-" + suffix, sectionCode: "A", status: "Active",
      } });
      const profile = await prisma.student.create({ data: {
        name: "Synthetic evidence student", email: suffix + "@example.invalid", studentId: "EVID-" + suffix, status: "Active",
      } });
      const enrollment = await prisma.enrollment.create({ data: { offeringId: offering.id, studentId: profile.id } });
      const result = await prisma.assessmentResult.create({ data: {
        enrollmentId: enrollment.id, courseSpecId: spec.id, assessmentItemId: item.id,
        score: 7, maxScore: 10, feedback: "Synthetic feedback", publishedAt: new Date("2026-08-16T01:00:00Z"), publishedById: lecturer.id,
      } });
      await prisma.assessmentResult.update({ where: { id: result.id }, data: {
        finalizedAt: new Date("2026-08-16T02:00:00Z"), finalizedById: lecturer.id,
      } });
      return { offeringId: offering.id, resultId: result.id };
    };
    const first = await createResult(), second = await createResult();
    sourceId = first.resultId; otherResultId = second.resultId;
    base = "/api/qa/assessment-evidence/offerings/" + first.offeringId + "/specs/" + spec.id + "/assessments/" + item.id;
    server = createApp().listen(0, "127.0.0.1");
    await once(server, "listening");
    origin = "http://127.0.0.1:" + (server.address() as AddressInfo).port;
  });
  afterAll(async () => {
    if (server?.listening) await new Promise<void>((resolve, reject) => server!.close(err => err ? reject(err) : resolve()));
    // Immutable records intentionally remain in the disposable CI database.
    await prisma.$disconnect();
  });
  test("denies unrelated callers and cross-offering source, protects review and preserves grades", async () => {
    const url = base + "/results/" + sourceId + "/revisions";
    const draft = { action: "create", expectedRevision: 0, selectionReason: "Representative sample", workReference: ref };
    expect((await request(base, null)).status).toBe(401);
    for (const actor of [student, unrelated, wrongProgramme]) expect((await request(base, actor)).status).toBe(404);
    expect((await request(base + "/results/" + otherResultId + "/revisions", lecturer, draft)).status).toBe(404);
    const overview = await request(base, lecturer);
    expect(overview.status).toBe(200);
    expect(overview.cache).toContain("no-store");
    expect(overview.body.suggestions.eligibleCount).toBe(1);
    expect(overview.body.evidence).toEqual([]);
    expect((await request(url, coordinator, draft)).status).toBe(403);
    const created = await request(url, lecturer, draft);
    expect(created.status).toBe(201);
    expect(created.body.status).toBe("draft");
    expect((await request(url, lecturer, draft)).status).toBe(409);
    expect((await request(url, lecturer, { action: "submit", expectedRevision: 1 })).status).toBe(400);
    const submitted = await request(url, lecturer, { action: "submit", expectedRevision: 1, confirmedMarkedWork: true });
    expect(submitted.status).toBe(201);
    const verify = { action: "verify", expectedRevision: 2, reviewReason: "Synthetic review", confirmedRestrictedWorkAndMarks: true };
    expect((await request(url, lecturer, verify)).status).toBe(403);
    const dualRole: AuthUser = { ...lecturer, roles: ["lecturer", "program_coordinator"],
      programmeRoles: [...lecturer.programmeRoles, { role: "program_coordinator", programmeId: "dse" }] };
    expect((await request(url, dualRole, verify)).status).toBe(403);
    const requested = await request(url, coordinator, { action: "request_changes", expectedRevision: 2, reviewReason: "Improve sample description" });
    expect(requested.status).toBe(201);
    expect(requested.body.status).toBe("changes_requested");
    expect((await request(url, lecturer, { action: "revise", expectedRevision: 3, selectionReason: "Revised description", workReference: ref })).status).toBe(201);
    expect((await request(url, lecturer, { action: "submit", expectedRevision: 4, confirmedMarkedWork: true })).status).toBe(201);
    const verified = await request(url, coordinator, { ...verify, expectedRevision: 5 });
    expect(verified.status).toBe(201);
    expect(verified.body.status).toBe("verified");
    const history = await request(base + "/results/" + sourceId + "/history", lecturer);
    expect(history.body.revisions.map((row: { revision: number }) => row.revision)).toEqual([6, 5, 4, 3, 2, 1]);
    expect((await request(base, coordinator)).body.evidence[0].effectiveStatus).toBe("verified");
    await expect(prisma.assessmentEvidenceRevision.update({ where: { id: created.body.id }, data: { selectionReason: "tamper" } })).rejects.toThrow();
    await expect(prisma.assessmentEvidenceRevision.delete({ where: { id: created.body.id } })).rejects.toThrow();
    const official = await prisma.assessmentResult.findUniqueOrThrow({ where: { id: sourceId } });
    expect(official).toMatchObject({ score: 7, maxScore: 10, feedback: "Synthetic feedback" });
    await resultsLifecycleService.correctFinalized(lecturer.id, false, {
      assessmentResultId: sourceId, score: 8, maxScore: 10, feedback: "Corrected synthetic feedback",
      reason: "Synthetic moderation correction", expectedUpdatedAt: official.updatedAt.toISOString(),
    });
    expect((await request(base, coordinator)).body.evidence[0].effectiveStatus).toBe("stale");
    expect((await request(url, lecturer, { action: "revise", expectedRevision: 6, selectionReason: "New work", workReference: ref })).status).toBe(201);
    expect((await request(base, coordinator)).body.evidence[0].effectiveStatus).toBe("draft");
  }, 30000);
});
