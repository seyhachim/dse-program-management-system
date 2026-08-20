import { describe, expect, test } from "bun:test";
import { ProgrammeGradingScaleSchema } from "./grading-scales";

describe("programme grading-scale contracts", () => {
  test("management DTO exposes whether a scale is the programme default", () => {
    const parsed = ProgrammeGradingScaleSchema.parse({
      id: "00000000-0000-4000-8000-000000000001",
      programmeId: "dse",
      code: "standard",
      name: "Standard Rating Scale",
      description: "Programme grading policy",
      isDefault: true,
      createdAt: "2026-08-20T00:00:00.000Z",
      updatedAt: "2026-08-20T00:00:00.000Z",
      versions: [],
    });

    expect(parsed.isDefault).toBe(true);
  });
});
