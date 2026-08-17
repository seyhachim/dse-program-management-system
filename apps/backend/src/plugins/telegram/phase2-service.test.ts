import { describe, expect, test } from "bun:test";
import type { TelegramSessionUser } from "./session.ts";
import {
  createTelegramPhase2Service,
  TelegramPhase2AccessError,
  TelegramPhase2NotFoundError,
  type OfferingsContract,
  type StudentPortalContract,
} from "./phase2-service.ts";

function user(role: "student" | "lecturer"): TelegramSessionUser {
  const id = crypto.randomUUID();
  return {
    id,
    name: `Test ${role}`,
    email: `${id}@example.test`,
    roles: [role],
    programmeRoles: [{ role, programmeId: "dse" }],
    identity: {
      id: crypto.randomUUID(),
      userId: id,
      telegramUserId: "123456789",
      telegramUsername: null,
      linkedAt: new Date(),
      lastVerifiedAt: new Date(),
      revokedAt: null,
    },
  };
}

const offeringA = "550e8400-e29b-41d4-a716-446655440001";
const offeringB = "550e8400-e29b-41d4-a716-446655440002";

function portalFixture(): StudentPortalContract {
  return {
    async courses() {
      return [{ offeringId: offeringA }, { offeringId: offeringB }];
    },
    async course(_userId, offeringId) {
      if (offeringId === offeringA) {
        return {
          offeringId,
          code: "DSE301",
          title: "Machine Learning",
          sectionCode: "A",
          assessments: [
            { id: "a1", name: "Project", dueAt: "2026-09-20T10:00:00.000Z", dueWeek: 6, weight: 30, result: null },
            { id: "a2", name: "Quiz", dueAt: "2026-09-01T10:00:00.000Z", dueWeek: 4, weight: 10, result: { score: 8 } },
          ],
        };
      }
      return {
        offeringId,
        code: "DSE302",
        title: "Data Mining",
        sectionCode: "B",
        assessments: [
          { id: "b1", name: "Midterm", dueAt: "2026-09-10T10:00:00.000Z", dueWeek: 5, weight: 25, result: null },
          { id: "b2", name: "Presentation", dueAt: null, dueWeek: 7, weight: 15, result: null },
        ],
      };
    },
  };
}

function offeringsFixture(overrides: Partial<OfferingsContract> = {}): OfferingsContract {
  return {
    async workloadForLecturer(lecturerId, query) {
      return {
        scheduleRows: [{
          meetingId: "m1",
          offeringId: offeringA,
          course: { id: "c1", code: "DSE301", title: "Machine Learning" },
          term: query.term ?? "2026-S1",
          sectionCode: "A",
          role: "Primary",
          dayOfWeek: "Monday",
          startTime: "08:00",
          endTime: "10:00",
          room: "301",
          activityType: "Lecture",
          durationHours: 2,
        }],
        scheduledWeeklyHours: 2,
        rows: [],
        weeklyTotals: [],
        peakWeeklyHours: 0,
        totalHours: 0,
        coLecturerAssumption: "full",
      };
    },
    studentAttendanceHistory: {
      async forUser(userId, offeringId) {
        return {
          offeringId,
          studentId: userId,
          studentNumber: "DSE001",
          totalSessions: 2,
          markedSessions: 2,
          attendanceRate: 75,
          counts: { Present: 1, Absent: 0, Late: 1, Excused: 0 },
          history: [],
        };
      },
    },
    ...overrides,
  } as OfferingsContract;
}

describe("Telegram phase 2 services", () => {
  test("student deadline dashboard excludes completed results and sorts dated items first", async () => {
    const service = createTelegramPhase2Service({ portal: portalFixture(), offerings: offeringsFixture() });
    const result = await service.assessmentDeadlines(user("student"));
    expect(result.assessments.map((item) => item.assessmentId)).toEqual(["b1", "a1", "b2"]);
    expect(result.assessments.some((item) => item.assessmentId === "a2")).toBe(false);
  });

  test("lecturer cannot open student-only deadline or attendance views", async () => {
    const lecturer = user("lecturer");
    const service = createTelegramPhase2Service({ portal: portalFixture(), offerings: offeringsFixture() });
    await expect(service.assessmentDeadlines(lecturer)).rejects.toBeInstanceOf(TelegramPhase2AccessError);
    await expect(service.attendanceHistory(lecturer, offeringA)).rejects.toBeInstanceOf(TelegramPhase2AccessError);
  });

  test("attendance history is scoped to the authenticated PMS user and exact offering", async () => {
    const student = user("student");
    let seen: [string, string] | null = null;
    const offerings = offeringsFixture({
      studentAttendanceHistory: {
        async forUser(userId, offeringId) {
          seen = [userId, offeringId];
          return {
            offeringId,
            studentId: "student-record",
            studentNumber: "DSE001",
            totalSessions: 0,
            markedSessions: 0,
            attendanceRate: null,
            counts: { Present: 0, Absent: 0, Late: 0, Excused: 0 },
            history: [],
          };
        },
      },
    });
    const service = createTelegramPhase2Service({ portal: portalFixture(), offerings });
    await service.attendanceHistory(student, offeringB);
    expect(seen).toEqual([student.id, offeringB]);
  });

  test("removed enrollment or inactive student maps to a non-leaking not-found response", async () => {
    const offerings = offeringsFixture({
      studentAttendanceHistory: { async forUser() { throw new Error("Student is not enrolled in this offering"); } },
    });
    const service = createTelegramPhase2Service({ portal: portalFixture(), offerings });
    await expect(service.attendanceHistory(user("student"), offeringA)).rejects.toBeInstanceOf(TelegramPhase2NotFoundError);
  });

  test("workload uses the authenticated lecturer id and optional term", async () => {
    const lecturer = user("lecturer");
    let seen: [string, string | undefined] | null = null;
    const offerings = offeringsFixture({
      async workloadForLecturer(lecturerId, query) {
        seen = [lecturerId, query.term];
        return offeringsFixture().workloadForLecturer(lecturerId, query);
      },
    });
    const service = createTelegramPhase2Service({ portal: portalFixture(), offerings });
    await service.lecturerWorkload(lecturer, "2026-S1");
    expect(seen).toEqual([lecturer.id, "2026-S1"]);
  });

  test("student cannot open lecturer workload", async () => {
    const service = createTelegramPhase2Service({ portal: portalFixture(), offerings: offeringsFixture() });
    await expect(service.lecturerWorkload(user("student"))).rejects.toBeInstanceOf(TelegramPhase2AccessError);
  });
});
