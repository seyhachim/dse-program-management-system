import { describe, expect, test } from "bun:test";
import {
  ActionResearchLifecycleError,
  assertAssignmentTransition,
  assertCanCompleteIntervention,
  assertCanLogIntervention,
  assertCanPlanIntervention,
  assertInterventionTransition,
  canEditProtocol,
  canManageIntervention,
  nextActionForCycleStatus,
} from "./policy.ts";

describe("Action Research lifecycle policy", () => {
  test("allows the normal assignment start sequence", () => {
    expect(() => assertAssignmentTransition("ASSIGNED", "ACCEPTED")).not.toThrow();
    expect(() => assertAssignmentTransition("ACCEPTED", "IN_PROGRESS")).not.toThrow();
  });

  test("blocks invalid assignment jumps", () => {
    expect(() => assertAssignmentTransition("ASSIGNED", "COMPLETED")).toThrow(ActionResearchLifecycleError);
  });

  test("only draft or revision-required protocols are directly editable", () => {
    expect(canEditProtocol("DRAFT")).toBe(true);
    expect(canEditProtocol("REVISION_REQUIRED")).toBe(true);
    expect(canEditProtocol("SUBMITTED")).toBe(false);
    expect(canEditProtocol("APPROVED")).toBe(false);
  });

  test("limits intervention writes to assigned researchers", () => {
    expect(canManageIntervention("LEAD_RESEARCHER")).toBe(true);
    expect(canManageIntervention("CO_RESEARCHER")).toBe(true);
    expect(canManageIntervention("REVIEWER")).toBe(false);
    expect(canManageIntervention(null)).toBe(false);
  });

  test("requires a locked baseline before planning interventions", () => {
    expect(() => assertCanPlanIntervention("BASELINE_LOCKED")).not.toThrow();
    expect(() => assertCanPlanIntervention("INTERVENTION_ACTIVE")).not.toThrow();
    expect(() => assertCanPlanIntervention("PROTOCOL_APPROVED")).toThrow(ActionResearchLifecycleError);
    expect(() => assertCanPlanIntervention("OBSERVATION")).toThrow(ActionResearchLifecycleError);
  });

  test("enforces intervention status transitions and active-only fidelity logs", () => {
    expect(() => assertInterventionTransition("PLANNED", "ACTIVE")).not.toThrow();
    expect(() => assertInterventionTransition("ACTIVE", "COMPLETED")).not.toThrow();
    expect(() => assertInterventionTransition("COMPLETED", "ACTIVE")).toThrow(ActionResearchLifecycleError);

    expect(() => assertCanLogIntervention("INTERVENTION_ACTIVE", "ACTIVE")).not.toThrow();
    expect(() => assertCanLogIntervention("BASELINE_LOCKED", "PLANNED")).toThrow(ActionResearchLifecycleError);
    expect(() => assertCanLogIntervention("OBSERVATION", "COMPLETED")).toThrow(ActionResearchLifecycleError);
  });

  test("requires at least one fidelity record before completion", () => {
    expect(() => assertCanCompleteIntervention(0)).toThrow(ActionResearchLifecycleError);
    expect(() => assertCanCompleteIntervention(1)).not.toThrow();
  });

  test("provides a concrete next action for protocol and intervention stages", () => {
    expect(nextActionForCycleStatus("DRAFT")).toBe("Prepare the research protocol");
    expect(nextActionForCycleStatus("PROTOCOL_REVIEW")).toBe("Await protocol review");
    expect(nextActionForCycleStatus("PROTOCOL_APPROVED")).toBe("Lock the baseline");
    expect(nextActionForCycleStatus("BASELINE_LOCKED")).toBe("Prepare the intervention");
    expect(nextActionForCycleStatus("INTERVENTION_ACTIVE")).toBe("Record intervention fidelity");
  });
});
