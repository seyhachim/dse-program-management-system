import { describe, expect, test } from "bun:test";
import {
  AcademicCalendarEventInputSchema,
  GRADUATE_DEFENSE_EVENT_TITLE,
  GRADUATE_DEFENSE_SEMESTER,
  academicCalendarEventAppliesToStudyYear,
} from "./academic-calendar";

describe("Graduate Defense academic-calendar contract", () => {
  test("accepts the canonical Year 4 Semester 2 event shape", () => {
    const parsed = AcademicCalendarEventInputSchema.parse({
      title: GRADUATE_DEFENSE_EVENT_TITLE,
      type: "GraduateDefense",
      semester: GRADUATE_DEFENSE_SEMESTER,
      startDate: "2027-06-14",
      endDate: "2027-06-18",
      note: "Final project and thesis defense.",
      sortOrder: 0,
    });

    expect(parsed.type).toBe("GraduateDefense");
    expect(parsed.semester).toBe("Second");
  });

  test("rejects Graduate Defense outside Semester 2", () => {
    const parsed = AcademicCalendarEventInputSchema.safeParse({
      title: GRADUATE_DEFENSE_EVENT_TITLE,
      type: "GraduateDefense",
      semester: "First",
      startDate: "2027-06-14",
      endDate: "2027-06-18",
      note: "",
      sortOrder: 0,
    });

    expect(parsed.success).toBe(false);
  });

  test("rejects a non-canonical Graduate Defense title", () => {
    const parsed = AcademicCalendarEventInputSchema.safeParse({
      title: "Defense week",
      type: "GraduateDefense",
      semester: GRADUATE_DEFENSE_SEMESTER,
      startDate: "2027-06-14",
      endDate: "2027-06-18",
      note: "",
      sortOrder: 0,
    });

    expect(parsed.success).toBe(false);
  });

  test("applies Graduate Defense only to Year 4 while normal events follow calendar coverage", () => {
    expect(academicCalendarEventAppliesToStudyYear({ type: "GraduateDefense" }, 3)).toBe(false);
    expect(academicCalendarEventAppliesToStudyYear({ type: "GraduateDefense" }, 4)).toBe(true);
    expect(academicCalendarEventAppliesToStudyYear({ type: "Orientation" }, 3)).toBe(true);
  });
});
