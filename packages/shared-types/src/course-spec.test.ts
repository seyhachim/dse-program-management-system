import { expect, test } from "bun:test";
import {
  AssessmentPlanSection,
  assessmentPlanTotalWeight,
  CloItem,
  cloFocusCode,
  cloFocusPercent,
  WeeklyPlanSection,
  ResourcesSection,
  ReferencesSection,
  SPEC_SECTION_SCHEMAS,
  weekContactHours,
  weekSlt,
  weeklyPlanTotals,
  MappingSection,
  MappingCell,
  alignmentBand,
  meanStrength,
  mappingOverallPercent,
  mappingDistribution,
  cloAlignmentAverages,
  componentsMapped,
  COMPLETABLE_SPEC_SECTIONS,
  type CourseSpecProgress,
  specAttention,
  specCompletionLabel,
  specCompletionPercent,
} from "./course-spec.ts";
import { CreateMethodInput } from "./methods.ts";

test("CloItem defaults method id arrays to []", () => {
  const parsed = CloItem.parse({
    id: "clo-1",
    code: "CLO1",
    description: "Do the thing",
  });
  expect(parsed.teachingMethodIds).toEqual([]);
  expect(parsed.assessmentMethodIds).toEqual([]);
});

test("CloItem preserves provided SLT hours and method ids", () => {
  const parsed = CloItem.parse({
    id: "clo-1",
    code: "CLO1",
    description: "Do the thing",
    sltHours: 42,
    teachingMethodIds: ["a", "b"],
    assessmentMethodIds: ["c"],
  });
  expect(parsed.sltHours).toBe(42);
  expect(parsed.teachingMethodIds).toEqual(["a", "b"]);
  expect(parsed.assessmentMethodIds).toEqual(["c"]);
});

test("cloFocusPercent is a CLO's share of total SLT; cloFocusCode buckets it F/M/P", () => {
  expect(cloFocusPercent(60, 100)).toBe(60);
  expect(cloFocusPercent(null, 100)).toBeNull();
  expect(cloFocusPercent(10, null)).toBeNull();
  expect(cloFocusCode(60)).toBe("F");
  expect(cloFocusCode(40)).toBe("M");
  expect(cloFocusCode(20)).toBe("P");
  expect(cloFocusCode(null)).toBeNull();
});

test("CreateMethodInput trims name and rejects blank", () => {
  expect(CreateMethodInput.parse({ name: "  Lecture  " }).name).toBe("Lecture");
  expect(CreateMethodInput.safeParse({ name: "   " }).success).toBe(false);
});

test("WeeklyPlanSection defaults weeks to []", () => {
  const parsed = WeeklyPlanSection.parse({});
  expect(parsed.weeks).toEqual([]);
});

test("WeeklyPlanSection coerces string hours and defaults array/optional fields", () => {
  const parsed = WeeklyPlanSection.parse({
    weeks: [
      {
        id: "w1",
        week: "1",
        topic: "Intro",
        lectureHours: "2",
        tutorialHours: "1",
        selfStudyHours: "3",
      },
    ],
  });
  const w = parsed.weeks[0]!;
  expect(w.week).toBe(1);
  expect(w.lectureHours).toBe(2);
  expect(w.tutorialHours).toBe(1);
  expect(w.selfStudyHours).toBe(3);
  expect(w.cloCodes).toEqual([]);
  expect(w.lloItems).toEqual([]);
  expect(w.activities).toEqual([]);
  expect(w.teachingMethodIds).toEqual([]);
  expect(w.assessmentMethodIds).toEqual([]);
  expect(w.assessment).toBe("");
});

test("WeeklyPlanRow keeps linked CLOs, LLOs, and activities, hours default to null", () => {
  const parsed = WeeklyPlanSection.parse({
    weeks: [
      {
        id: "w1",
        week: 2,
        topic: "EDA",
        cloCodes: ["CLO1"],
        lloItems: ["Explain the ML workflow.", "Set up a Python environment."],
        activities: ["Lecture", "Lab Exercise"],
      },
    ],
  });
  const w = parsed.weeks[0]!;
  expect(w.cloCodes).toEqual(["CLO1"]);
  expect(w.lloItems).toEqual([
    "Explain the ML workflow.",
    "Set up a Python environment.",
  ]);
  expect(w.activities).toEqual(["Lecture", "Lab Exercise"]);
  expect(w.studentLearningActivities).toEqual([]);
  expect(w.lectureHours).toBeNull();
  expect(w.tutorialHours).toBeNull();
  expect(w.practiceHours).toBeNull();
  expect(w.otherHours).toBeNull();
  expect(w.selfStudyHours).toBeNull();
});

