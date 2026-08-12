import { expect, test } from "bun:test";
import { UpdateMyLecturerProfileInput } from "./lecturers.ts";

test("self-profile input accepts only editable lecturer fields", () => {
  expect(
    UpdateMyLecturerProfileInput.safeParse({
      name: "Ada Lovelace",
      title: "Dr.",
      qualification: "PhD",
      phone: "+855 12 345 678",
    }).success,
  ).toBe(true);
});

test("self-profile input rejects an empty name", () => {
  expect(
    UpdateMyLecturerProfileInput.safeParse({
      name: "  ",
      title: null,
      qualification: null,
      phone: null,
    }).success,
  ).toBe(false);
});

test("self-profile input rejects identity and protected fields", () => {
  for (const protectedField of ["id", "email", "roles", "authId"]) {
    const result = UpdateMyLecturerProfileInput.safeParse({
      name: "Ada Lovelace",
      title: null,
      qualification: null,
      phone: null,
      [protectedField]: "attacker-controlled",
    });
    expect(result.success).toBe(false);
  }
});
