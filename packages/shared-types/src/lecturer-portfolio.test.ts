import { expect, test } from "bun:test";
import {
  CreateLecturerPortfolioItemInput,
  LECTURER_PORTFOLIO_ITEM_KINDS,
  ReviewLecturerPortfolioItemInput,
  UpdateLecturerPortfolioItemInput,
} from "./lecturer-portfolio.ts";

const valid = {
  kind: "qualification" as const,
  title: "MSc in Data Science",
  organization: "Royal University of Phnom Penh",
  description: "Graduate qualification",
  role: "Student",
  identifier: "MSC-001",
  url: "https://example.edu/credential",
  startDate: "2022-09-01",
  endDate: "2024-07-01",
  tags: ["Data Science"],
};

test("lecturer portfolio kinds cover the complete professional evidence surface", () => {
  expect(LECTURER_PORTFOLIO_ITEM_KINDS).toContain("publication");
  expect(LECTURER_PORTFOLIO_ITEM_KINDS).toContain("supervision");
  expect(LECTURER_PORTFOLIO_ITEM_KINDS).toContain("academic_service");
  expect(LECTURER_PORTFOLIO_ITEM_KINDS).toContain("external_profile");
});

test("professional evidence is private by default", () => {
  const parsed = CreateLecturerPortfolioItemInput.parse(valid);
  expect(parsed.isPublic).toBe(false);
  expect(parsed.isFeatured).toBe(false);
});

test("professional evidence rejects reversed dates and non-http links", () => {
  expect(CreateLecturerPortfolioItemInput.safeParse({ ...valid, startDate: "2025-01-01", endDate: "2024-01-01" }).success).toBe(false);
  expect(CreateLecturerPortfolioItemInput.safeParse({ ...valid, url: "javascript:alert(1)" }).success).toBe(false);
});

test("self-edit contract cannot set verification state or lecturer identity", () => {
  expect(UpdateLecturerPortfolioItemInput.safeParse({ verificationStatus: "verified" }).success).toBe(false);
  expect(UpdateLecturerPortfolioItemInput.safeParse({ lecturerId: "attacker" }).success).toBe(false);
});

test("review contract accepts only governance verification decisions", () => {
  expect(ReviewLecturerPortfolioItemInput.safeParse({ action: "verified", note: "Credential checked" }).success).toBe(true);
  expect(ReviewLecturerPortfolioItemInput.safeParse({ action: "reset" }).success).toBe(false);
});
