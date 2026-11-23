import { describe, expect, test } from "bun:test";
import {
  CreateOfferingActivityInputSchema,
  UpdateOfferingActivityInputSchema,
  validActivityTimeRange,
} from "@dse-pms/shared-types";
import { canManageOfferingActivities } from "./offering-activities-router.ts";
import type { AuthUser } from "../../core/auth/token.ts";

const example = {
  type: "field_visit",
  title: "Sindora Garden Field Visit",
  date: "2026-11-22",
  host: "Sindora Garden of Pepper",
  objectives: "Observe regenerative farming and identify data/sensor/AI opportunities.",
};

describe("offering activities contract", () => {
  test("accepts the Sindora example with safe draft defaults", () => {
    const parsed = CreateOfferingActivityInputSchema.parse(example);
    expect(parsed.status).toBe("Draft");
    expect(parsed.evidenceLinks).toEqual([]);
  });
  test("rejects impossible dates, invalid URLs and archived creation", () => {
    expect(CreateOfferingActivityInputSchema.safeParse({ ...example, date: "2026-02-30" }).success).toBe(false);
    expect(CreateOfferingActivityInputSchema.safeParse({
      ...example, evidenceLinks: [{ kind: "report", label: "Private", url: "http://insecure.test" }],
    }).success).toBe(false);
    expect(CreateOfferingActivityInputSchema.safeParse({ ...example, status: "Archived" }).success).toBe(false);
  });
  test("validates time ranges and requires optimistic version for updates", () => {
    expect(validActivityTimeRange("13:30", "16:00")).toBe(true);
    expect(validActivityTimeRange("16:00", "13:30")).toBe(false);
    expect(CreateOfferingActivityInputSchema.safeParse({
      ...example, startTime: "16:00", endTime: "13:30",
    }).success).toBe(false);
    expect(UpdateOfferingActivityInputSchema.safeParse({ title: "Renamed" }).success).toBe(false);
    expect(UpdateOfferingActivityInputSchema.safeParse({ title: "Renamed", expectedVersion: 1 }).success).toBe(true);
  });
});

describe("offering activity ownership", () => {
  const user: AuthUser = {
    id: "lecturer-1", email: "lecturer@example.test",
    roles: ["lecturer"], programmeRoles: [{ role: "lecturer", programmeId: "p1" }],
  };
  const scope = { programmeId: "p1", lecturerId: "lecturer-1", coLecturerIds: [] };
  test("allows the assigned lecturer and co-lecturer", () => {
    expect(canManageOfferingActivities(user, scope)).toBe(true);
    expect(canManageOfferingActivities(user, { ...scope, lecturerId: null, coLecturerIds: ["lecturer-1"] })).toBe(true);
  });
  test("denies unrelated lecturer and cross-programme manager", () => {
    expect(canManageOfferingActivities(user, { ...scope, lecturerId: null })).toBe(false);
    const manager: AuthUser = {
      ...user, id: "manager", roles: ["program_coordinator"],
      programmeRoles: [{ role: "program_coordinator", programmeId: "p2" }],
    };
    expect(canManageOfferingActivities(manager, scope)).toBe(false);
    expect(canManageOfferingActivities(manager, { ...scope, programmeId: "p2" })).toBe(true);
  });
});
