import { describe, expect, test } from "bun:test";
import { UpsertFinalProjectSupervisorProfileInput } from "./final-project.ts";

describe("final project supervisor profile contract", () => {
  test("accepts a bounded, normalized supervisor discovery profile", () => {
    const result = UpsertFinalProjectSupervisorProfileInput.safeParse({
      statement: "I supervise applied AI projects with regular check-ins.",
      capacity: 4,
      acceptingStudents: true,
      isPublished: true,
      tracks: [
        {
          title: "AI for Agriculture",
          description: "Applied ML for Cambodian agriculture.",
          ideas: [
            {
              title: "Crop stress detection",
              summary: "Explore image and sensor signals.",
              skills: ["Python", "Machine Learning"],
            },
          ],
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  test("rejects impossible availability and duplicate track names", () => {
    const zeroCapacity = UpsertFinalProjectSupervisorProfileInput.safeParse({
      statement: "",
      capacity: 0,
      acceptingStudents: true,
      isPublished: false,
      tracks: [],
    });
    expect(zeroCapacity.success).toBe(false);

    const duplicateTracks = UpsertFinalProjectSupervisorProfileInput.safeParse({
      statement: "",
      capacity: 2,
      acceptingStudents: false,
      isPublished: false,
      tracks: [
        { title: "Khmer AI", description: "", ideas: [] },
        { title: "khmer ai", description: "", ideas: [] },
      ],
    });
    expect(duplicateTracks.success).toBe(false);
  });
});
