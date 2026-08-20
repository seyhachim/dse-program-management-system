import { describe, expect, it } from "bun:test";
import {
  minimumReferenceYear,
  parseLegacyReferencePublication,
  referenceYearError,
  toReferencesForm,
  toReferencesPayload,
} from "./references-model";
import {
  reconcileResources,
  resourcesForWeek,
  toResourcesPayload,
  unresolvedResourceWeekIds,
  type ResourcesForm,
} from "./resources-model";
import type { WeeklyPlanForm } from "./weekly-plan-model";

const week = (id: string, weekNo: string): WeeklyPlanForm[number] => ({
  id,
  week: weekNo,
  topic: `Topic ${weekNo}`,
  cloCodes: ["CLO1"],
  lloItems: [],
  lessonLearningOutcomes: [],
  activities: [],
  studentLearningActivities: [],
  lectureHours: "2",
  tutorialHours: "",
  practiceHours: "2",
  otherHours: "",
  selfStudyHours: "",
  teachingMethodIds: [],
  teachingResourceTypes: [],
  assessmentMethodIds: [],
  assessment: "",
});

describe("reference publication metadata", () => {
  it("enforces a dynamic less-than-ten-year window", () => {
    expect(minimumReferenceYear(2026)).toBe(2017);
    expect(referenceYearError("2026", 2026)).toBeNull();
    expect(referenceYearError("2025", 2026)).toBeNull();
    expect(referenceYearError("2017", 2026)).toBeNull();
    expect(referenceYearError("2016", 2026)).not.toBeNull();
    expect(referenceYearError("2010", 2026)).not.toBeNull();
    expect(referenceYearError("2027", 2026)).not.toBeNull();
    expect(referenceYearError("", 2026)).not.toBeNull();
    expect(referenceYearError("two thousand", 2026)).not.toBeNull();
    expect(referenceYearError("2028", 2030)).toBeNull();
    expect(referenceYearError("2020", 2030)).not.toBeNull();
  });

  it("normalises only the unambiguous legacy year + edition shape", () => {
    expect(parseLegacyReferencePublication("2023 (2nd Edition)", "")).toEqual({
      year: "2023",
      edition: "2nd Edition",
    });
    expect(parseLegacyReferencePublication("Second Edition, 2023", "")).toEqual({
      year: "Second Edition, 2023",
      edition: "",
    });
    expect(parseLegacyReferencePublication("2023 (2nd Edition)", "Revised Edition")).toEqual({
      year: "2023 (2nd Edition)",
      edition: "Revised Edition",
    });
  });

  it("round-trips edition through form and payload conversion", () => {
    const form = toReferencesForm({
      items: [{
        id: "ref-1",
        kind: "REQUIRED",
        title: "Modern Data Science",
        authors: "Example Author",
        publisher: "Example Press",
        year: "2024",
        edition: "3rd Edition",
        isbn: "123",
        url: "https://example.com",
        basedOn: "Chapters 1-3",
        notes: "Library",
      }],
    });

    expect(form[0]?.edition).toBe("3rd Edition");
    expect(toReferencesPayload(form).items[0]?.edition).toBe("3rd Edition");
  });
});

describe("weekly resource provenance", () => {
  const resources: ResourcesForm = [
    {
      id: "r1",
      resourceType: "Dataset",
      title: "Dataset A",
      url: "",
      notes: "",
      evidenceWeekIds: ["week-1", "removed-week"],
    },
    {
      id: "r2",
      resourceType: "Software",
      title: "Python",
      url: "",
      notes: "",
      evidenceWeekIds: ["week-2"],
    },
  ];

  it("preserves removed Weekly Plan IDs during reconciliation and serialization", () => {
    const weeks = [week("week-1", "1"), week("week-2", "2")];
    expect(reconcileResources(resources, weeks)[0]?.evidenceWeekIds).toEqual([
      "week-1",
      "removed-week",
    ]);
    expect(toResourcesPayload(resources, weeks).items[0]?.evidenceWeekIds).toEqual([
      "week-1",
      "removed-week",
    ]);
    expect(unresolvedResourceWeekIds(resources, weeks)).toEqual(["removed-week"]);
  });

  it("groups resources by stable week ID regardless of display order", () => {
    expect(resourcesForWeek(resources, "week-1").map((item) => item.id)).toEqual(["r1"]);
    expect(resourcesForWeek(resources, "week-2").map((item) => item.id)).toEqual(["r2"]);
    const reordered = [week("week-2", "1"), week("week-1", "2")];
    expect(unresolvedResourceWeekIds(resources, reordered)).toEqual(["removed-week"]);
  });
});
