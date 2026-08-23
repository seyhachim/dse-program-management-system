import { expect, test } from "bun:test";
import {
  CreateLecturerInput,
  LecturerSchema,
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
      employmentType: "Full-time",
      fieldOfSpecialization: "Machine Learning",
      yearsOfExperience: 8,
    }).success,
  ).toBe(true);
});

test("self-profile input keeps new portfolio fields additive for older callers", () => {
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
  for (const protectedField of ["id", "email", "roles", "authId", "legacyCoursesTaught", "gender"]) {
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

test("self-profile input bounds years of experience", () => {
  const base = {
    name: "Ada Lovelace",
    title: "Lecturer",
    qualification: "PhD",
    phone: null,
  };
  expect(UpdateMyLecturerProfileInput.safeParse({ ...base, yearsOfExperience: 0 }).success).toBe(true);
  expect(UpdateMyLecturerProfileInput.safeParse({ ...base, yearsOfExperience: 80 }).success).toBe(true);
  expect(UpdateMyLecturerProfileInput.safeParse({ ...base, yearsOfExperience: -1 }).success).toBe(false);
  expect(UpdateMyLecturerProfileInput.safeParse({ ...base, yearsOfExperience: 81 }).success).toBe(false);
});

test("lecturer DTO exposes structured professional metadata without auth identifiers", () => {
  const parsed = LecturerSchema.parse({
    id: "11111111-1111-4111-8111-111111111111",
    name: "Chim Seyha",
    email: "seyha@example.edu",
    honorific: "Mr",
    title: "Lecturer",
    qualification: "MSc in Data Science",
    phone: "012345678",
    professionalProfile: {
      gender: "Male",
      employmentType: "Full-time",
      fieldOfSpecialization: "Machine Learning and Time Series",
      yearsOfExperience: 8,
      legacyCoursesTaught: "Historical source text",
    },
    accountAccess: "has_access",
  });

  expect(parsed.professionalProfile?.fieldOfSpecialization).toBe("Machine Learning and Time Series");
  expect("authId" in parsed).toBe(false);
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
