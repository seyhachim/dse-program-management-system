import { randomUUID } from "node:crypto";
import { describe, expect, test } from "bun:test";
import type { AuthUser } from "../../core/auth/token.ts";
import { prisma } from "../../core/db/prisma.ts";
import { opportunitiesService } from "./service.ts";
import { opportunityInterestService } from "./service-interest.ts";

// Only run against a disposable, explicitly enabled database.
const dbName = (() => {
  try { return new URL(process.env.DATABASE_URL ?? "").pathname.slice(1); }
  catch { return ""; }
})();
const disposable = dbName === "dse_ci" || dbName.endsWith("_test") || dbName.endsWith("_integration");
const dbDescribe = process.env.OPPORTUNITIES_DB_TESTS === "1" && disposable ? describe : describe.skip;

dbDescribe("Student opportunity interest: student anonymity and lecturer-only programme roster", () => {
  test("enforces one student choice, withdrawal and programme-scoped staff visibility", async () => {
    const suffix = randomUUID();
    const programmeId = "interest-" + suffix;
    const otherId = "other-interest-" + suffix;
    const [coordinator, studentUser] = await Promise.all([
      prisma.user.create({ data: { name: "Test Coordinator", email: "interest-staff-" + suffix + "@dse.invalid" } }),
      prisma.user.create({ data: { name: "Test Student", email: "interest-student-" + suffix + "@dse.invalid" } }),
    ]);
    await prisma.programme.create({ data: { id: programmeId, code: "I-" + suffix, name: "Interest Test Programme" } });
    await prisma.programme.create({ data: { id: otherId, code: "X-" + suffix, name: "Other Interest Programme" } });
    await prisma.student.create({ data: {
      userId: studentUser.id, name: studentUser.name, email: studentUser.email, status: "Active",
    } });
    const actor = (user: typeof coordinator, role: AuthUser["roles"][number], pid = programmeId): AuthUser => ({
      id: user.id, email: user.email, roles: [role], programmeRoles: [{ role, programmeId: pid }],
    });
    const coordinatorActor = actor(coordinator, "program_coordinator");
    const studentActor = actor(studentUser, "student");
    const lecturerActor = actor(coordinator, "lecturer");
    const secretaryActor = actor(coordinator, "program_secretary");
    const wrongProgramme = actor(coordinator, "lecturer", otherId);
    const fixture = await opportunitiesService.create(coordinatorActor, {
      programmeId, type: "hackathon", title: "Student Interest Hackathon",
      organizer: "Official Test Organiser",
      summary: "A verified opportunity fixture for anonymous participation.",
      eligibility: "Enrolled students may participate.",
      sourceUrl: "https://example.org/hackathon", applicationUrl: null,
      deadline: "2099-12-31", deadlineTime: "17:00",
    });
    await expect(opportunityInterestService.summary(studentActor, fixture.id)).rejects.toMatchObject({ status: 404 });
    await opportunitiesService.publish(coordinatorActor, fixture.id);
    expect(await opportunityInterestService.summary(studentActor, fixture.id)).toEqual({
      count: 0, joined: false, canJoin: true,
    });
    await expect(opportunityInterestService.students(studentActor, fixture.id)).rejects.toHaveProperty("status", 403);
    await expect(opportunityInterestService.students(secretaryActor, fixture.id)).rejects.toHaveProperty("status", 403);
    await expect(opportunityInterestService.students(wrongProgramme, fixture.id)).rejects.toHaveProperty("status", 403);
    await expect(opportunityInterestService.join(secretaryActor, fixture.id)).rejects.toHaveProperty("status", 403);
    await expect(opportunityInterestService.join(coordinatorActor, fixture.id)).rejects.toHaveProperty("status", 403);
    expect(await opportunityInterestService.join(studentActor, fixture.id)).toEqual({
      count: 1, joined: true, canJoin: true,
    });
    expect((await opportunityInterestService.join(studentActor, fixture.id)).count).toBe(1);
    expect(await opportunityInterestService.summary(secretaryActor, fixture.id)).toEqual({
      count: 1, joined: false, canJoin: true,
    });
    const roster = await opportunityInterestService.students(lecturerActor, fixture.id);
    expect(roster).toHaveLength(1);
    expect(roster[0]?.name).toBe("Test Student");
    expect(roster[0]?.yearGroup).toBe("Not recorded");
    expect((await opportunityInterestService.overview(lecturerActor, programmeId)).find(x => x.id === fixture.id)?.count).toBe(1);
    expect((await opportunityInterestService.withdraw(studentActor, fixture.id)).count).toBe(0);
    expect(await opportunityInterestService.students(lecturerActor, fixture.id)).toEqual([]);
    expect((await opportunityInterestService.join(studentActor, fixture.id)).count).toBe(1);
    await opportunitiesService.archive(coordinatorActor, fixture.id);
    await expect(opportunityInterestService.join(studentActor, fixture.id)).rejects.toHaveProperty("status", 409);
    await expect(opportunityInterestService.summary(studentActor, fixture.id)).rejects.toHaveProperty("status", 404);
    expect((await opportunityInterestService.overview(lecturerActor, programmeId)).find(x => x.id === fixture.id)?.count).toBe(1);
    // Withdrawal still succeeds after archival, preventing continued lecturer visibility.
    await opportunityInterestService.withdraw(studentActor, fixture.id);
    expect(await opportunityInterestService.students(lecturerActor, fixture.id)).toEqual([]);
    const audit = await prisma.opportunityAuditEvent.findMany({
      where: { opportunityId: fixture.id }, select: { action: true },
    });
    expect(audit.map(x => x.action)).toEqual(expect.arrayContaining([
      "InterestJoined", "InterestWithdrawn",
    ]));
  });
});