test("parses structured student learning activities", () => {
  const parsed = WeeklyPlanSection.parse({
    weeks: [
      {
        id: "week-1",
        week: 1,
        topic: "Introduction to Smart Agriculture",
        cloCodes: ["CLO1"],
        lloItems: ["LLO1.1"],

        // Old format — empty for this new example
        activities: [],

        // New structured format
        studentLearningActivities: [
          {
            id: "activity-1",
            title: "Workflow Exercise",
            description:
              "Students arrange the predictive analytics workflow stages.",
            lloIds: ["LLO1.1"],
          },
          {
            id: "activity-2",
            title: "Classification Activity",
            description:
              "Students classify examples as descriptive or predictive analytics.",
            lloIds: ["LLO1.1"],
          },
        ],

        lectureHours: 2,
        tutorialHours: 1,
        practiceHours: null,
        otherHours: null,
        selfStudyHours: 3,
        assessment: "",
      },
    ],
  });

  const week = parsed.weeks[0];

  expect(week?.studentLearningActivities).toEqual([
    {
      id: "activity-1",
      title: "Workflow Exercise",
      description: "Students arrange the predictive analytics workflow stages.",
      lloIds: ["LLO1.1"],
    },
    {
      id: "activity-2",
      title: "Classification Activity",
      description:
        "Students classify examples as descriptive or predictive analytics.",
      lloIds: ["LLO1.1"],
    },
  ]);

  expect(week?.activities).toEqual([]);
});

const parsed = WeeklyPlanSection.parse({
  weeks: [
    {
      id: "week-1",
      week: 1,
      studentLearningActivities: [
        {
          id: "activity-1",
          title: "Dataset Exercise",
        },
      ],
    },
  ],
});
expect(parsed.weeks[0]?.studentLearningActivities).toEqual([
  {
    id: "activity-1",
    title: "Dataset Exercise",
    description: "",
    lloIds: [],
  },
]);
expect(() =>
  WeeklyPlanSection.parse({
    weeks: [
      {
        id: "week-1",
        week: 1,
        studentLearningActivities: [
          {
            id: "",
            title: "",
          },
        ],
      },
    ],
  }),
).toThrow();

test("WeeklyPlanSection rejects hours out of range and non-positive weeks", () => {
  expect(
    WeeklyPlanSection.safeParse({
      weeks: [{ id: "w1", week: 1, lectureHours: 201 }],
    }).success,
  ).toBe(false);
  expect(
    WeeklyPlanSection.safeParse({ weeks: [{ id: "w1", week: 0 }] }).success,
  ).toBe(false);
});

test("weekContactHours sums L+T+P+O, treating nulls as 0", () => {
  expect(
    weekContactHours({
      lectureHours: 2,
      tutorialHours: 1,
      practiceHours: 1,
      otherHours: 0,
    }),
  ).toBe(4);
  expect(weekContactHours({ lectureHours: 2 })).toBe(2);
  expect(weekContactHours({})).toBe(0);
});

test("weekSlt sums contact (L+T+P+O) + self-study, treating nulls as 0", () => {
  expect(
    weekSlt({ lectureHours: 2, tutorialHours: 1, selfStudyHours: 3 }),
  ).toBe(6);
  expect(weekSlt({ lectureHours: 2, selfStudyHours: null })).toBe(2);
  expect(weekSlt({})).toBe(0);
});

test("weeklyPlanTotals sums each hour category and the derived SLT over all weeks", () => {
  const section = WeeklyPlanSection.parse({
    weeks: [
      {
        id: "1",
        week: 1,
        lectureHours: 2,
        tutorialHours: 1,
        selfStudyHours: 3,
      },
      {
        id: "2",
        week: 2,
        lectureHours: 1,
        practiceHours: 1,
        otherHours: 1,
        selfStudyHours: 6,
      },
    ],
  });
  expect(weeklyPlanTotals(section)).toEqual({
    lectureHours: 3,
    tutorialHours: 1,
    practiceHours: 1,
    otherHours: 1,
    selfStudyHours: 9,
    slt: 15,
  });
});

test("slt is registered in SPEC_SECTION_SCHEMAS as the weekly plan", () => {
  expect(SPEC_SECTION_SCHEMAS.slt).toBe(WeeklyPlanSection);
});

