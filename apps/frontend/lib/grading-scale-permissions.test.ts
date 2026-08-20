import { describe, expect, test } from "bun:test";
import type { ProgrammeGradingScaleVersion } from "@dse-pms/shared-types";
import {
  canApproveGradingScaleVersion,
  canCreateGradingScaleRevision,
  canEditGradingScaleVersion,
  canManageGradingScales,
} from "./grading-scale-permissions";

function version(
  status: ProgrammeGradingScaleVersion["status"],
  legacyImported = false,
): ProgrammeGradingScaleVersion {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    gradingScaleId: "00000000-0000-4000-8000-000000000002",
    programmeId: "dse",
    code: "standard",
    name: "Standard Rating Scale",
    description: "Programme grading policy",
    version: 1,
    status,
    effectiveFrom: "2027-01-01",
    effectiveTo: null,
    changeSummary: "Initial policy",
    basedOnVersionId: null,
    legacyImported,
    createdById: null,
    approvedById: null,
    approvedAt: null,
    supersededAt: null,
    createdAt: "2026-08-20T00:00:00.000Z",
    updatedAt: "2026-08-20T00:00:00.000Z",
    grades: [],
  };
}

describe("grading-scale management permissions", () => {
  test("only Admin and Programme Coordinator are management roles", () => {
    expect(canManageGradingScales(["admin"])).toBe(true);
    expect(canManageGradingScales(["program_coordinator"])).toBe(true);
    expect(canManageGradingScales(["lecturer"])).toBe(false);
    expect(canManageGradingScales(["program_secretary"])).toBe(false);
    expect(canManageGradingScales(["qa_reviewer"])).toBe(false);
  });

  test("Draft is editable and approvable but cannot create a revision", () => {
    const draft = version("Draft");
    expect(canEditGradingScaleVersion(["admin"], draft)).toBe(true);
    expect(canApproveGradingScaleVersion(["program_coordinator"], draft)).toBe(true);
    expect(canCreateGradingScaleRevision(["admin"], draft)).toBe(false);
  });

  test("Approved can create a revision but is immutable in place", () => {
    const approved = version("Approved");
    expect(canEditGradingScaleVersion(["admin"], approved)).toBe(false);
    expect(canApproveGradingScaleVersion(["admin"], approved)).toBe(false);
    expect(canCreateGradingScaleRevision(["program_coordinator"], approved)).toBe(true);
  });

  test("Superseded and legacy-imported versions remain read-only", () => {
    expect(canEditGradingScaleVersion(["admin"], version("Superseded"))).toBe(false);
    expect(canCreateGradingScaleRevision(["admin"], version("Superseded"))).toBe(false);
    expect(canEditGradingScaleVersion(["admin"], version("Draft", true))).toBe(false);
  });
});
