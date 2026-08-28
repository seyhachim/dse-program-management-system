import { describe, expect, test } from "bun:test";
import {
  DEFAULT_COURSE_SPEC_DOCUMENT_THEME,
  type CourseSpecDocumentTheme,
} from "@dse-pms/shared-types";
import {
  cssPixelsToCharacterSpacingTwips,
  lineHeightToTwips,
  millimetresToTwips,
  pointsToHalfPoints,
  pointsToTwips,
  resolveCourseSpecWordTheme,
} from "./document-word-theme";

describe("Course Specification DOCX governance theme mapping", () => {
  test("maps bounded theme values to deterministic Word units", () => {
    expect(pointsToHalfPoints(9.5)).toBe(19);
    expect(pointsToTwips(2)).toBe(40);
    expect(millimetresToTwips(25.4)).toBe(1440);
    expect(lineHeightToTwips(1)).toBe(240);
    expect(cssPixelsToCharacterSpacingTwips(1)).toBe(15);
  });

  test("maps the official default theme", () => {
    const resolved = resolveCourseSpecWordTheme(
      DEFAULT_COURSE_SPEC_DOCUMENT_THEME,
    );

    expect(resolved.fontFamily).toBe("Times New Roman");
    expect(resolved.bodyHalfPoints).toBe(22);
    expect(resolved.tableHalfPoints).toBe(19);
    expect(resolved.documentTitleHalfPoints).toBe(28);
    expect(resolved.heading1HalfPoints).toBe(24);
    expect(resolved.paragraphAfterTwips).toBe(40);
    expect(resolved.lineTwips).toBe(264);
    expect(resolved.marginLeftTwips).toBe(millimetresToTwips(15));
    expect(resolved.marginRightTwips).toBe(millimetresToTwips(15));
    expect(resolved.showHeader).toBe(true);
    expect(resolved.showFooter).toBe(true);
    expect(resolved.showPageNumbers).toBe(true);
  });

  test("keeps a customized historical theme self-contained", () => {
    const historicalTheme: CourseSpecDocumentTheme = {
      ...DEFAULT_COURSE_SPEC_DOCUMENT_THEME,
      bodyFontFamily: "Arial",
      bodyFontSizePt: 12,
      tableFontSizePt: 8,
      tableCellPaddingPt: 6,
      lineHeight: 1.5,
      paragraphSpacingPt: 9,
      marginsMm: { top: 20, bottom: 21, left: 22, right: 23 },
      defaultAlignment: "justify",
      showHeader: false,
      showFooter: true,
      showPageNumbers: false,
    };

    const resolved = resolveCourseSpecWordTheme(historicalTheme);

    expect(resolved.fontFamily).toBe("Arial");
    expect(resolved.bodyHalfPoints).toBe(24);
    expect(resolved.tableHalfPoints).toBe(16);
    expect(resolved.tableCellPaddingTwips).toBe(120);
    expect(resolved.lineTwips).toBe(360);
    expect(resolved.paragraphAfterTwips).toBe(180);
    expect(resolved.marginTopTwips).toBe(millimetresToTwips(20));
    expect(resolved.marginBottomTwips).toBe(millimetresToTwips(21));
    expect(resolved.marginLeftTwips).toBe(millimetresToTwips(22));
    expect(resolved.marginRightTwips).toBe(millimetresToTwips(23));
    expect(resolved.defaultAlignment).toBe("justify");
    expect(resolved.showHeader).toBe(false);
    expect(resolved.showFooter).toBe(true);
    expect(resolved.showPageNumbers).toBe(false);
  });
});
