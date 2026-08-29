import { describe, expect, test } from "bun:test";
import {
  CreateResearchInterventionLogSchema,
  CreateResearchInterventionSchema,
  CreateResearchProjectSchema,
  LockResearchBaselineSchema,
  SaveResearchProtocolSchema,
} from "./action-research.ts";

describe("Action Research shared contracts", () => {
  test("requires a meaningful programme problem", () => {
    const result = CreateResearchProjectSchema.safeParse({
      programmeId: "dse",
      title: "Improve CLO3 achievement",
      problemStatement: "Too short",
    });

    expect(result.success).toBe(false);
  });

  test("normalizes an editable research protocol", () => {
    const result = SaveResearchProtocolSchema.parse({
      programmeId: "dse",
      practicalProblem: "CLO3 achievement has remained below the programme target for two offerings.",
      researchQuestion: "What system factors are associated with persistent low CLO3 achievement?",
      systemBoundary: "Year 2 students, the selected course, Weeks 1-12, and linked teaching and assessment activity.",
    });

    expect(result.primaryIndicators).toEqual([]);
    expect(result.secondaryIndicators).toEqual([]);
    expect(result.dataSources).toEqual([]);
    expect(result.analysisPlan).toBe("");
  });

  test("rejects a baseline period whose end is before its start", () => {
    const result = LockResearchBaselineSchema.safeParse({
      programmeId: "dse",
      baselineStart: "2026-05-01",
      baselineEnd: "2026-04-01",
      indicatorDefinitions: [
        {
          key: "clo3-achievement",
          label: "CLO3 Achievement",
          unit: "%",
          denominator: 43,
          sourceRef: "PMS CLO report",
          value: 54,
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  test("normalizes a reproducible intervention plan", () => {
    const result = CreateResearchInterventionSchema.parse({
      programmeId: "dse",
      title: "Guided practice labs",
      target: "CLO3 achievement in the selected Year 2 offering",
      responsibleResearcherIds: ["lecturer-1", "lecturer-2"],
      plannedStart: "2026-09-01T08:00:00Z",
      plannedEnd: "2026-09-21T17:00:00Z",
    });

    expect(result.description).toBe("");
    expect(result.expectedEffect).toBe("");
    expect(result.responsibleResearcherIds).toEqual(["lecturer-1", "lecturer-2"]);
  });

  test("rejects invalid intervention dates and duplicate responsible researchers", () => {
    const result = CreateResearchInterventionSchema.safeParse({
      programmeId: "dse",
      title: "Guided practice labs",
      target: "CLO3 achievement",
      responsibleResearcherIds: ["lecturer-1", "lecturer-1"],
      plannedStart: "2026-09-21T08:00:00Z",
      plannedEnd: "2026-09-01T17:00:00Z",
    });

    expect(result.success).toBe(false);
  });

  test("rejects null required intervention and delivery timestamps", () => {
    const plan = CreateResearchInterventionSchema.safeParse({
      programmeId: "dse",
      title: "Guided practice labs",
      target: "CLO3 achievement",
      responsibleResearcherIds: ["lecturer-1"],
      plannedStart: null,
      plannedEnd: null,
    });
    expect(plan.success).toBe(false);

    const log = CreateResearchInterventionLogSchema.safeParse({
      programmeId: "dse",
      occurredAt: null,
    });
    expect(log.success).toBe(false);
  });

  test("keeps planned and delivered dosage separate and validates reach", () => {
    const valid = CreateResearchInterventionLogSchema.parse({
      programmeId: "dse",
      occurredAt: "2026-09-08T10:00:00Z",
      plannedDosage: "90-minute guided lab",
      deliveredDosage: "75-minute guided lab",
      reachCount: 38,
      reachDenominator: 43,
      deviation: "Started 15 minutes late",
    });
    expect(valid.plannedDosage).toBe("90-minute guided lab");
    expect(valid.deliveredDosage).toBe("75-minute guided lab");

    const invalid = CreateResearchInterventionLogSchema.safeParse({
      programmeId: "dse",
      occurredAt: "2026-09-08T10:00:00Z",
      reachCount: 44,
      reachDenominator: 43,
    });
    expect(invalid.success).toBe(false);
  });
});
