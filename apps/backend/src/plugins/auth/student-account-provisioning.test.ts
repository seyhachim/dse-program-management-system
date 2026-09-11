import { describe, expect, test } from "bun:test";
import {
  assertStudentAccountProvisionable,
  ProvisioningError,
} from "./service";

describe("student account provisioning guard", () => {
  test("requires an existing roster profile", () => {
    expect(() => assertStudentAccountProvisionable(null)).toThrow(ProvisioningError);
    expect(() => assertStudentAccountProvisionable(null)).toThrow(
      "Create the student roster profile with this email before sending a portal invite",
    );
  });

  test("rejects a provisional student without an official Student ID", () => {
    expect(() => assertStudentAccountProvisionable({
      studentId: null,
      status: "Pending",
      userId: null,
    })).toThrow("Add the official Student ID before sending a portal invite");
  });

  test("rejects a non-active student even when an official ID exists", () => {
    expect(() => assertStudentAccountProvisionable({
      studentId: "DSE-2025-001",
      status: "Pending",
      userId: null,
    })).toThrow("Activate the student before sending a portal invite");
  });

  test("rejects an already linked student", () => {
    expect(() => assertStudentAccountProvisionable({
      studentId: "DSE-2025-001",
      status: "Active",
      userId: "user-1",
    })).toThrow("This student already has a linked portal account");
  });

  test("allows an active student with an official Student ID and no linked account", () => {
    expect(() => assertStudentAccountProvisionable({
      studentId: "DSE-2025-001",
      status: "Active",
      userId: null,
    })).not.toThrow();
  });
});
