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

const TEST_SECRET =
  "issue-469-section-presence-integration-secret-at-least-32-characters";

type HttpResult = {
  status: number;
  body: unknown;
};

type SectionPresenceRow = {
  courseId: string;
  hasSections: boolean;
};

integrationDescribe("Course section presence metadata", () => {
  let appServer: Server;
  let baseUrl = "";
  let coordinator: AuthUser;
  let responsibleLecturer: AuthUser;
  let otherLecturer: AuthUser;
  let outsider: AuthUser;

  beforeAll(async () => {
    process.env.AUTH_MODE = "dev";
    process.env.JWT_SECRET = TEST_SECRET;

    [coordinator, responsibleLecturer, otherLecturer, outsider] =
      await Promise.all([
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

  test("distinguishes true zero-section courses from sections assigned to another lecturer without leaking details", async () => {
    const noSectionCourse = await createCourse("NONE");
    const unassignedSectionCourse = await createCourse("UNASSIGNED");

    try {
      const noSectionAssignment = await assignResponsibleLecturer(
        noSectionCourse.id,
      );
      expect(noSectionAssignment.status).toBe(200);
      expect(
        await prisma.offering.count({ where: { courseId: noSectionCourse.id } }),
      ).toBe(0);

      const unassignedAssignment = await assignResponsibleLecturer(
        unassignedSectionCourse.id,
      );
      expect(unassignedAssignment.status).toBe(200);
      const unassignedSpecId = (unassignedAssignment.body as {
        courseSpecId: string;
      }).courseSpecId;
      await prisma.courseSpec.update({
        where: { id: unassignedSpecId },
        data: { reviewStatus: "Approved", approvedAt: new Date() },
      });
      await prisma.offering.create({
        data: {
          courseId: unassignedSectionCourse.id,
          courseSpecId: unassignedSpecId,
          lecturerId: otherLecturer.id,
          term: `I469-${crypto.randomUUID().slice(0, 8)}`,
          sectionCode: "A",
          capacity: 30,
          status: "Planned",
        },
      });

      const scopedOfferings = await request("/api/offerings", {
        token: signToken(responsibleLecturer),
      });
      expect(scopedOfferings.status).toBe(200);
      expect(
        (scopedOfferings.body as Array<{ course?: { id?: string } | null }>).some(
          (offering) => offering.course?.id === unassignedSectionCourse.id,
        ),
      ).toBe(false);

      const lecturerPresenceResponse = await request(
        "/api/courses/section-presence",
        { token: signToken(responsibleLecturer) },
      );
      expect(lecturerPresenceResponse.status).toBe(200);
      const lecturerPresence = lecturerPresenceResponse.body as SectionPresenceRow[];
      expect(
        lecturerPresence.find((row) => row.courseId === noSectionCourse.id),
      ).toEqual({ courseId: noSectionCourse.id, hasSections: false });
      expect(
        lecturerPresence.find(
          (row) => row.courseId === unassignedSectionCourse.id,
        ),
      ).toEqual({ courseId: unassignedSectionCourse.id, hasSections: true });

      const outsiderPresenceResponse = await request(
        "/api/courses/section-presence",
        { token: signToken(outsider) },
      );
      expect(outsiderPresenceResponse.status).toBe(200);
      const outsiderPresence = outsiderPresenceResponse.body as SectionPresenceRow[];
      expect(
        outsiderPresence.some((row) => row.courseId === noSectionCourse.id),
      ).toBe(false);
      expect(
        outsiderPresence.some(
          (row) => row.courseId === unassignedSectionCourse.id,
        ),
      ).toBe(false);

      const coordinatorPresenceResponse = await request(
        "/api/courses/section-presence",
        { token: signToken(coordinator) },
      );
      expect(coordinatorPresenceResponse.status).toBe(200);
      const coordinatorPresence =
        coordinatorPresenceResponse.body as SectionPresenceRow[];
      expect(
        coordinatorPresence.find((row) => row.courseId === noSectionCourse.id),
      ).toEqual({ courseId: noSectionCourse.id, hasSections: false });
      expect(
        coordinatorPresence.find(
          (row) => row.courseId === unassignedSectionCourse.id,
        ),
      ).toEqual({ courseId: unassignedSectionCourse.id, hasSections: true });
    } finally {
      await deleteCourse(unassignedSectionCourse.id);
      await deleteCourse(noSectionCourse.id);
    }
  });

  async function assignResponsibleLecturer(courseId: string): Promise<HttpResult> {
    return request(`/api/courses/${courseId}/spec/responsible-lecturers`, {
      method: "PUT",
      token: signToken(coordinator),
      body: { lecturerIds: [responsibleLecturer.id] },
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
      code: `I469-${label}-${token}`,
      title: `Issue 469 ${label} section-presence fixture`,
      description: "Course section-presence wording integration fixture",
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

async function loadAuthUser(email: string): Promise<AuthUser> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { email },
    include: { roleAssignments: { include: { role: true } } },
  });
  const roles = user.roleAssignments.map(
    (assignment) => assignment.role.slug as Role,
  );
  if (roles.length === 0) {
    throw new Error(`Seeded integration user ${email} has no roles`);
  }
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
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}
