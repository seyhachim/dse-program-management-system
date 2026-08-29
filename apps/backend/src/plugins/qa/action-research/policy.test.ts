import { describe, expect, test } from "bun:test";
import {
  ActionResearchLifecycleError,
  assertAssignmentTransition,
  canEditProtocol,
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

  test("provides a concrete next action for protocol review stages", () => {
    expect(nextActionForCycleStatus("DRAFT")).toBe("Prepare the research protocol");
    expect(nextActionForCycleStatus("PROTOCOL_REVIEW")).toBe("Await protocol review");
    expect(nextActionForCycleStatus("PROTOCOL_APPROVED")).toBe("Lock the baseline");
  });
});
