import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { COURSE_SPEC_AUTHORING_SECTIONS } from "@dse-pms/shared-types";
import { createApp } from "../core/app.ts";
import { prisma } from "../core/db/prisma.ts";
import { signToken, type AuthUser, type Role } from "../core/auth/token.ts";

const isolated = process.env.BACKEND_INTEGRATION_TESTS === "1" ? describe : describe.skip;

async function seededUser(email: string): Promise<AuthUser> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { email },
    include: { roleAssignments: { include: { role: true } } },
  });
  return {
    id: user.id, email: user.email,
    roles: user.roleAssignments.map(a => a.role.slug as Role),
    programmeRoles: user.roleAssignments.map(a => ({
      role: a.role.slug as Role, programmeId: a.programmeId,
    })),
  };
}

function localDate(now: Date): string {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Phnom_Penh", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => p.find(part => part.type === type)?.value;
  return [get("year"), get("month"), get("day")].join("-");
}

isolated("CourseSpec submit/resubmit — authenticated isolated regression #835", () => {
  let server: Server | undefined;
  let baseUrl = "";
  let lecturer: AuthUser;
  let reviewer: AuthUser;
  let unrelated: AuthUser;
  let student: AuthUser;
  let specId = "";
  let courseId = "";

  beforeAll(async () => {
    // Fixtures include intentional stale flags. They must NEVER touch a hosted
    // or developer academic database. The CI database is disposed after this job.
    const db = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid");
    if (!["localhost", "127.0.0.1"].includes(db.hostname) || db.pathname !== "/dse_integration") {
      throw new Error("CourseSpec submission regression requires disposable local dse_integration");
    }
    process.env.AUTH_MODE = "dev";
    process.env.JWT_SECRET = "course-spec-submit-isolated-test-secret-at-least-32-characters";
    [lecturer, reviewer, unrelated, student] = await Promise.all([
      seededUser("lecturer@dse.dev"), seededUser("admin@dse.dev"),
      seededUser("hopper.lecturer@dse.dev"), seededUser("student@dse.dev"),
    ]);
    const method = await prisma.teachingMethod.findFirstOrThrow({ where: { active: true } });
    const code = "UAT835-" + crypto.randomUUID().slice(0, 8);
    const course = await prisma.course.create({
      data: { code, title: "Synthetic readiness regression", programmeId: "dse",
        credits: 3, totalSltHours: 120, lecturerId: lecturer.id },
    });
    courseId = course.id;
    await prisma.offering.create({ data: {
      courseId, lecturerId: lecturer.id, term: code, sectionCode: "A", status: "Planned",
    }});
    const spec = await prisma.courseSpec.create({ data: {
      courseId, courseInfo: { create: {
        programmeTitle: "Synthetic test programme", courseTitle: course.title,
        courseCode: code, credits: 3, totalSltHours: 120,
        description: "Synthetic CI fixture only",
      }},
      sections: { create: COURSE_SPEC_AUTHORING_SECTIONS.map(section => ({
        sectionKey: section.id,
        status: section.id === "slt" || section.id === "mapping" ? "Draft" : "Complete",
      })) },
      teachingLearning: { create: {
        philosophyTags: [], philosophyStatement: "",
        teachingMethodIds: [method.id], activeLearningStrategyIds: ["data-investigation"],
      }},
      clos: { create: {
        order: 0, description: "Analyse time-indexed data", mappedPlos: ["PLO1"],
        level: "C4", sltHours: 120,
      }},
      weeks: { create: [
        ...Array.from({ length: 14 }, (_, order) => ({
          order, week: order < 7 ? order + 1 : order + 2,
          topic: "Synthetic guided investigation " + (order + 1), cloCodes: ["CLO1"],
          lloItems: ["Interpret temporal patterns"], activities: ["Guided notebook"],
          lectureHours: 2, practiceHours: 2, selfStudyHours: 2,
          teachingMethodIds: [method.id], assessment: "Formative check",
        })),
        // Preserved legacy empty assessment-only row, not an instructional week.
        { order: 14, week: 16, topic: "Final Exam" },
      ]},
      assessmentItems: { create: {
        order: 0, name: "Synthetic individual assessment", type: "Assignment",
        weight: 100, cloCodes: ["CLO1"], independentSltHours: 36,
      }},
    }, include: { clos: true } });
    specId = spec.id;
    await prisma.courseSpecCloTeachingMethod.create({ data: {
      courseSpecId: specId, cloId: spec.clos[0]!.id, teachingMethodId: method.id,
    }});
    const app = createApp();
    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    baseUrl = "http://127.0.0.1:" + (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    if (server?.listening) await new Promise<void>((resolve, reject) =>
      server!.close(error => error ? reject(error) : resolve()));
    // Do not delete submitted or approved evidence even in this fixture.
    // The entire isolated CI database is discarded by the runner.
    await prisma.$disconnect();
  });

  async function request(suffix: string, user: AuthUser | null, method = "POST", data: unknown = { note: "Synthetic moderation note" }) {
    const headers = new Headers({ "Content-Type": "application/json" });
    if (user) headers.set("Authorization", "Bearer " + signToken(user));
    const response = await fetch(baseUrl + "/api/courses/" + courseId + "/spec" + suffix, {
      method, headers, body: JSON.stringify(data),
    });
    return { status: response.status, body: await response.json() };
  }

  async function snapshot() {
    return prisma.courseSpec.findUniqueOrThrow({ where: { id: specId }, include: { reviewActions: true } });
  }

  test("denies unauthorized submit and review; validates real source data, date, transitions, lock and audit", async () => {
    expect((await request("/submit", null)).status).toBe(401);
    expect((await request("/submit", student)).status).toBe(403);
    expect((await request("/submit", unrelated)).status).toBe(403);
    const rejected = await request("/submit", lecturer);
    expect(rejected.status).toBe(400);
    expect(rejected.body.error).toContain("Teaching & Learning");
    const before = await snapshot();
    expect(before.reviewStatus).toBe("Draft");
    expect(before.submissionVersion).toBe(0);
    expect(before.specDate).toBeNull();
    expect(before.reviewActions).toHaveLength(0);

    await prisma.courseSpecTeachingLearning.update({
      where: { courseSpecId: specId }, data: { philosophyTags: ["student-centered"] },
    });
    await prisma.courseSpecAssessmentItem.updateMany({
      where: { courseSpecId: specId }, data: { status: "Inactive" },
    });
    const misaligned = await request("/submit", lecturer);
    expect(misaligned.status).toBe(400);
    expect(misaligned.body.error).toContain("CLO Alignment Mapping");
    expect((await snapshot()).reviewActions).toHaveLength(0);
    await prisma.courseSpecAssessmentItem.updateMany({
      where: { courseSpecId: specId }, data: { status: "Active" },
    });

    const dateBefore = localDate(new Date());
    const submitted = await request("/submit", lecturer);
    expect(submitted.status).toBe(200);
    expect(submitted.body.review.status).toBe("submitted");
    const first = await snapshot();
    expect(first.reviewStatus).toBe("Submitted");
    expect(first.submissionVersion).toBe(1);
    expect([dateBefore, localDate(new Date())]).toContain(first.specDate?.toISOString().slice(0, 10));
    expect(first.reviewActions).toHaveLength(1);
    expect(first.reviewActions[0]?.actorId).toBe(lecturer.id);
    expect(first.reviewActions[0]?.action).toBe("Submitted");

    expect((await request("/submit", lecturer)).status).toBe(400);
    expect((await request("/courseInfo", lecturer, "PUT", {})).status).toBe(409);
    expect((await request("/review/request-changes", student)).status).toBe(403);
    expect((await request("/review/request-changes", lecturer)).status).toBe(403);
    const changes = await request("/review/request-changes", reviewer);
    expect(changes.status).toBe(200);
    expect(changes.body.review.status).toBe("changesRequested");

    const week = await prisma.courseSpecWeek.findFirstOrThrow({
      where: { courseSpecId: specId, order: 0 },
    });
    await prisma.courseSpecSection.update({
      where: { courseSpecId_sectionKey: { courseSpecId: specId, sectionKey: "slt" } },
      data: { status: "Complete" },
    });
    await prisma.courseSpecWeek.update({
      where: { courseSpecId_id: { courseSpecId: specId, id: week.id } },
      data: { teachingMethodIds: [] },
    });
    const failedResubmit = await request("/submit", lecturer);
    expect(failedResubmit.status).toBe(400);
    expect(failedResubmit.body.error).toContain("Weekly Plan");
    expect((await snapshot()).submissionVersion).toBe(1);
    expect((await snapshot()).reviewActions).toHaveLength(2);
    await prisma.courseSpecWeek.update({
      where: { courseSpecId_id: { courseSpecId: specId, id: week.id } },
      data: { teachingMethodIds: week.teachingMethodIds },
    });

    const resubmitted = await request("/submit", lecturer);
    expect(resubmitted.status).toBe(200);
    expect(resubmitted.body.review.status).toBe("resubmitted");
    const final = await snapshot();
    expect(final.submissionVersion).toBe(2);
    expect(final.specDate?.toISOString()).toBe(first.specDate?.toISOString());
    expect(final.reviewActions.map(a => a.action).sort()).toEqual(["ChangesRequested", "Resubmitted", "Submitted"]);
    expect(final.reviewActions.find(a => a.action === "ChangesRequested")?.actorId).toBe(reviewer.id);
    expect(final.reviewActions.find(a => a.action === "Resubmitted")?.submissionVersion).toBe(2);
    expect(final.reviewActions.find(a => a.action === "Resubmitted")?.actorId).toBe(lecturer.id);
    expect((await request("/courseInfo", lecturer, "PUT", {})).status).toBe(409);
    expect((await request("/review/approve", student)).status).toBe(403);
    expect((await request("/review/approve", lecturer)).status).toBe(403);
    expect((await snapshot()).reviewActions).toHaveLength(3);
  }, 30000);
});
