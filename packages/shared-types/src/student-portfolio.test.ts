import { describe, expect, test } from "bun:test";
import {
  StudentPortfolioEvidenceCreateInput,
  StudentPortfolioEvidenceUpdateInput,
  StudentPortfolioProfileInput,
} from "./student-portfolio.ts";

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

describe("StudentPortfolioEvidence inputs", () => {
  test("defaults evidence to private and normalizes skills", () => {
    const parsed = StudentPortfolioEvidenceCreateInput.parse({
      origin: "external_project",
      title: "  Crop Yield Dashboard  ",
      skills: ["Next.js", "Next.js", "PostgreSQL"],
      links: [{ kind: "repository", url: "https://github.com/example/project" }],
    });

    expect(parsed.title).toBe("Crop Yield Dashboard");
    expect(parsed.skills).toEqual(["Next.js", "PostgreSQL"]);
    expect(parsed.visibility).toBe("private");
    expect(parsed.featured).toBe(false);
    expect(parsed.source).toBeNull();
  });

  test("requires an eligible PMS source for course assessment evidence", () => {
    expect(StudentPortfolioEvidenceCreateInput.safeParse({
      origin: "course_assessment",
      title: "Forecasting project",
    }).success).toBe(false);

    expect(StudentPortfolioEvidenceCreateInput.safeParse({
      origin: "course_assessment",
      title: "Forecasting project",
      source: {
        type: "course_assessment",
        offeringId: "00000000-0000-4000-8000-000000000001",
        assessmentItemId: "assessment-1",
      },
    }).success).toBe(true);
  });

  test("rejects PMS sources on self-added origins and unsafe artifact URLs", () => {
    expect(StudentPortfolioEvidenceCreateInput.safeParse({
      origin: "external_project",
      title: "Project",
      source: {
        type: "course_assessment",
        offeringId: "00000000-0000-4000-8000-000000000001",
        assessmentItemId: "assessment-1",
      },
    }).success).toBe(false);

    expect(StudentPortfolioEvidenceCreateInput.safeParse({
      origin: "external_project",
      title: "Project",
      links: [{ kind: "demo", url: "javascript:alert(1)" }],
    }).success).toBe(false);
  });

  test("rejects invalid date order and keeps provenance out of update input", () => {
    expect(StudentPortfolioEvidenceUpdateInput.safeParse({
      title: "Project",
      startDate: "2026-08-10",
      endDate: "2026-08-01",
    }).success).toBe(false);

    const parsed = StudentPortfolioEvidenceUpdateInput.parse({
      title: "Project",
      origin: "course_assessment",
      source: { type: "course_assessment" },
    });
    expect("origin" in parsed).toBe(false);
    expect("source" in parsed).toBe(false);
  });
});
