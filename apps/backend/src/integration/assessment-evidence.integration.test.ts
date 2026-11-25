import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
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
    const upload = async (actor: AuthUser | null, resultId: string, file: string, filename = "sample.pdf") => {
      const headers = new Headers({ "Content-Type": "application/octet-stream", "x-evidence-filename": encodeURIComponent(filename), "x-evidence-mime": "application/pdf", "x-evidence-revision": "0", "x-evidence-reason": "Synthetic sample" });
      if (actor) headers.set("Authorization", "Bearer " + signToken(actor));
      const res = await fetch(origin + base + "/results/" + resultId + "/attachment", { method: "POST", headers, body: file });
      return res.status;
    };
    expect(await upload(null, sourceId, "%PDF-1.4")).toBe(401);
    expect(await upload(student, sourceId, "%PDF-1.4")).toBe(404);
    expect(await upload(unrelated, sourceId, "%PDF-1.4")).toBe(404);
    expect(await upload(coordinator, sourceId, "%PDF-1.4")).toBe(403);
    expect(await upload(lecturer, otherResultId, "%PDF-1.4")).toBe(404);
    expect(await upload(lecturer, sourceId, "not a pdf")).toBe(400);
    expect(await upload(lecturer, sourceId, "%PDF-1.4", "../sample.pdf")).toBe(400);
    const originalUploadFlag = process.env.ASSESSMENT_EVIDENCE_UPLOADS_ENABLED;
    try {
      process.env.ASSESSMENT_EVIDENCE_UPLOADS_ENABLED = "false";
      expect(await upload(lecturer, sourceId, "%PDF-1.4")).toBe(503);
    } finally {
      if (originalUploadFlag === undefined) delete process.env.ASSESSMENT_EVIDENCE_UPLOADS_ENABLED;
      else process.env.ASSESSMENT_EVIDENCE_UPLOADS_ENABLED = originalUploadFlag;
    }
    expect((await request(base, lecturer)).body.evidence).toEqual([]);
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
    // Metadata-only fixture: no cloud file exists, no live storage or scanner is used.
    const previous = await prisma.assessmentEvidenceRevision.findFirstOrThrow({ where: { resultId: sourceId }, orderBy: { revision: "desc" } });
    const fakeAttachment = { objectKey: "v1/" + randomUUID() + ".pdf", filename: "synthetic.pdf", mimeType: "application/pdf", sizeBytes: 20, sha256: "a".repeat(64) };
    await prisma.assessmentEvidenceRevision.create({ data: {
      resultId: previous.resultId, offeringId: previous.offeringId, courseSpecId: previous.courseSpecId,
      assessmentItemId: previous.assessmentItemId, revision: 8, action: "revise", status: "draft",
      sourceHash: previous.sourceHash, score: previous.score, maxScore: previous.maxScore,
      sourceSnapshot: previous.sourceSnapshot as Prisma.InputJsonObject,
      workReference: null, attachment: fakeAttachment, selectionReason: "Synthetic metadata fixture", actorId: lecturer.id,
    } });
    const fileView = (await request(base, lecturer)).body.evidence[0];
    expect(fileView.attachment.filename).toBe("synthetic.pdf");
    expect(fileView.attachment.objectKey).toBeUndefined();
    const downloadPath = base + "/results/" + sourceId + "/revisions/8/download";
    expect((await request(downloadPath, student)).status).toBe(404);
    expect((await request(downloadPath, unrelated)).status).toBe(404);
    expect((await request(url, lecturer, { action: "submit", expectedRevision: 8, confirmedMarkedWork: true })).status).toBe(201);
    expect((await request(url, coordinator, { ...verify, expectedRevision: 9 })).status).toBe(201);
    const storedAttachment = await prisma.assessmentEvidenceRevision.findFirstOrThrow({ where: { resultId: sourceId, revision: 10 } });
    expect(storedAttachment.attachment).toEqual(fakeAttachment);
    expect((await request(url, lecturer, { action: "revise", expectedRevision: 10, selectionReason: "Retain file in new draft", workReference: null, keepAttachment: true })).status).toBe(201);
    const retained = (await request(base, coordinator)).body.evidence[0];
    expect(retained.effectiveStatus).toBe("draft");
    expect(retained.attachment.filename).toBe("synthetic.pdf");
    expect(retained.attachment.objectKey).toBeUndefined();
  }, 30000);
});