test("AssessmentPlanSection defaults items to []", () => {
  expect(AssessmentPlanSection.parse({}).items).toEqual([]);
});

test("AssessmentItem coerces weight, defaults arrays/optionals, and requires a name", () => {
  const parsed = AssessmentPlanSection.parse({
    items: [
      {
        id: "a1",
        name: "Assignment 1",
        type: "Assignment",
        weight: "10",
        cloCodes: ["CLO1"],
      },
    ],
  });
  const a = parsed.items[0]!;
  expect(a.weight).toBe(10);
  expect(a.mode).toBe("individual");
  expect(a.status).toBe("active");
  expect(a.cloCodes).toEqual(["CLO1"]);
  expect(a.mappedPlos).toEqual([]);
  expect(a.feedbackMethod).toBe("");
  expect(a.feedbackTimeline).toBe("");
  expect("bloomLevel" in a).toBe(false);
  expect(a.dueWeek).toBeUndefined();

  expect(
    AssessmentPlanSection.safeParse({
      items: [{ id: "a1", name: "", type: "Quiz" }],
    }).success,
  ).toBe(false);
  expect(
    AssessmentPlanSection.safeParse({
      items: [{ id: "a1", name: "X", type: "Nope" }],
    }).success,
  ).toBe(false);
});

test("assessmentPlanTotalWeight sums only active assessments", () => {
  const section = AssessmentPlanSection.parse({
    items: [
      { id: "1", name: "A", type: "Assignment", weight: 40, status: "active" },
      { id: "2", name: "B", type: "Quiz", weight: 60, status: "active" },
      { id: "3", name: "C", type: "Exam", weight: 30, status: "inactive" },
    ],
  });
  expect(assessmentPlanTotalWeight(section)).toBe(100);
});

test("assessmentPlan is registered in SPEC_SECTION_SCHEMAS", () => {
  expect(SPEC_SECTION_SCHEMAS.assessmentPlan).toBe(AssessmentPlanSection);
});

/* --------------------------------------------------- Alignment Mapping (§14–18) */

test("MappingSection defaults cells to [] and coerces string strengths", () => {
  expect(MappingSection.parse({}).cells).toEqual([]);
  const parsed = MappingSection.parse({
    cells: [{ cloCode: "CLO1", kind: "week", ref: "w1", strength: "3" }],
  });
  expect(parsed.cells[0]!.strength).toBe(3);
});

test("MappingCell rejects strengths out of range and unknown kinds", () => {
  expect(
    MappingCell.safeParse({
      cloCode: "CLO1",
      kind: "week",
      ref: "w1",
      strength: 4,
    }).success,
  ).toBe(false);
  expect(
    MappingCell.safeParse({
      cloCode: "CLO1",
      kind: "exam",
      ref: "w1",
      strength: 2,
    }).success,
  ).toBe(false);
  expect(
    MappingCell.safeParse({ cloCode: "", kind: "week", ref: "w1", strength: 2 })
      .success,
  ).toBe(false);
});

test("alignmentBand rounds to the nearest level and returns null when unrated", () => {
  expect(alignmentBand(3)?.code).toBe("high");
  expect(alignmentBand(1.6)?.code).toBe("medium");
  expect(alignmentBand(0)?.code).toBe("none");
  expect(alignmentBand(null)).toBeNull();
  expect(alignmentBand(undefined)).toBeNull();
});

const SAMPLE_CELLS = [
  { cloCode: "CLO1", kind: "week", ref: "w1", strength: 3 },
  { cloCode: "CLO1", kind: "assessment", ref: "a1", strength: 2 },
  { cloCode: "CLO2", kind: "week", ref: "w1", strength: 1 },
  { cloCode: "CLO2", kind: "assessment", ref: "a1", strength: 0 },
] as const;

test("meanStrength averages rated cells and is null when empty", () => {
  expect(meanStrength(SAMPLE_CELLS)).toBe(1.5);
  expect(meanStrength([])).toBeNull();
});

test("mappingOverallPercent is the mean as a share of 3", () => {
  expect(mappingOverallPercent(SAMPLE_CELLS)).toBe(50); // 1.5 / 3
  expect(mappingOverallPercent([])).toBe(0);
});

test("mappingDistribution counts rated cells per band", () => {
  expect(mappingDistribution(SAMPLE_CELLS)).toEqual({ 0: 1, 1: 1, 2: 1, 3: 1 });
});

