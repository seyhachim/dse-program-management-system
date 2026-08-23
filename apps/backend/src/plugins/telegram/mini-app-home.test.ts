import { describe, expect, test } from "bun:test";
import type {
  ClassResponsibilityView,
  ClassSessionStatusView,
  LecturerArrivalConfirmationView,
} from "@dse-pms/shared-types";
import { buildStudentToday, dseCalendarContext } from "./mini-app-service.ts";

type HomeCourse = Parameters<typeof buildStudentToday>[1][number];
type HomeOfferings = Parameters<typeof buildStudentToday>[2];

const course: HomeCourse = {
  offeringId: "550e8400-e29b-41d4-a716-446655440001",
  code: "PAN202",
  title: "Predictive Analytics",
  term: "2026-S2",
  sectionCode: "A",
  lifecycle: "current",
  lecturer: { id: "550e8400-e29b-41d4-a716-446655440010", name: "Chim Seyha" },
  coLecturers: [],
  meetings: [
    {
      id: "meeting-sunday",
      dayOfWeek: "Sunday",
      startTime: "09:00",
      endTime: "11:00",
      room: "Room 301",
      activityType: "Lecture",
    },
  ],
};

const activeResponsibility: ClassResponsibilityView = {
  id: "550e8400-e29b-41d4-a716-446655440020",
  offeringId: course.offeringId,
  role: "ClassMonitor",
  student: {
    id: "550e8400-e29b-41d4-a716-446655440021",
    userId: "550e8400-e29b-41d4-a716-446655440022",
    studentId: "DSE001",
    name: "Student One",
  },
  assignedAt: "2026-08-01T00:00:00.000Z",
  assignedBy: { id: "550e8400-e29b-41d4-a716-446655440023", name: "Coordinator" },
  revokedAt: null,
  revokedBy: null,
  revokeReason: "",
};

const presentConfirmation: LecturerArrivalConfirmationView = {
  id: "550e8400-e29b-41d4-a716-446655440030",
  offeringId: course.offeringId,
  date: "2026-08-23",
  status: "Present",
  note: "",
  recordedBy: { id: "550e8400-e29b-41d4-a716-446655440022", name: "Student One" },
  recordedAt: "2026-08-23T02:04:00.000Z",
  updatedAt: "2026-08-23T02:04:00.000Z",
};

const cancelledSession: ClassSessionStatusView = {
  id: "550e8400-e29b-41d4-a716-446655440040",
  offeringId: course.offeringId,
  date: "2026-08-23",
  status: "Cancelled",
  reason: "Class cancelled",
  recordedBy: { id: "550e8400-e29b-41d4-a716-446655440023", name: "Coordinator" },
  recordedAt: "2026-08-23T01:00:00.000Z",
  updatedAt: "2026-08-23T01:00:00.000Z",
};

function offeringService(options: {
  responsibility?: ClassResponsibilityView | null;
  confirmation?: LecturerArrivalConfirmationView | null;
  session?: ClassSessionStatusView | null;
} = {}): HomeOfferings {
  return {
    getById: async () => null,
    attendance: {
      get: async () => null,
      save: async () => null,
    },
    classResponsibilities: {
      getActiveForUser: async () => options.responsibility ?? null,
    },
    classDelivery: {
      getLecturerArrival: async () => options.confirmation ?? null,
      getClassSessionStatus: async () => options.session ?? null,
    },
  };
}

describe("Telegram Mini App student home", () => {
  test("resolves the DSE calendar in Asia/Phnom_Penh", () => {
    expect(dseCalendarContext(new Date("2026-08-22T18:15:00.000Z"))).toEqual({
      date: "2026-08-23",
      dayOfWeek: "Sunday",
      localTime: "01:15",
    });
  });

  test("shows canonical lecturer arrival read-only to an ordinary enrolled student", async () => {
    const today = await buildStudentToday(
      "student-user",
      [course],
      offeringService({ confirmation: presentConfirmation }),
      new Date("2026-08-23T02:04:00.000Z"),
    );

    expect(today.classes).toHaveLength(1);
    expect(today.classes[0]).toMatchObject({
      courseCode: "PAN202",
      lecturerNames: ["Chim Seyha"],
      arrivalStatus: "Present",
      canConfirmLecturerArrival: false,
    });
  });

  test("grants the home quick action only while the canonical monitor assignment is active", async () => {
    const active = await buildStudentToday(
      activeResponsibility.student.userId!,
      [course],
      offeringService({ responsibility: activeResponsibility }),
      new Date("2026-08-23T02:04:00.000Z"),
    );
    expect(active.classes[0]?.canConfirmLecturerArrival).toBe(true);

    const revoked = await buildStudentToday(
      activeResponsibility.student.userId!,
      [course],
      offeringService({ responsibility: null }),
      new Date("2026-08-23T02:04:00.000Z"),
    );
    expect(revoked.classes[0]?.canConfirmLecturerArrival).toBe(false);
  });

  test("suppresses the monitor action when the class session is not scheduled", async () => {
    const today = await buildStudentToday(
      activeResponsibility.student.userId!,
      [course],
      offeringService({ responsibility: activeResponsibility, session: cancelledSession }),
      new Date("2026-08-23T02:04:00.000Z"),
    );

    expect(today.classes[0]).toMatchObject({
      sessionStatus: "Cancelled",
      canConfirmLecturerArrival: false,
    });
  });

  test("returns the next current class when there are no meetings today", async () => {
    const mondayCourse: HomeCourse = {
      ...course,
      meetings: [{ ...course.meetings[0]!, id: "meeting-monday", dayOfWeek: "Monday" }],
    };
    const historicalSunday: HomeCourse = {
      ...course,
      offeringId: "550e8400-e29b-41d4-a716-446655440099",
      lifecycle: "historical",
    };

    const today = await buildStudentToday(
      "student-user",
      [mondayCourse, historicalSunday],
      offeringService(),
      new Date("2026-08-23T02:04:00.000Z"),
    );

    expect(today.classes).toEqual([]);
    expect(today.nextClass).toMatchObject({
      courseCode: "PAN202",
      dayOfWeek: "Monday",
      date: "2026-08-24",
      canConfirmLecturerArrival: false,
    });
  });
});
