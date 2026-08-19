import { expect, test } from "bun:test";
import {
  CreateLecturerInput,
  USER_HONORIFIC_LABELS,
  UpdateMyLecturerProfileInput,
  UserHonorificSchema,
  formatLecturerDisplayName,
} from "./lecturers.ts";

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

test("self-profile input accepts an explicit supported honorific or null", () => {
  const base = {
    name: "Ada Lovelace",
    title: "Lecturer",
    qualification: "PhD",
    phone: null,
  };
  expect(UpdateMyLecturerProfileInput.safeParse({ ...base, honorific: "Dr" }).success).toBe(true);
  expect(UpdateMyLecturerProfileInput.safeParse({ ...base, honorific: null }).success).toBe(true);
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

test("UserHonorificSchema exposes only the canonical allowed values", () => {
  expect(UserHonorificSchema.options).toEqual(["Mr", "Ms", "Mrs", "Mx", "Dr", "Prof"]);
});

test("CreateLecturerInput accepts a supported honorific and allows omission", () => {
  const base = { name: "Chim Seyha", email: "chim.seyha@rupp.edu.kh" };
  expect(CreateLecturerInput.safeParse({ ...base, honorific: "Dr" }).success).toBe(true);
  expect(CreateLecturerInput.safeParse(base).success).toBe(true);
  expect(CreateLecturerInput.safeParse({ ...base, honorific: null }).success).toBe(true);
});

test("CreateLecturerInput rejects arbitrary honorific values", () => {
  const result = CreateLecturerInput.safeParse({
    name: "Chim Seyha",
    email: "chim.seyha@rupp.edu.kh",
    honorific: "Assistant Professor",
  });
  expect(result.success).toBe(false);
});

test("formatLecturerDisplayName prefixes only the selected honorific", () => {
  expect(formatLecturerDisplayName("Chim Seyha", "Mr")).toBe("Mr. Chim Seyha");
  expect(formatLecturerDisplayName("Tieng Kimseng", "Dr")).toBe("Dr. Tieng Kimseng");
  expect(formatLecturerDisplayName("Chea Daly", null)).toBe("Chea Daly");
});

test("honorific labels include presentation punctuation without changing stored values", () => {
  expect(USER_HONORIFIC_LABELS.Prof).toBe("Prof.");
  expect(USER_HONORIFIC_LABELS.Mx).toBe("Mx.");
});
