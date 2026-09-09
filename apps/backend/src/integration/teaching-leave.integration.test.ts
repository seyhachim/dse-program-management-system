import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { Express } from "express";
import { createApp } from "../core/app.ts";
import { signToken, type AuthUser, type Role } from "../core/auth/token.ts";
import { prisma } from "../core/db/prisma.ts";

const runIntegration = process.env.BACKEND_INTEGRATION_TESTS === "1";
const integrationDescribe = runIntegration ? describe : describe.skip;

const SESSION_DATE = "2099-01-05"; // Monday, intentionally far-future for a stable integration fixture.
const REVISION_SESSION_DATE = "2099-01-12"; // Monday, separate exact occurrence for resubmission coverage.

type HttpResult = { status: number; body: any };

integrationDescribe("Teaching leave authorization and approval", () => {
  let appServer: Server;
  let baseUrl = "";
  let lecturer: AuthUser;
  let coordinator: AuthUser;
  let outsider: AuthUser;
  let offeringId = "";
  let meetingId = "";
  let requestId = "";

  beforeAll(async () => {
    process.env.AUTH_MODE = "dev";
    process.env.TEACHING_LEAVE_NOTICE_HOURS = "24";
    lecturer = await loadAuthUser("lecturer@dse.dev");
    coordinator = await loadAuthUser("coordinator@dse.dev");
    outsider = await loadAuthUser("hopper.lecturer@dse.dev");

    const course = await prisma.course.create({
      data: {
        code: `LEAVE-${crypto.randomUUID().slice(0, 8)}`,
        title: "Teaching Leave Integration Fixture",
        programmeId: "dse",
      },
    });
    const offering = await prisma.offering.create({
      data: {
        courseId: course.id,
        lecturerId: lecturer.id,
        term: `2099-S1-${crypto.randomUUID().slice(0, 6)}`,
        sectionCode: "A",
        status: "Active",
        startDate: new Date("2099-01-01T00:00:00.000Z"),
        endDate: new Date("2099-02-28T00:00:00.000Z"),
        meetings: {
          create: {
            dayOfWeek: "Monday",
            startTime: "08:00",
            endTime: "10:00",
            room: "R932",
            activityType: "Lecture",
          },
        },
      },
      include: { meetings: true },
    });
    offeringId = offering.id;
    meetingId = offering.meetings[0]!.id;

    const app: Express = createApp();
    appServer = app.listen(0, "127.0.0.1");
    await once(appServer, "listening");
    const address = appServer.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await closeServer(appServer);
    await prisma.$disconnect();
  });

  test("assigned lecturer submits exact-session leave and unrelated lecturer cannot submit it", async () => {
    const input = leaveInput(SESSION_DATE);

    const denied = await request("/api/offerings/teaching-leave/requests", {
      method: "POST",
      token: signToken(outsider),
      body: input,
    });
    expect(denied.status).toBe(403);

    const submitted = await request("/api/offerings/teaching-leave/requests", {
      method: "POST",
      token: signToken(lecturer),
      body: input,
    });
    expect(submitted.status).toBe(201);
    expect(submitted.body.status).toBe("PENDING");
    expect(submitted.body.confidentialReason).toBe("Private integration reason");
    expect(submitted.body.occurrences).toHaveLength(1);
    expect(submitted.body.occurrences[0]).toMatchObject({
      offeringId,
      offeringMeetingId: meetingId,
      sessionDate: SESSION_DATE,
      releaseForReuse: true,
    });
    requestId = submitted.body.id;
  });

  test("self-review and cross-programme review fail closed", async () => {
    expect(requestId).not.toBe("");
    const selfAsCoordinator: AuthUser = {
      ...lecturer,
      roles: [...new Set([...lecturer.roles, "program_coordinator" as Role])],
      programmeRoles: [
        ...lecturer.programmeRoles,
        { role: "program_coordinator", programmeId: "dse" },
      ],
    };
    const selfReview = await request(`/api/offerings/teaching-leave/requests/${requestId}/review`, {
      method: "POST",
      token: signToken(selfAsCoordinator),
      body: { decision: "APPROVE" },
    });
    expect(selfReview.status).toBe(403);

    const wrongProgramme: AuthUser = {
      ...coordinator,
      programmeRoles: [{ role: "program_coordinator", programmeId: "other-programme" }],
    };
    const crossProgramme = await request(`/api/offerings/teaching-leave/requests/${requestId}/review`, {
      method: "POST",
      token: signToken(wrongProgramme),
      body: { decision: "APPROVE" },
    });
    expect(crossProgramme.status).toBe(403);
  });

  test("request-changes is guided, requester-only, auditable, and requires resubmission before more review", async () => {
    const submitted = await request("/api/offerings/teaching-leave/requests", {
      method: "POST",
      token: signToken(lecturer),
      body: leaveInput(REVISION_SESSION_DATE),
    });
    expect(submitted.status).toBe(201);
    const revisionRequestId = submitted.body.id as string;
    const occurrenceId = submitted.body.occurrences[0].occurrenceId as string;

    const unguided = await request(`/api/offerings/teaching-leave/requests/${revisionRequestId}/review`, {
      method: "POST",
      token: signToken(coordinator),
      body: { decision: "REQUEST_CHANGES" },
    });
    expect(unguided.status).toBe(400);

    const changes = await request(`/api/offerings/teaching-leave/requests/${revisionRequestId}/review`, {
      method: "POST",
      token: signToken(coordinator),
      body: { decision: "REQUEST_CHANGES", comment: "Clarify how the original course will be recovered." },
    });
    expect(changes.status).toBe(200);
    expect(changes.body.request.status).toBe("CHANGES_REQUESTED");
    expect(changes.body.notifications.students.sent).toBe(0);
    expect(changes.body.notifications.lecturerGroup).toEqual([]);

    const prematureApproval = await request(`/api/offerings/teaching-leave/requests/${revisionRequestId}/review`, {
      method: "POST",
      token: signToken(coordinator),
      body: { decision: "APPROVE" },
    });
    expect(prematureApproval.status).toBe(409);

    const queueWhileWaiting = await request("/api/offerings/teaching-leave/review-queue", {
      token: signToken(coordinator),
    });
    expect(queueWhileWaiting.status).toBe(200);
    expect(queueWhileWaiting.body.some((item: { id: string }) => item.id === revisionRequestId)).toBe(false);

    const outsiderRevision = await request(`/api/offerings/teaching-leave/requests/${revisionRequestId}/resubmit`, {
      method: "POST",
      token: signToken(outsider),
      body: revisedLeaveInput(),
    });
    expect(outsiderRevision.status).toBe(403);

    const revised = await request(`/api/offerings/teaching-leave/requests/${revisionRequestId}/resubmit`, {
      method: "POST",
      token: signToken(lecturer),
      body: revisedLeaveInput(),
    });
    expect(revised.status).toBe(200);
    expect(revised.body.status).toBe("PENDING");
    expect(revised.body.confidentialReason).toBe("Updated private integration reason");
    expect(revised.body.occurrences).toHaveLength(1);
    expect(revised.body.occurrences[0]).toMatchObject({
      occurrenceId,
      offeringId,
      offeringMeetingId: meetingId,
      sessionDate: REVISION_SESSION_DATE,
      releaseForReuse: true,
    });

    const queueAfterResubmit = await request("/api/offerings/teaching-leave/review-queue", {
      token: signToken(coordinator),
    });
    expect(queueAfterResubmit.status).toBe(200);
    expect(queueAfterResubmit.body.some((item: { id: string }) => item.id === revisionRequestId)).toBe(true);

    const audits = await prisma.$queryRaw<Array<{
      action: string;
      previousStatus: string | null;
      newStatus: string | null;
      details: Record<string, unknown> | null;
    }>>`
      SELECT "action","previousStatus","newStatus","details"
      FROM "pms_attendance"."TeachingLeaveAuditEvent"
      WHERE "requestId"=${revisionRequestId}
      ORDER BY "createdAt","id"
    `;
    expect(audits.map((item) => item.action)).toEqual(["SUBMITTED", "CHANGES_REQUESTED", "SUBMITTED"]);
    expect(audits[2]).toMatchObject({ previousStatus: "CHANGES_REQUESTED", newStatus: "PENDING" });
    expect(audits[2]?.details).toMatchObject({ resubmitted: true });

    const rejected = await request(`/api/offerings/teaching-leave/requests/${revisionRequestId}/review`, {
      method: "POST",
      token: signToken(coordinator),
      body: { decision: "REJECT", comment: "Close integration fixture" },
    });
    expect(rejected.status).toBe(200);
    expect(rejected.body.request.status).toBe("REJECTED");
  });

  test("programme coordinator approval is auditable, occurrence-linked, idempotent, and tolerates missing Telegram destinations", async () => {
    const first = await request(`/api/offerings/teaching-leave/requests/${requestId}/review`, {
      method: "POST",
      token: signToken(coordinator),
      body: { decision: "APPROVE", comment: "Approved integration fixture" },
    });
    expect(first.status).toBe(200);
    expect(first.body.changed).toBe(true);
    expect(first.body.request.status).toBe("APPROVED");
    expect(first.body.notifications.lecturerGroup).toHaveLength(1);
    expect(["missing", "failed"]).toContain(first.body.notifications.lecturerGroup[0].status);

    const occurrence = await prisma.$queryRaw<Array<{ approvedLeaveRequestId: string | null }>>`
      SELECT "approvedLeaveRequestId"
      FROM "pms_attendance"."TeachingSessionOccurrence"
      WHERE "offeringId" = ${offeringId} AND "offeringMeetingId" = ${meetingId}
        AND "sessionDate" = ${SESSION_DATE}::date
    `;
    expect(occurrence[0]?.approvedLeaveRequestId).toBe(requestId);

    const audits = await prisma.$queryRaw<Array<{ action: string; previousStatus: string | null; newStatus: string | null }>>`
      SELECT "action","previousStatus","newStatus"
      FROM "pms_attendance"."TeachingLeaveAuditEvent"
      WHERE "requestId"=${requestId}
      ORDER BY "createdAt","id"
    `;
    expect(audits.map((item) => item.action)).toEqual(["SUBMITTED", "APPROVED"]);
    expect(audits[1]).toMatchObject({ previousStatus: "PENDING", newStatus: "APPROVED" });

    const repeated = await request(`/api/offerings/teaching-leave/requests/${requestId}/review`, {
      method: "POST",
      token: signToken(coordinator),
      body: { decision: "APPROVE", comment: "Repeated approval" },
    });
    expect(repeated.status).toBe(200);
    expect(repeated.body.changed).toBe(false);
    const auditCount = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count FROM "pms_attendance"."TeachingLeaveAuditEvent"
      WHERE "requestId"=${requestId}
    `;
    expect(Number(auditCount[0]?.count ?? 0n)).toBe(2);
  });

  function leaveInput(date: string) {
    return {
      occurrences: [{
        offeringId,
        offeringMeetingId: meetingId,
        date,
        releaseForReuse: true,
      }],
      leaveType: "OFFICIAL_DUTY",
      confidentialReason: "Private integration reason",
      attachmentRef: "private://reference-only",
      proposedHandling: "OPEN_SLOT",
      proposedNote: "Recover the original course separately",
    };
  }

  function revisedLeaveInput() {
    return {
      leaveType: "OFFICIAL_DUTY",
      confidentialReason: "Updated private integration reason",
      attachmentRef: "private://updated-reference-only",
      proposedHandling: "MAKE_UP",
      proposedNote: "Updated recovery plan after reviewer guidance",
    };
  }

  async function request(
    path: string,
    options: { method?: string; token?: string; body?: unknown } = {},
  ): Promise<HttpResult> {
    const headers = new Headers();
    if (options.token) headers.set("authorization", `Bearer ${options.token}`);
    if (options.body !== undefined) headers.set("content-type", "application/json");
    const response = await fetch(`${baseUrl}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  }
});

async function loadAuthUser(email: string): Promise<AuthUser> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { email },
    include: { roleAssignments: { include: { role: true } } },
  });
  const roles = user.roleAssignments.map((assignment) => assignment.role.slug as Role);
  return {
    id: user.id,
    email: user.email,
    roles,
    programmeRoles: user.roleAssignments.map((assignment) => ({
      role: assignment.role.slug as Role,
      programmeId: assignment.programmeId,
    })),
  };
}

async function closeServer(server: Server | undefined): Promise<void> {
  if (!server?.listening) return;
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
