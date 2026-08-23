import { describe, expect, test } from "bun:test";
import { StudentPortfolioProfileInput } from "./student-portfolio.ts";

describe("StudentPortfolioProfileInput", () => {
  test("defaults new portfolio profiles to private and normalizes student-owned text", () => {
    const parsed = StudentPortfolioProfileInput.parse({
      headline: "  Data Science Student  ",
      bio: "  Building useful data products.  ",
      careerInterests: ["Machine Learning", "Machine Learning", "Data Engineering"],
    });

    expect(parsed).toEqual({
      headline: "Data Science Student",
      bio: "Building useful data products.",
      careerInterests: ["Machine Learning", "Data Engineering"],
      visibility: "private",
      publicSlug: null,
    });
  });

  test("requires a safe slug before public visibility can be selected", () => {
    expect(StudentPortfolioProfileInput.safeParse({ visibility: "public" }).success).toBe(false);
    expect(StudentPortfolioProfileInput.safeParse({ visibility: "public", publicSlug: "Sok-Dara" }).success).toBe(false);
    expect(StudentPortfolioProfileInput.safeParse({ visibility: "public", publicSlug: "sok--dara" }).success).toBe(false);
    expect(StudentPortfolioProfileInput.safeParse({ visibility: "public", publicSlug: "sok-dara" }).success).toBe(true);
  });

  test("rejects oversized profile content", () => {
    expect(StudentPortfolioProfileInput.safeParse({ headline: "x".repeat(121) }).success).toBe(false);
    expect(StudentPortfolioProfileInput.safeParse({ bio: "x".repeat(1001) }).success).toBe(false);
    expect(StudentPortfolioProfileInput.safeParse({ careerInterests: Array.from({ length: 13 }, (_, index) => `Interest ${index}`) }).success).toBe(false);
    expect(StudentPortfolioProfileInput.safeParse({ careerInterests: ["x".repeat(81)] }).success).toBe(false);
  });
});
