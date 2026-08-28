import type { CourseSpecDocumentTheme } from "@dse-pms/shared-types";
import { COURSE_DOCUMENT_STYLE } from "./course-document-model";

const TWIPS_PER_POINT = 20;
const TWIPS_PER_INCH = 1440;
const MM_PER_INCH = 25.4;
const POINTS_PER_CSS_PIXEL = 0.75;

export type CourseSpecWordTheme = {
  fontFamily: string;
  bodyHalfPoints: number;
  tableHalfPoints: number;
  heading1HalfPoints: number;
  heading2HalfPoints: number;
  heading3HalfPoints: number;
  documentTitleHalfPoints: number;
  headerHalfPoints: number;
  footerHalfPoints: number;
  paragraphAfterTwips: number;
  lineTwips: number;
  characterSpacingTwips: number;
  tableCellPaddingTwips: number;
  marginTopTwips: number;
  marginBottomTwips: number;
  marginLeftTwips: number;
  marginRightTwips: number;
  contentWidthTwips: number;
  defaultAlignment: CourseSpecDocumentTheme["defaultAlignment"];
  showHeader: boolean;
  showFooter: boolean;
  showPageNumbers: boolean;
};

export function pointsToHalfPoints(points: number): number {
  return Math.round(points * 2);
}

export function pointsToTwips(points: number): number {
  return Math.round(points * TWIPS_PER_POINT);
}

export function millimetresToTwips(mm: number): number {
  return Math.round((mm / MM_PER_INCH) * TWIPS_PER_INCH);
}

export function lineHeightToTwips(lineHeight: number): number {
  // In OOXML automatic line spacing, 240 represents one line.
  return Math.round(240 * lineHeight);
}

export function cssPixelsToCharacterSpacingTwips(px: number): number {
  return Math.round(px * POINTS_PER_CSS_PIXEL * TWIPS_PER_POINT);
}

export function resolveCourseSpecWordTheme(
  theme: CourseSpecDocumentTheme,
): CourseSpecWordTheme {
  const marginLeftTwips = millimetresToTwips(theme.marginsMm.left);
  const marginRightTwips = millimetresToTwips(theme.marginsMm.right);

  return {
    fontFamily: theme.bodyFontFamily,
    bodyHalfPoints: pointsToHalfPoints(theme.bodyFontSizePt),
    tableHalfPoints: pointsToHalfPoints(theme.tableFontSizePt),
    heading1HalfPoints: pointsToHalfPoints(theme.heading1SizePt),
    heading2HalfPoints: pointsToHalfPoints(theme.heading2SizePt),
    heading3HalfPoints: pointsToHalfPoints(theme.heading3SizePt),
    documentTitleHalfPoints: pointsToHalfPoints(theme.documentTitleSizePt),
    headerHalfPoints: pointsToHalfPoints(theme.headerFontSizePt),
    footerHalfPoints: pointsToHalfPoints(theme.footerFontSizePt),
    paragraphAfterTwips: pointsToTwips(theme.paragraphSpacingPt),
    lineTwips: lineHeightToTwips(theme.lineHeight),
    characterSpacingTwips: cssPixelsToCharacterSpacingTwips(
      theme.letterSpacingPx,
    ),
    tableCellPaddingTwips: pointsToTwips(theme.tableCellPaddingPt),
    marginTopTwips: millimetresToTwips(theme.marginsMm.top),
    marginBottomTwips: millimetresToTwips(theme.marginsMm.bottom),
    marginLeftTwips,
    marginRightTwips,
    contentWidthTwips:
      COURSE_DOCUMENT_STYLE.page.word.widthTwips -
      marginLeftTwips -
      marginRightTwips,
    defaultAlignment: theme.defaultAlignment,
    showHeader: theme.showHeader,
    showFooter: theme.showFooter,
    showPageNumbers: theme.showPageNumbers,
  };
}
