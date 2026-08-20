import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import type { Express } from "express";
import { createApp } from "../core/app.ts";
import { prisma } from "../core/db/prisma.ts";
import { signToken, type AuthUser, type Role } from "../core/auth/token.ts";
import { courseSpecRevisionService } from "../plugins/courses/revision-service.ts";

const runIntegration = process.env.BACKEND_INTEGRATION_TESTS === "1";
const integrationDescribe = runIntegration ? describe : describe.skip;

const TEST_SECRET = "issue-446-responsible-lecturer-integration-secret-at-least-32-characters";

type HttpResult = {
  status: number;
  body: unknown;
};

type ResponsibilityRow = {
  lecturerId: string;
};

type CourseSpecProgressRow = {
  courseId: string;
  code: string;
  title: string;
  completed: number;
  total: number;
  incompleteSections: Array<{ id: string; title: string }>;
};

integrationDescribe("Course Spec Responsible Lecturer integration", () => {
  let appServer: Server;
  let baseUrl = "";
  let coordinator: AuthUser;
  let lecturerA: AuthUser;
  let lecturerB: AuthUser;
  let outsider: AuthUser;

  beforeAll(async () => {
    process.env.AUTH_MODE = "dev";
    process.env.JWT_SECRET = TEST_SECRET;

    [coordinator, lecturerA, lecturerB, outsider] = await Promise.all([
      loadAuthUser("coordinator@dse.dev"),
      loadAuthUser("lecturer@dse.dev"),
      loadAuthUser("hopper.lecturer@dse.dev"),
      loadAuthUser("knuth.lecturer@dse.dev"),
    ]);

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

  test("programme coordinator assigns multiple equal Responsible Lecturers", async () => {
    const course = await createCourse("ASSIGN");
    try {
      const response = await assignTeam(course.id, [lecturerA.id, lecturerB.id]);
      expect(response.status).toBe(200);

      const body = response.body as {
        courseSpecId?: string;
        academicVersion?: string;
        reviewStatus?: string;
        lecturers?: Array<{ id: string }>;
      };
      expect(body.courseSpecId).toBeTruthy();
      expect(body.academicVersion).toBe("1.0");
      expect(body.reviewStatus).toBe("Draft");
      expect(body.lecturers?.map((lecturer) => lecturer.id).sort()).toEqual(
        [lecturerA.id, lecturerB.id].sort(),
      );

      const rows = await responsibilityRows(body.courseSpecId!);
      expect(rows.map((row) => row.lecturerId).sort()).toEqual(
        [lecturerA.id, lecturerB.id].sort(),
      );
    } finally {
      await deleteCourse(course.id);
    }
  });

  test("Responsible Lecturers can access the Course Spec before any Offering exists", async () => {
    const course = await createCourse("PREOFFER");
    try {
      expect(await prisma.offering.count({ where: { courseId: course.id } })).toBe(0);
      expect((await assignTeam(course.id, [lecturerA.id, lecturerB.id])).status).toBe(200);

      for (const lecturer of [lecturerA, lecturerB]) {
        const response = await request(`/api/courses/${course.id}/spec`, {
          token: signToken(lecturer),
        });
        expect(response.status).toBe(200);

        const list = await request("/api/courses", { token: signToken(lecturer) });
        expect(list.status).toBe(200);
        expect(
          (list.body as Array<{ id: string }>).some((item) => item.id === course.id),
        ).toBe(true);
      }

      const blocked = await request(`/api/courses/${course.id}/spec`, {
        token: signToken(outsider),
      });
      expect(blocked.status).toBe(403);
    } finally {
      await deleteCourse(course.id);
    }
  });

  test("spec progress includes Responsible-Lecturer and Offering scopes without leaking", async () => {
    const createdCourseIds: string[] = [];
    const createFixtureCourse = async (label: string) => {
      const course = await createCourse(label);
      createdCourseIds.push(course.id);
      return course;
    };

    try {
      const responsibleOnly = await createFixtureCourse("PROGRESS-RESP");
      expect(
        await prisma.offering.count({ where: { courseId: responsibleOnly.id } }),
      ).toBe(0);
      expect((await assignTeam(responsibleOnly.id, [lecturerA.id])).status).toBe(200);

      const offeringPrimary = await createFixtureCourse("PROGRESS-PRIMARY");
      const primarySpecId = await createApprovedSpec(offeringPrimary.id, []);
      await createOfferingFixture(
        offeringPrimary.id,
        primarySpecId,
        lecturerA.id,
      );

      const offeringCoLecturer = await createFixtureCourse("PROGRESS-CO");
      const coSpecId = await createApprovedSpec(offeringCoLecturer.id, []);
      await createOfferingFixture(
        offeringCoLecturer.id,
        coSpecId,
        lecturerB.id,
        [lecturerA.id],
      );

      const responsibleAndOffering = await createFixtureCourse("PROGRESS-BOTH");
      const bothSpecId = await createApprovedSpec(
        responsibleAndOffering.id,
        [lecturerA.id],
      );
      await createOfferingFixture(
        responsibleAndOffering.id,
        bothSpecId,
        lecturerA.id,
      );

      const lecturerProgressResponse = await request(
        "/api/courses/spec-progress",
        { token: signToken(lecturerA) },
      );
      expect(lecturerProgressResponse.status).toBe(200);
      const lecturerProgress =
        lecturerProgressResponse.body as CourseSpecProgressRow[];

      for (const course of [
        responsibleOnly,
        offeringPrimary,
        offeringCoLecturer,
        responsibleAndOffering,
      ]) {
        expect(
          lecturerProgress.filter((row) => row.courseId === course.id),
        ).toHaveLength(1);
      }

      const responsibleOnlyProgress = lecturerProgress.find(
        (row) => row.courseId === responsibleOnly.id,
      );
      expect(responsibleOnlyProgress).toBeDefined();
      expect(responsibleOnlyProgress!.completed).toBe(0);
      expect(responsibleOnlyProgress!.total).toBeGreaterThan(0);
      expect(responsibleOnlyProgress!.incompleteSections).toHaveLength(
        responsibleOnlyProgress!.total,
      );

      const outsiderProgressResponse = await request(
        "/api/courses/spec-progress",
        { token: signToken(outsider) },
      );
      expect(outsiderProgressResponse.status).toBe(200);
      const outsiderProgress = outsiderProgressResponse.body as CourseSpecProgressRow[];
      const protectedCourseIds = new Set([
        responsibleOnly.id,
        offeringPrimary.id,
        offeringCoLecturer.id,
        responsibleAndOffering.id,
      ]);
      expect(
        outsiderProgress.some((row) => protectedCourseIds.has(row.courseId)),
      ).toBe(false);

      const coordinatorProgressResponse = await request(
        "/api/courses/spec-progress",
        { token: signToken(coordinator) },
      );
      expect(coordinatorProgressResponse.status).toBe(200);
      const coordinatorProgress =
        coordinatorProgressResponse.body as CourseSpecProgressRow[];
      for (const courseId of protectedCourseIds) {
        expect(
          coordinatorProgress.some((row) => row.courseId === courseId),
        ).toBe(true);
      }
    } finally {
      for (const courseId of createdCourseIds.reverse()) {
        await deleteCourse(courseId);
      }
    }
  });

  test("Responsible Lecturer membership is locked after Course Spec submission", async () => {
    const course = await createCourse("LOCK");
    try {
      const assigned = await assignTeam(course.id, [lecturerA.id, lecturerB.id]);
      expect(assigned.status).toBe(200);
      const courseSpecId = (assigned.body as { courseSpecId: string }).courseSpecId;

      await prisma.courseSpec.update({
        where: { id: courseSpecId },
        data: { reviewStatus: "Submitted", submittedAt: new Date() },
      });

      const locked = await assignTeam(course.id, [lecturerA.id]);
      expect(locked.status).toBe(409);
      expect(errorMessage(locked.body)).toContain("locked");

      const rows = await responsibilityRows(courseSpecId);
      expect(rows.map((row) => row.lecturerId).sort()).toEqual(
        [lecturerA.id, lecturerB.id].sort(),
      );
    } finally {
      await deleteCourse(course.id);
    }
  });

  test("a new academic revision inherits the exact Responsible Lecturer team", async () => {
    const course = await createCourse("INHERIT");
    try {
      const assigned = await assignTeam(course.id, [lecturerA.id, lecturerB.id]);
      expect(assigned.status).toBe(200);
      const sourceId = (assigned.body as { courseSpecId: string }).courseSpecId;

      await prisma.courseSpec.update({
        where: { id: sourceId },
        data: {
          reviewStatus: "Approved",
          approvedAt: new Date(),
        },
      });

      const revision = await courseSpecRevisionService.createCourseSpecRevision({
        courseId: course.id,
        revisionType: "Minor",
        triggers: ["Other"],
        reason: "Focused integration coverage for Responsible Lecturer inheritance.",
        changeSummary: "Create the next draft without changing the responsible team.",
        initiatedById: coordinator.id,
      });

      expect(revision.basedOnVersionId).toBe(sourceId);
      expect(revision.reviewStatus).toBe("Draft");

      const sourceRows = await responsibilityRows(sourceId);
      const revisionRows = await responsibilityRows(revision.id);
      expect(revisionRows.map((row) => row.lecturerId).sort()).toEqual(
        sourceRows.map((row) => row.lecturerId).sort(),
      );
      expect(revisionRows.map((row) => row.lecturerId).sort()).toEqual(
        [lecturerA.id, lecturerB.id].sort(),
      );
    } finally {
      await deleteCourse(course.id);
    }
  });

  async function assignTeam(courseId: string, lecturerIds: string[]): Promise<HttpResult> {
    return request(`/api/courses/${courseId}/spec/responsible-lecturers`, {
      method: "PUT",
      token: signToken(coordinator),
      body: { lecturerIds },
    });
  }

  async function createApprovedSpec(
    courseId: string,
    lecturerIds: string[],
  ): Promise<string> {
    const assigned = await assignTeam(courseId, lecturerIds);
    expect(assigned.status).toBe(200);
    const courseSpecId = (assigned.body as { courseSpecId: string }).courseSpecId;
    expect(courseSpecId).toBeTruthy();

    await prisma.courseSpec.update({
      where: { id: courseSpecId },
      data: {
        reviewStatus: "Approved",
        approvedAt: new Date(),
      },
    });

    return courseSpecId;
  }

  async function createOfferingFixture(
    courseId: string,
    courseSpecId: string,
    lecturerId: string,
    coLecturerIds: string[] = [],
  ): Promise<void> {
    const token = crypto.randomUUID().slice(0, 8);
    await prisma.offering.create({
      data: {
        courseId,
        courseSpecId,
        lecturerId,
        term: `I465-${token}`,
        sectionCode: "A",
        capacity: 30,
        status: "Planned",
        coLecturers: coLecturerIds.length
          ? {
              create: coLecturerIds.map((coLecturerId) => ({
                lecturerId: coLecturerId,
              })),
            }
          : undefined,
      },
    });
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

async function createCourse(label: string) {
  const token = crypto.randomUUID().slice(0, 8);
  return prisma.course.create({
    data: {
      code: `I446-${label}-${token}`,
      title: `Issue 446 ${label} integration fixture`,
      description: "Responsible Lecturer focused integration fixture",
      credits: 3,
      courseType: "Core",
      totalSltHours: 120,
      programmeId: "dse",
    },
    select: { id: true },
  });
}

async function deleteCourse(courseId: string): Promise<void> {
  await prisma.offering.deleteMany({ where: { courseId } });
  await prisma.course.delete({ where: { id: courseId } });
}

async function responsibilityRows(courseSpecId: string): Promise<ResponsibilityRow[]> {
  return prisma.$queryRaw<ResponsibilityRow[]>`
    SELECT "lecturerId"
    FROM "CourseSpecResponsibleLecturer"
    WHERE "courseSpecId" = ${courseSpecId}
    ORDER BY "lecturerId"
  `;
}

async function loadAuthUser(email: string): Promise<AuthUser> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { email },
    include: { roleAssignments: { include: { role: true } } },
  });
  const roles = user.roleAssignments.map((assignment) => assignment.role.slug as Role);
  if (roles.length === 0) throw new Error(`Seeded integration user ${email} has no roles`);
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

function errorMessage(body: unknown): string {
  if (body && typeof body === "object" && "error" in body) {
    return String((body as { error: unknown }).error);
  }
  return "";
}

async function closeServer(server: Server | undefined): Promise<void> {
  if (!server?.listening) return;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}
