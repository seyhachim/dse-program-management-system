import { describe, expect, test } from "bun:test";
import {
  FinalProjectEligibilityQuery,
  ListSupervisorDiscoveryQuery,
  UpdateSupervisorProfileInput,
} from "./final-project.ts";

describe("Final Project discovery contracts", () => {
  test("parses accepting query values without treating false as true", () => {
    expect(ListSupervisorDiscoveryQuery.parse({ programmeId: "dse", accepting: "true" }).accepting).toBe(true);
    expect(ListSupervisorDiscoveryQuery.parse({ programmeId: "dse", accepting: "false" }).accepting).toBe(false);
    expect(ListSupervisorDiscoveryQuery.parse({ programmeId: "dse" }).accepting).toBeUndefined();
    expect(ListSupervisorDiscoveryQuery.safeParse({ programmeId: "dse", accepting: "yes" }).success).toBe(false);
  });

  test("requires a programme for student Final Project eligibility", () => {
    expect(FinalProjectEligibilityQuery.parse({ programmeId: "dse" }).programmeId).toBe("dse");
    expect(FinalProjectEligibilityQuery.safeParse({ programmeId: "   " }).success).toBe(false);
  });

  test("accepts valid supervisor discovery profile input", () => {
    const parsed = UpdateSupervisorProfileInput.parse({
      programmeId: "dse",
      supervisionStatement: "I supervise practical AI projects.",
      capacity: 3,
      acceptingStudents: true,
      isPublished: true,
      tracks: [{ name: "AI for Agriculture", description: "Applied AI for Cambodian agriculture." }],
      projectIdeas: [{
        title: "Crop disease detection",
        trackName: "AI for Agriculture",
        summary: "Build and evaluate an image-based prototype.",
      }],
    });

    expect(parsed.capacity).toBe(3);
    expect(parsed.tracks[0]?.name).toBe("AI for Agriculture");
    expect(parsed.projectIdeas[0]?.title).toBe("Crop disease detection");
  });

  test("enforces declared supervision capacity boundaries", () => {
    const base = {
      programmeId: "dse",
      supervisionStatement: "",
      acceptingStudents: false,
      isPublished: false,
      tracks: [],
      projectIdeas: [],
    };

    expect(UpdateSupervisorProfileInput.safeParse({ ...base, capacity: 0 }).success).toBe(true);
    expect(UpdateSupervisorProfileInput.safeParse({ ...base, capacity: 50 }).success).toBe(true);
    expect(UpdateSupervisorProfileInput.safeParse({ ...base, capacity: -1 }).success).toBe(false);
    expect(UpdateSupervisorProfileInput.safeParse({ ...base, capacity: 51 }).success).toBe(false);
  });

  test("limits track and project idea payload sizes", () => {
    const base = {
      programmeId: "dse",
      supervisionStatement: "",
      capacity: 1,
      acceptingStudents: true,
      isPublished: true,
    };
    const tracks = Array.from({ length: 21 }, (_, index) => ({ name: `Track ${index}`, description: "" }));
    const projectIdeas = Array.from({ length: 31 }, (_, index) => ({ title: `Idea ${index}`, trackName: "", summary: "" }));

    expect(UpdateSupervisorProfileInput.safeParse({ ...base, tracks, projectIdeas: [] }).success).toBe(false);
    expect(UpdateSupervisorProfileInput.safeParse({ ...base, tracks: [], projectIdeas }).success).toBe(false);
  });
});
