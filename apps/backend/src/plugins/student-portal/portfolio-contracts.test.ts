import { describe, expect, test } from "bun:test";
import {
  StudentPortfolioProfessionalLinkInput,
  StudentPortfolioProfileInput,
  StudentPortfolioVerificationDecisionInput,
} from "@dse-pms/shared-types";

describe("student portfolio contracts", () => {
  test("requires an explicit safe slug before publication", () => {
    expect(StudentPortfolioProfileInput.safeParse({
      headline: "Student",
      bio: "",
      careerInterests: [],
      visibility: "public",
      publicSlug: null,
    }).success).toBe(false);

    expect(StudentPortfolioProfileInput.safeParse({
      headline: "Student",
      bio: "",
      careerInterests: [],
      visibility: "public",
      publicSlug: "student-data-portfolio",
    }).success).toBe(true);
  });

  test("rejects unsafe and provider-mismatched professional links", () => {
    expect(StudentPortfolioProfessionalLinkInput.safeParse({
      provider: "github",
      label: "GitHub",
      url: "javascript:alert(1)",
      visibility: "public",
    }).success).toBe(false);

    expect(StudentPortfolioProfessionalLinkInput.safeParse({
      provider: "github",
      label: "Not actually GitHub",
      url: "https://example.com/profile",
      visibility: "public",
    }).success).toBe(false);

    expect(StudentPortfolioProfessionalLinkInput.safeParse({
      provider: "github",
      label: "GitHub",
      url: "https://github.com/dse-student",
      visibility: "public",
    }).success).toBe(true);

    expect(StudentPortfolioProfessionalLinkInput.safeParse({
      provider: "orcid",
      label: "ORCID",
      url: "https://orcid.org/0000-0002-1825-0097",
      visibility: "public",
    }).success).toBe(true);
  });

  test("requires reasons for verification decisions that change trust state", () => {
    expect(StudentPortfolioVerificationDecisionInput.safeParse({
      state: "needs_changes",
      reason: "",
    }).success).toBe(false);

    expect(StudentPortfolioVerificationDecisionInput.safeParse({
      state: "revoked",
      reason: "Evidence is no longer eligible.",
    }).success).toBe(true);
  });
});
