import { describe, expect, test } from "bun:test";
import { SaveTeachingSessionDeliveryInputSchema } from "./teaching-session-delivery.ts";

describe("teaching session delivery contracts", () => {
  test("accepts an occurred class with exact lecturer and ordered times", () => {
    const parsed = SaveTeachingSessionDeliveryInputSchema.parse({
      classOccurred: true,
      actualLecturerId: "11111111-1111-4111-8111-111111111111",
      actualStartTime: "09:05",
      actualEndTime: "10:35",
      actualTopic: "Time-series decomposition",
      coverage: "PARTIALLY_COVERED",
      note: "Continues next week",
    });

    expect(parsed.actualStartTime).toBe("09:05");
    expect(parsed.coverage).toBe("PARTIALLY_COVERED");
  });

  test("requires lecturer and ordered actual times when the class occurred", () => {
    const missing = SaveTeachingSessionDeliveryInputSchema.safeParse({
      classOccurred: true,
      actualLecturerId: null,
      actualStartTime: null,
      actualEndTime: null,
      actualTopic: "",
      coverage: "TAUGHT_AS_PLANNED",
    });
    expect(missing.success).toBe(false);

    const reversed = SaveTeachingSessionDeliveryInputSchema.safeParse({
      classOccurred: true,
      actualLecturerId: "11111111-1111-4111-8111-111111111111",
      actualStartTime: "11:00",
      actualEndTime: "10:00",
      actualTopic: "",
      coverage: "TAUGHT_AS_PLANNED",
    });
    expect(reversed.success).toBe(false);
  });

  test("a class that did not occur cannot carry lecturer, time, or positive coverage", () => {
    expect(
      SaveTeachingSessionDeliveryInputSchema.safeParse({
        classOccurred: false,
        actualLecturerId: null,
        actualStartTime: null,
        actualEndTime: null,
        actualTopic: "",
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
        coverage: "TAUGHT_AS_PLANNED",
      }).success,
    ).toBe(false);
  });
});