test("cloAlignmentAverages averages per CLO and yields null for unrated CLOs", () => {
  expect(cloAlignmentAverages(SAMPLE_CELLS, ["CLO1", "CLO2", "CLO3"])).toEqual([
    { code: "CLO1", average: 2.5 },
    { code: "CLO2", average: 0.5 },
    { code: "CLO3", average: null },
  ]);
});

test("componentsMapped counts refs with at least one aligned (>=1) cell", () => {
  expect(componentsMapped(SAMPLE_CELLS, "week", ["w1", "w2"])).toBe(1);
  // a1 only has strengths 2 and 0 → the 2 counts it as mapped.
  expect(componentsMapped(SAMPLE_CELLS, "assessment", ["a1", "a2"])).toBe(1);
});

test("mapping is registered in SPEC_SECTION_SCHEMAS", () => {
  expect(SPEC_SECTION_SCHEMAS.mapping).toBe(MappingSection);
});

test("COMPLETABLE_SPEC_SECTIONS is the save-able sections, in SPEC_SECTIONS order", () => {
  expect(COMPLETABLE_SPEC_SECTIONS.map((s) => s.id)).toEqual([
    "courseInfo",
    "clos",
    "slt",
    "assessmentPlan",
    "mapping",
    "policy",
  ]);
});

/* -------------------------------------------- lecturer "My Courses" (issue #104) */

function progress(completed: number, total: number, incompleteSections: CourseSpecProgress["incompleteSections"] = []): CourseSpecProgress {
  return { courseId: "c1", code: "CS101", title: "Test Course", completed, total, incompleteSections };
}

test("specCompletionPercent rounds completed/total, and is 0 when total is 0", () => {
  expect(specCompletionPercent(progress(4, 5))).toBe(80);
  expect(specCompletionPercent(progress(0, 5))).toBe(0);
  expect(specCompletionPercent(progress(5, 5))).toBe(100);
  expect(specCompletionPercent(progress(0, 0))).toBe(0);
});

test("specCompletionLabel: Complete only at 5/5, Not started at 0, In progress otherwise", () => {
  expect(specCompletionLabel(progress(5, 5))).toBe("Complete");
  expect(specCompletionLabel(progress(4, 5))).toBe("In progress");
  expect(specCompletionLabel(progress(0, 5))).toBe("Not started");
  expect(specCompletionLabel(progress(0, 0))).toBe("Not started");
});

test("specAttention is upToDate with no items once every completable section is complete", () => {
  expect(specAttention(progress(5, 5, []))).toEqual({ level: "upToDate", items: [] });
});

test("specAttention is needsAttention (critical) when nothing has been saved yet", () => {
  const sections = [{ id: "courseInfo" as const, title: "Course Information" }];
  expect(specAttention(progress(0, 5, sections))).toEqual({ level: "needsAttention", items: sections });
});

test("specAttention is itemsRemaining, carrying the incomplete sections, when partially complete", () => {
  const sections = [{ id: "mapping" as const, title: "CLO Alignment Mapping" }];
  expect(specAttention(progress(4, 5, sections))).toEqual({ level: "itemsRemaining", items: sections });
});


test("ResourcesSection accepts week resource material links", () => {
  const parsed = ResourcesSection.parse({
    items: [
      {
        id: "resource-1",
        weekId: "week-1",
        resourceType: "LECTURE_SLIDES",
        title: "Week 1 slides",
        url: "https://example.com/slides",
      },
    ],
  });
  expect(parsed.items[0]?.notes).toBe("");
});


test("resources are registered as a completable §19 section and support evidence week provenance", () => {
  expect(SPEC_SECTION_SCHEMAS.resources).toBe(ResourcesSection);
  const parsed = ResourcesSection.parse({
    items: [
      {
        id: "resource-1",
        kind: "requiredResource",
        resourceType: "software",
        title: "Python",
        evidenceWeekIds: ["week-1", "week-3"],
      },
    ],
  });
  expect(parsed.items[0]?.evidenceWeekIds).toEqual(["week-1", "week-3"]);
  expect(COMPLETABLE_SPEC_SECTIONS.some((section) => section.id === "resources")).toBe(true);
  expect(COMPLETABLE_SPEC_SECTIONS.some((section) => section.id === "references")).toBe(false);
});


test("ReferencesSection accepts a required textbook", () => {
  expect(ReferencesSection.parse({ items: [{ id: "r1", kind: "required", title: "ISLR", authors: "James et al.", publisher: "Springer", year: "2023", isbn: "978-3031387467" }] }).items).toHaveLength(1);
});
