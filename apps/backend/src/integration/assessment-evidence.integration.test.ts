import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { signToken, type AuthUser, type Role } from "../core/auth/token.ts";
import { createApp } from "../core/app.ts";
import { prisma } from "../core/db/prisma.ts";
import { groupAssessmentService } from "../plugins/student-portal/group-assessment-results.ts";
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
  type TestBody = {
    id: string; status: string;
    suggestions: { eligibleCount: number };
    evidence: { effectiveStatus: string; attachment: { filename: string; objectKey?: string } }[];
    revisions: { revision: number }[];
    eligibleResults: { resultId: string; memberEnrollmentIds: string[] }[];
    totalOfferings: number;
    rows: { assessments: { state: string; population: string; verified: number; stale: number; gap: number }[] }[];
  };
  async function request(url: string, actor: AuthUser | null, body?: object) {
    const headers = new Headers();
    if (actor) headers.set("Authorization", "Bearer " + signToken(actor));
    if (body) headers.set("Content-Type", "application/json");
    const res = await fetch(origin + url, { method: body ? "POST" : "GET", headers, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, body: await res.json() as TestBody, cache: res.headers.get("cache-control") };
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
    if (server?.listening) await new Promise<void>((resolve, reject) => { server!.close(err => err ? reject(err) : resolve()); server!.closeAllConnections(); });
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
    await expect(async () => { await prisma.assessmentEvidenceRevision.update({ where: { id: created.body.id }, data: { selectionReason: "tamper" } }); }).toThrow(/append-only/i);
    await expect(async () => { await prisma.assessmentEvidenceRevision.delete({ where: { id: created.body.id } }); }).toThrow(/append-only/i);
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

  test("collects one shared group sample, separates individual contributions and reports coordinator coverage", async () => {
    const suffix = randomUUID();
    const course = await prisma.course.findFirstOrThrow({ where: { programmeId: "dse" } });
    const latest = await prisma.courseSpec.findFirst({ where: { courseId: course.id }, orderBy: [{ versionMajor: "desc" }, { versionMinor: "desc" }] });
    const itemId = "evidence-group-" + suffix;
    const spec = await prisma.courseSpec.create({ data: {
      courseId: course.id, versionMajor: (latest?.versionMajor ?? 0) + 1, versionMinor: 0,
      revisionType: "Major", revisionTriggers: ["ProgrammeCoordinator"], revisionReason: "Synthetic group evidence test",
      changeSummary: "Isolated test", reviewStatus: "Approved", approvedAt: new Date(),
      assessmentItems: { create: [{ id: itemId, order: 0, name: "Synthetic shared project and defence",
        type: "Project + Defense", mode: "GroupIndividual", groupWeight: 70, individualWeight: 30, status: "Active", weight: 100 }] },
    } });
    const term = "evidence-group-ci-" + suffix;
    const offering = await prisma.offering.create({ data: {
      courseId: course.id, courseSpecId: spec.id, lecturerId: lecturer.id, term, sectionCode: "A", status: "Active",
    } });
    const enrollmentIds: string[] = [];
    for (const marker of ["a", "b"]) {
      const profile = await prisma.student.create({ data: {
        name: "Synthetic group member " + marker, email: marker + suffix + "@example.invalid",
        studentId: "G-EVID-" + marker + suffix, status: "Active",
      } });
      enrollmentIds.push((await prisma.enrollment.create({ data: { offeringId: offering.id, studentId: profile.id } })).id);
    }
    const context = "/api/qa/assessment-evidence/offerings/" + offering.id + "/specs/" + spec.id + "/assessments/" + itemId;
    const groupPath = context + "/populations/group", componentPath = context + "/populations/component";
    const dashboard = "/api/qa/assessment-evidence/programmes/dse/dashboard?" + new URLSearchParams({ term }).toString();
    expect((await request(dashboard, null)).status).toBe(401);
    expect((await request(dashboard, lecturer)).status).toBe(404);
    expect((await request(dashboard, student)).status).toBe(404);
    expect((await request(dashboard, { ...coordinator, programmeRoles: [{ role: "program_coordinator", programmeId: "other-programme" }] })).status).toBe(404);
    const initial = await request(dashboard, coordinator);
    expect(initial.status).toBe(200);
    expect(initial.body.rows[0].assessments.map((x: { state: string }) => x.state)).toEqual(["not_ready", "not_ready"]);
    const workspace = await groupAssessmentService.replaceGroups(lecturer.id, false, offering.id, itemId, { groups: [{ name: "Synthetic Group A", enrollmentIds }] });
    const groupId = workspace.groups[0]!.id;
    await groupAssessmentService.saveGroupScore(lecturer.id, false, offering.id, itemId, groupId, { score: 80, maxScore: 100, feedback: "Synthetic group feedback" });
    for (const [i, enrollmentId] of enrollmentIds.entries()) {
      await groupAssessmentService.saveIndividualComponent(lecturer.id, false, offering.id, itemId, enrollmentId, {
        score: i === 0 ? 60 : 90, maxScore: 100, feedback: "Synthetic defence feedback", adjustmentPoints: 0, adjustmentReason: "",
      });
    }
    expect((await request(groupPath, lecturer)).body.suggestions.eligibleCount).toBe(0);
    await resultsLifecycleService.publishAssessment(lecturer.id, false, { offeringId: offering.id, assessmentItemId: itemId });
    await resultsLifecycleService.finalizeAssessment(lecturer.id, false, { offeringId: offering.id, assessmentItemId: itemId });
    expect((await request(context, lecturer)).status).toBe(409);
    expect((await request(groupPath, unrelated)).status).toBe(404);
    const shared = await request(groupPath, lecturer);
    const individual = await request(componentPath, lecturer);
    expect(shared.status).toBe(200); expect(individual.status).toBe(200);
    expect(shared.body.suggestions.eligibleCount).toBe(1);
    expect(shared.body.eligibleResults[0].memberEnrollmentIds).toHaveLength(2);
    expect(individual.body.suggestions.eligibleCount).toBe(2);
    const groupSource = shared.body.eligibleResults[0].resultId as string;
    const componentSource = individual.body.eligibleResults[0].resultId as string;
    const draft = { action: "create", expectedRevision: 0, selectionReason: "Synthetic marked sample", workReference: ref };
    const groupUrl = groupPath + "/results/" + groupSource + "/revisions";
    const componentUrl = componentPath + "/results/" + componentSource + "/revisions";
    expect((await request(groupPath + "/results/" + componentSource + "/revisions", lecturer, draft)).status).toBe(404);
    expect((await request(componentPath + "/results/" + groupSource + "/revisions", lecturer, draft)).status).toBe(404);
    for (const url of [groupUrl, componentUrl]) {
      expect((await request(url, lecturer, draft)).status).toBe(201);
      expect((await request(url, lecturer, { action: "submit", expectedRevision: 1, confirmedMarkedWork: true })).status).toBe(201);
      const review = { action: "verify", expectedRevision: 2, reviewReason: "Synthetic independent review", confirmedRestrictedWorkAndMarks: true };
      expect((await request(url, lecturer, review)).status).toBe(403);
      expect((await request(url, coordinator, review)).status).toBe(201);
    }
    const coverage = await request(dashboard, coordinator);
    expect(coverage.status).toBe(200);
    expect(coverage.body.totalOfferings).toBe(1);
    expect(coverage.body.rows[0].assessments).toEqual([
      expect.objectContaining({ population: "group", eligibleCount: 1, verified: 1, target: 1, gap: 0, state: "target_met" }),
      expect.objectContaining({ population: "component", eligibleCount: 2, verified: 1, target: 2, gap: 1, state: "evidence_needed" }),
    ]);
    expect(JSON.stringify(coverage.body)).not.toContain(groupSource);
    expect(JSON.stringify(coverage.body)).not.toContain(componentSource);
    expect(JSON.stringify(coverage.body)).not.toContain(ref);
    const officialGroup = await prisma.assessmentGroupScore.findUniqueOrThrow({ where: { id: groupSource } });
    const officialComponent = await prisma.assessmentIndividualComponent.findUniqueOrThrow({ where: { id: componentSource } });
    expect(officialGroup.score).toBe(80);
    await groupAssessmentService.correctGroupScore(lecturer.id, false, offering.id, itemId, groupId, {
      score: 85, maxScore: 100, feedback: "Synthetic corrected shared work", reason: "Synthetic moderation",
      expectedUpdatedAt: officialGroup.updatedAt.toISOString(),
    });
    const after = await request(dashboard, coordinator);
    expect(after.body.rows[0].assessments).toEqual([
      expect.objectContaining({ population: "group", stale: 1, verified: 0, gap: 1 }),
      expect.objectContaining({ population: "component", stale: 0, verified: 1, gap: 1 }),
    ]);
    await groupAssessmentService.correctIndividualComponent(lecturer.id, false, offering.id, itemId, officialComponent.enrollmentId, {
      score: officialComponent.score + 1, maxScore: officialComponent.maxScore, feedback: "Synthetic corrected defence",
      adjustmentPoints: 0, adjustmentReason: "", reason: "Synthetic moderation of defence", expectedUpdatedAt: officialComponent.updatedAt.toISOString(),
    });
    expect((await request(componentPath, coordinator)).body.evidence[0].effectiveStatus).toBe("stale");
    const stored = await prisma.assessmentEvidenceRevision.findFirstOrThrow({ where: { groupScoreId: groupSource, revision: 3 } });
    expect(stored.resultId).toBeNull();
    expect(stored.componentId).toBeNull();
    await expect(async () => { await prisma.assessmentEvidenceRevision.create({ data: {
      resultId: sourceId, groupScoreId: groupSource, offeringId: offering.id, courseSpecId: spec.id, assessmentItemId: itemId,
      revision: 4, status: "draft", action: "revise", sourceHash: stored.sourceHash, sourceSnapshot: stored.sourceSnapshot as Prisma.InputJsonObject,
      score: 85, maxScore: 100, selectionReason: "Invalid mixed source", actorId: lecturer.id,
    } }); }).toThrow();
  }, 60000);
});
