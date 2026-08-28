import { describe, expect, test } from "bun:test";
import { normalizeCourseDocumentTopic } from "./course-document-topic";

describe("normalizeCourseDocumentTopic", () => {
  test("keeps a plain stored topic unchanged for canonical renderer prefixing", () => {
    expect(normalizeCourseDocumentTopic("1", "Intro to Predictive Analytics")).toBe(
      "Intro to Predictive Analytics",
    );
  });

  test("strips one matching legacy Topic N prefix", () => {
    expect(
      normalizeCourseDocumentTopic(
        "1",
        "Topic 1: Intro to Predictive Analytics",
      ),
    ).toBe("Intro to Predictive Analytics");
  });

  test("matches the canonical prefix case-insensitively and tolerates spacing", () => {
    expect(
      normalizeCourseDocumentTopic("8", "  topic 8 :   Midterm Exam  "),
    ).toBe("Midterm Exam");
  });

  test("does not strip topic words that are not the matching week prefix", () => {
    expect(normalizeCourseDocumentTopic("1", "Topic Modeling")).toBe(
      "Topic Modeling",
    );
    expect(normalizeCourseDocumentTopic("1", "Topic 2: Regression Models")).toBe(
      "Topic 2: Regression Models",
    );
  });
});
