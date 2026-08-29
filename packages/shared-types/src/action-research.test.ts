import { describe, expect, test } from "bun:test";
import {
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
});
