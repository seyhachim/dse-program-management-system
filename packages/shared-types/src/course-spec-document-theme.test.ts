import { describe, expect, test } from "bun:test";
import {
  CourseSpecDocumentThemeSchema,
  DEFAULT_COURSE_SPEC_DOCUMENT_THEME,
} from "./course-spec-document-theme.ts";

describe("CourseSpecDocumentThemeSchema", () => {
  test("accepts the safe programme default", () => {
    expect(
      CourseSpecDocumentThemeSchema.parse(DEFAULT_COURSE_SPEC_DOCUMENT_THEME),
    ).toEqual(DEFAULT_COURSE_SPEC_DOCUMENT_THEME);
  });

  test("rejects arbitrary fonts and unsafe layout values", () => {
    expect(
      CourseSpecDocumentThemeSchema.safeParse({
        ...DEFAULT_COURSE_SPEC_DOCUMENT_THEME,
        bodyFontFamily: "Comic Sans MS",
      }).success,
    ).toBe(false);

    expect(
      CourseSpecDocumentThemeSchema.safeParse({
        ...DEFAULT_COURSE_SPEC_DOCUMENT_THEME,
        marginsMm: {
          ...DEFAULT_COURSE_SPEC_DOCUMENT_THEME.marginsMm,
          left: 60,
        },
      }).success,
    ).toBe(false);

    expect(
      CourseSpecDocumentThemeSchema.safeParse({
        ...DEFAULT_COURSE_SPEC_DOCUMENT_THEME,
        letterSpacingPx: 4,
      }).success,
    ).toBe(false);
  });
});
