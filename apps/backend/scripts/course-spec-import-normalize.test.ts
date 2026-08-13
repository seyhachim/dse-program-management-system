import { expect, test } from "bun:test";
import {
  normalizeCanonicalJson,
  recoverCloSltHours,
  type JsonObject,
} from "./course-spec-import-normalize.ts";

const sample: JsonObject = {
  course: { code: "TSA301" },
  clos: [
    { code: "CLO1", description: "One", mappedPlos: ["PLO10"] },
    { code: "CLO2", description: "Two", mappedPlos: ["PLO3"] },
    { code: "CLO3", description: "Three", mappedPlos: ["PLO2"] },
    { code: "CLO4", description: "Four", mappedPlos: ["PLO5"] },
  ],
  assessments: [{ name: "Assignment", mode: null }],
  rawSections: [
    {
      label: "15. Mapping",
      nestedTables: [
        {
          rows: [
            ["CLO", "Programme Learning Outcomes — Total Hours for Student Learning Time (SLT)"],
            ["", "PLO1", "PLO2", "PLO3", "PLO4", "PLO5", "PLO6", "PLO7", "PLO8", "PLO9", "PLO10"],
            ["CLO1", "", "", "", "", "", "", "", "", "", "36"],
            ["CLO2", "", "", "24", "", "", "", "", "", "", ""],
            ["CLO3", "", "30", "", "", "", "", "", "", "", ""],
            ["CLO4", "", "", "", "", "30", "", "", "", "", ""],
          ],
        },
      ],
    },
  ],
};

test("recovers CLO SLT totals from the preserved CLO-PLO hours table", () => {
  const result = recoverCloSltHours(sample);
  expect(result.get("CLO1")).toBe(36);
  expect(result.get("CLO2")).toBe(24);
  expect(result.get("CLO3")).toBe(30);
  expect(result.get("CLO4")).toBe(30);
});

test("normalizer promotes recovered SLT into CLOs and keeps assessment mode compatible", () => {
  const normalized = normalizeCanonicalJson(sample);
  const clos = normalized.clos as JsonObject[];
  const assessments = normalized.assessments as JsonObject[];

  expect(clos.map((clo) => clo.sltHours)).toEqual([36, 24, 30, 30]);
  expect(assessments[0]?.mode).toBe("individual");
});
