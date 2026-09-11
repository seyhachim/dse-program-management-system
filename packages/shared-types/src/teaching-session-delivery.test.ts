import { describe, expect, test } from "bun:test";
import { SaveTeachingSessionDeliveryInputSchema } from "./teaching-session-delivery.ts";

describe("teaching session delivery contracts", () => {
  test("accepts an occurred class with neutral arrival, learning summary, lecturer and ordered times", () => {
    const parsed = SaveTeachingSessionDeliveryInputSchema.parse({
      lecturerArrivalStatus: "Present",
      classOccurred: true,
      actualLecturerId: "11111111-1111-4111-8111-111111111111",
      actualStartTime: "09:05",
      actualEndTime: "10:35",
      actualTopic: "Time-series decomposition",
      learningSummary: "We learned how trend, seasonality, and residual components differ.",
      coverage: "PARTIALLY_COVERED",
      note: "Internal follow-up: remainder continues next week",
    });

    expect(parsed.lecturerArrivalStatus).toBe("Present");
    expect(parsed.actualStartTime).toBe("09:05");
    expect(parsed.learningSummary).toContain("trend");
    expect(parsed.coverage).toBe("PARTIALLY_COVERED");
  });

  test("requires lecturer and ordered actual times when the class occurred", () => {
    const missing = SaveTeachingSessionDeliveryInputSchema.safeParse({
      classOccurred: true,
      actualLecturerId: null,
      actualStartTime: null,
      actualEndTime: null,
      actualTopic: "",
      learningSummary: "",
      coverage: "TAUGHT_AS_PLANNED",
    });
    expect(missing.success).toBe(false);

    const reversed = SaveTeachingSessionDeliveryInputSchema.safeParse({
      classOccurred: true,
      actualLecturerId: "11111111-1111-4111-8111-111111111111",
      actualStartTime: "11:00",
      actualEndTime: "10:00",
      actualTopic: "",
      learningSummary: "",
      coverage: "TAUGHT_AS_PLANNED",
    });
    expect(reversed.success).toBe(false);
  });

  test("a class that did not occur cannot carry lecturer, time, positive coverage, or learning summary", () => {
    expect(
      SaveTeachingSessionDeliveryInputSchema.safeParse({
        lecturerArrivalStatus: "NotYet",
        classOccurred: false,
        actualLecturerId: null,
        actualStartTime: null,
        actualEndTime: null,
        actualTopic: "",
        learningSummary: "",
        coverage: "NOT_COVERED",
      }).success,
    ).toBe(true);

    expect(
      SaveTeachingSessionDeliveryInputSchema.safeParse({
        classOccurred: false,
        actualLecturerId: "11111111-1111-4111-8111-111111111111",
        actualStartTime: "09:00",
        actualEndTime: "10:00",
        actualTopic: "",
        learningSummary: "Students learned something",
        coverage: "TAUGHT_AS_PLANNED",
      }).success,
    ).toBe(false);
  });

  test("keeps student-safe learning summary and private note as separate bounded fields", () => {
    const tooLongLearning = SaveTeachingSessionDeliveryInputSchema.safeParse({
      classOccurred: true,
      actualLecturerId: "11111111-1111-4111-8111-111111111111",
      actualStartTime: "09:00",
      actualEndTime: "10:00",
      actualTopic: "Topic",
      learningSummary: "x".repeat(1001),
      coverage: "TAUGHT_AS_PLANNED",
      note: "private",
    });
    expect(tooLongLearning.success).toBe(false);

    const tooLongPrivate = SaveTeachingSessionDeliveryInputSchema.safeParse({
      classOccurred: true,
      actualLecturerId: "11111111-1111-4111-8111-111111111111",
      actualStartTime: "09:00",
      actualEndTime: "10:00",
      actualTopic: "Topic",
      learningSummary: "Student-safe",
      coverage: "TAUGHT_AS_PLANNED",
      note: "x".repeat(501),
    });
    expect(tooLongPrivate.success).toBe(false);
  });
});
