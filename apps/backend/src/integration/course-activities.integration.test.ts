import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import type { AuthUser, Role } from "../core/auth/token.ts";
import { signToken } from "../core/auth/token.ts";
import { createApp } from "../core/app.ts";
import { prisma } from "../core/db/prisma.ts";

const enabled = process.env.BACKEND_INTEGRATION_TESTS === "1";
const describeIsolated = enabled ? describe : describe.skip;

type ResponseData = { status: number; body: Record<string, unknown> | unknown[] };
type Activity = {
  id: string; offeringId: string; title: string; status: string;
  version: number; date: string; type: string; evidenceLinks: unknown[];
};
type Audit = { action: string; actorId: string };

const sindora = {
  type: "field_visit",
  title: "Sindora Garden Field Visit",
  date: "2026-11-22",
  startTime: "13:30",
  endTime: "16:00",
  host: "Sindora Garden of Pepper",
  location: "Kampot Province, Cambodia",
  objectives: "Observe regenerative agriculture, identify operational problems, and explore feasible data/sensor/AI opportunities.",
  reflectionPrompt: "Describe one observed farm problem and the data required to investigate it.",
  evidenceLinks: [{ kind: "report", label: "Field reflection", url: "https://example.org/field-reflection" }],
};

describeIsolated("Course Activities Sindora pilot — isolated API/database release gate", () => {
  let server: Server | undefined;
  let baseUrl = "";
  let lecturer: AuthUser;
  let coordinator: AuthUser;
  let student: AuthUser;
  let unrelated: AuthUser;
  let offeringId = "";
  let otherOfferingId = "";
  const courseIds: string[] = [];
  const createdUserIds: string[] = [];
  let activityId = "";

  beforeAll(async () => {
    // This integration test creates representative records. Never run it on a hosted DB.
    const host = new URL(process.env.DATABASE_URL ?? "postgresql://invalid:invalid@remote.invalid/db").hostname;
    if (host !== "localhost" && host !== "127.0.0.1") {
      throw new Error("Course Activities pilot integration requires an isolated local PostgreSQL database");
    }
    process.env.AUTH_MODE = "dev";
    process.env.JWT_SECRET = "course-activities-isolated-pilot-test-secret-at-least-32-characters";

    [lecturer, coordinator, student] = await Promise.all([
      loadAuthUser("lecturer@dse.dev"),
      loadAuthUser("coordinator@dse.dev"),
      loadAuthUser("student@dse.dev"),
    ]);
    const outsider = await prisma.user.create({
      data: {
        email: "course-activity-outsider-" + crypto.randomUUID() + "@example.test",
        name: "Unrelated Lecturer",
      },
    });
    createdUserIds.push(outsider.id);
    unrelated = {
      id: outsider.id, email: outsider.email, roles: ["lecturer"],
      programmeRoles: [{ role: "lecturer", programmeId: "dse" }],
    };

    const createOffering = async (suffix: string) => {
      const random = crypto.randomUUID().slice(0, 8);
      const course = await prisma.course.create({
        data: {
          code: "AIE401-PILOT-" + suffix + "-" + random,
          title: "AI Engineering for Smart Agriculture — isolated activity pilot",
          programmeId: "dse",
        },
      });
      courseIds.push(course.id);
      const offering = await prisma.offering.create({
        data: {
          courseId: course.id,
          lecturerId: lecturer.id,
          term: "2026-isolated-activity-" + random,
          sectionCode: "A",
          status: "Planned",
        },
      });
      return offering.id;
    };
    offeringId = await createOffering("A");
    otherOfferingId = await createOffering("B");

    const app = createApp();
    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    baseUrl = "http://127.0.0.1:" + (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    if (server?.listening) {
      await new Promise<void>((resolve, reject) => {
        server!.close((error) => error ? reject(error) : resolve());
      });
    }
    const offerings = [offeringId, otherOfferingId].filter(Boolean);
    if (activityId) {
      await prisma.offeringActivityAuditEvent.deleteMany({ where: { activityId } });
      await prisma.offeringActivity.deleteMany({ where: { id: activityId } });
    }
    if (offerings.length) await prisma.offering.deleteMany({ where: { id: { in: offerings } } });
    if (courseIds.length) await prisma.course.deleteMany({ where: { id: { in: courseIds } } });
    if (createdUserIds.length) await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  const request = async (path: string, user: AuthUser | null, method = "GET", body?: unknown): Promise<ResponseData> => {
    const headers = new Headers();
    if (user) headers.set("Authorization", "Bearer " + signToken(user));
    if (body !== undefined) headers.set("Content-Type", "application/json");
    const response = await fetch(baseUrl + path, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() as ResponseData["body"] };
  };

  test("denies unauthenticated callers, students, and unrelated lecturers", async () => {
    const url = "/api/offerings/" + offeringId + "/activities";
    expect((await request(url, null)).status).toBe(401);
    expect((await request(url, student)).status).toBe(403);
    expect((await request(url, unrelated)).status).toBe(403);
    expect((await request(url, unrelated, "POST", sindora)).status).toBe(403);
    expect((await request(url, coordinator)).status).toBe(200);
    const crossProgrammeCoordinator: AuthUser = {
      ...coordinator,
      programmeRoles: [{ role: "program_coordinator", programmeId: "other-programme" }],
    };
    expect((await request(url, crossProgrammeCoordinator)).status).toBe(403);
  });

  test("creates, validates, version-controls, archives, and retains Sindora evidence only in the owned offering", async () => {
    const url = "/api/offerings/" + offeringId + "/activities";
    const invalid = await request(url, lecturer, "POST", {
      ...sindora, evidenceLinks: [{ kind: "report", label: "Invalid", url: "http://insecure.example" }],
    });
    expect(invalid.status).toBe(400);

    const create = await request(url, lecturer, "POST", sindora);
    expect(create.status).toBe(201);
    const initial = create.body as Activity;
    activityId = initial.id;
    expect(initial.offeringId).toBe(offeringId);
    expect(initial.title).toBe(sindora.title);
    expect(initial.date).toBe(sindora.date);
    expect(initial.status).toBe("Draft");
    expect(initial.version).toBe(1);
    expect(initial.evidenceLinks).toHaveLength(1);

    const list = await request(url, lecturer);
    expect(list.status).toBe(200);
    expect((list.body as Activity[]).some(x => x.id === activityId)).toBe(true);

    // A lecturer may own both offerings but can never resolve one offering's record under another.
    const wrongParent = "/api/offerings/" + otherOfferingId + "/activities/" + activityId;
    expect((await request(wrongParent, lecturer)).status).toBe(404);
    expect((await request(wrongParent, lecturer, "PATCH", { expectedVersion: 1, title: "Wrong offering" })).status).toBe(404);

    const detail = url + "/" + activityId;
    expect((await request(detail, student)).status).toBe(403);
    expect((await request(detail, unrelated)).status).toBe(403);

    const edit = await request(detail, lecturer, "PATCH", {
      expectedVersion: 1, status: "Published",
      description: "Observed regenerative pepper farming; AI needs assessment is exploratory.",
    });
    expect(edit.status).toBe(200);
    expect((edit.body as Activity).version).toBe(2);
    expect((edit.body as Activity).status).toBe("Published");

    const stale = await request(detail, lecturer, "PATCH", { expectedVersion: 1, title: "Stale edit" });
    expect(stale.status).toBe(409);

    const changed = await request(detail, lecturer, "PATCH", {
      expectedVersion: 2, startTime: "16:00", endTime: "13:30",
    });
    expect(changed.status).toBe(409);

    const archive = await request(detail, lecturer, "PATCH", { expectedVersion: 2, status: "Archived" });
    expect(archive.status).toBe(200);
    expect((archive.body as Activity).version).toBe(3);
    expect((archive.body as Activity).status).toBe("Archived");
    expect((await request(detail, lecturer, "PATCH", { expectedVersion: 3, title: "Rewrite history" })).status).toBe(409);

    const history = await request(detail + "/history", lecturer);
    expect(history.status).toBe(200);
    expect((history.body as Audit[]).map(item => item.action)).toEqual(["created", "updated", "archived"]);
    expect((history.body as Audit[]).every(item => item.actorId === lecturer.id)).toBe(true);
    expect((await request(detail, lecturer)).status).toBe(200);

    // Activities do not make attendance or portfolio evidence automatically.
    const [attendanceRows, portfolios] = await Promise.all([
      prisma.$queryRaw<Array<{ total: bigint }>>`
        SELECT count(*)::bigint AS total
        FROM pms_attendance."AttendanceSession"
        WHERE "offeringId" = ${offeringId}
      `,
      prisma.studentPortfolioEvidence.count({ where: { sourceOfferingId: offeringId } }),
    ]);
    expect(Number(attendanceRows[0]?.total ?? 0n)).toBe(0);
    expect(portfolios).toBe(0);
  });
});

async function loadAuthUser(email: string): Promise<AuthUser> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { email },
    include: { roleAssignments: { include: { role: true } } },
  });
  const roles = user.roleAssignments.map((assignment) => assignment.role.slug as Role);
  if (!roles.length) throw new Error("Seeded integration account is missing roles: " + email);
  return {
    id: user.id, email: user.email, roles,
    programmeRoles: user.roleAssignments.map((assignment) => ({
      role: assignment.role.slug as Role, programmeId: assignment.programmeId,
    })),
  };
}
