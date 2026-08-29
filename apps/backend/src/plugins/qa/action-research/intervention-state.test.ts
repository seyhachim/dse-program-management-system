import { describe, expect, test } from "bun:test";
import type { StoredResearchIntervention } from "./intervention-state.ts";
import {
  addStoredIntervention,
  cycleStatusForInterventions,
  deriveInterventionFlags,
  replaceStoredIntervention,
} from "./intervention-state.ts";

function intervention(
  id: string,
  overrides: Partial<StoredResearchIntervention> = {},
): StoredResearchIntervention {
  return {
    id,
    title: `Intervention ${id}`,
    description: "Guided practice",
    target: "CLO3 achievement",
    responsibleResearcherIds: ["lecturer-1"],
    plannedStart: "2026-09-01T08:00:00.000Z",
    plannedEnd: "2026-09-21T17:00:00.000Z",
    expectedEffect: "Higher practice completion",
    expectedDelay: "One teaching week",
    status: "PLANNED",
    version: 1,
    createdById: "lecturer-1",
    logs: [],
    createdAt: "2026-08-30T00:00:00.000Z",
    updatedAt: "2026-08-30T00:00:00.000Z",
    ...overrides,
  };
}

describe("Action Research intervention state", () => {
  test("supports multiple interventions without replacing sibling plans", () => {
    const first = intervention("one");
    const second = intervention("two", { title: "Weekly formative quizzes" });
    const current = addStoredIntervention(addStoredIntervention([], first), second);

    expect(current).toHaveLength(2);
    expect(current.map((item) => item.id)).toEqual(["one", "two"]);

    const updatedFirst = { ...first, title: "Revised guided labs", version: 2 };
    const next = replaceStoredIntervention(current, updatedFirst);
    expect(next).toHaveLength(2);
    expect(next[0]?.version).toBe(2);
    expect(next[1]?.title).toBe("Weekly formative quizzes");
  });

  test("keeps planned dosage separate from actual delivery and surfaces deviations", () => {
    const withLog = intervention("one", {
      status: "ACTIVE",
      logs: [
        {
          id: "log-1",
          planVersion: 2,
          occurredAt: "2026-09-08T10:00:00.000Z",
          plannedDosage: "90-minute guided lab",
          deliveredDosage: "75-minute guided lab",
          reachCount: 38,
          reachDenominator: 43,
          reachNote: "Five students absent",
          deviation: "Started 15 minutes late",
          deviationReason: "Previous class overran",
          contextualEvents: "Heavy rain affected attendance",
          lecturerObservation: "Students needed more worked examples",
          evidenceRefs: ["attendance-session:week-2"],
          authorId: "lecturer-1",
          createdAt: "2026-09-08T10:05:00.000Z",
        },
      ],
    });

    const flags = deriveInterventionFlags(withLog, new Date("2026-09-10T00:00:00.000Z"));
    expect(withLog.logs[0]?.planVersion).toBe(2);
    expect(withLog.logs[0]?.plannedDosage).toBe("90-minute guided lab");
    expect(withLog.logs[0]?.deliveredDosage).toBe("75-minute guided lab");
    expect(flags.hasDeviation).toBe(true);
    expect(flags.delayed).toBe(true);
  });

  test("surfaces missed planned interventions and advances completed cycles", () => {
    const missed = intervention("one");
    expect(
      deriveInterventionFlags(missed, new Date("2026-10-01T00:00:00.000Z")).missed,
    ).toBe(true);

    expect(cycleStatusForInterventions("BASELINE_LOCKED", [
      intervention("one", { status: "ACTIVE" }),
      intervention("two"),
    ])).toBe("INTERVENTION_ACTIVE");

    expect(cycleStatusForInterventions("INTERVENTION_ACTIVE", [
      intervention("one", { status: "COMPLETED" }),
      intervention("two", { status: "CANCELLED" }),
    ])).toBe("OBSERVATION");
  });
});
