import { Prisma, type CourseSpecReviewStatus } from "@prisma/client";
import {
  CourseSpecDocumentThemeSchema,
  DEFAULT_COURSE_SPEC_DOCUMENT_THEME,
  type CourseSpecDocumentTheme,
  type CourseSpecDocumentThemeResponse,
  type UpdateCourseSpecDocumentThemeInput,
} from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";
import { assertCourseSpecEditable } from "./spec-lock.ts";

export class CourseSpecThemeNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CourseSpecThemeNotFoundError";
  }
}

export class CourseSpecThemeIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CourseSpecThemeIntegrityError";
  }
}

type ThemeRow = {
  bodyFontFamily: string;
  bodyFontSizePt: number;
  documentTitleSizePt: number;
  heading1SizePt: number;
  heading2SizePt: number;
  heading3SizePt: number;
  lineHeight: number;
  paragraphSpacingPt: number;
  letterSpacingPx: number;
  defaultAlignment: string;
  marginTopMm: number;
  marginBottomMm: number;
  marginLeftMm: number;
  marginRightMm: number;
  tableFontSizePt: number;
  tableCellPaddingPt: number;
  headerFontSizePt: number;
  footerFontSizePt: number;
  showHeader: boolean;
  showFooter: boolean;
  showPageNumbers: boolean;
};

type SpecThemeHeader = {
  id: string;
  programmeId: string;
  reviewStatus: CourseSpecReviewStatus;
};

function rowToTheme(row: ThemeRow | undefined): CourseSpecDocumentTheme {
  if (!row) return DEFAULT_COURSE_SPEC_DOCUMENT_THEME;
  const parsed = CourseSpecDocumentThemeSchema.safeParse({
    bodyFontFamily: row.bodyFontFamily,
    bodyFontSizePt: row.bodyFontSizePt,
    documentTitleSizePt: row.documentTitleSizePt,
    heading1SizePt: row.heading1SizePt,
    heading2SizePt: row.heading2SizePt,
    heading3SizePt: row.heading3SizePt,
    lineHeight: row.lineHeight,
    paragraphSpacingPt: row.paragraphSpacingPt,
    letterSpacingPx: row.letterSpacingPx,
    defaultAlignment: row.defaultAlignment,
    marginsMm: {
      top: row.marginTopMm,
      bottom: row.marginBottomMm,
      left: row.marginLeftMm,
      right: row.marginRightMm,
    },
    tableFontSizePt: row.tableFontSizePt,
    tableCellPaddingPt: row.tableCellPaddingPt,
    headerFontSizePt: row.headerFontSizePt,
    footerFontSizePt: row.footerFontSizePt,
    showHeader: row.showHeader,
    showFooter: row.showFooter,
    showPageNumbers: row.showPageNumbers,
  });
  if (!parsed.success) {
    throw new CourseSpecThemeIntegrityError(
      "Stored Course Specification document style is invalid",
    );
  }
  return parsed.data;
}

async function getSpecHeader(
  courseId: string,
  courseSpecId?: string,
): Promise<SpecThemeHeader | null> {
  const spec = courseSpecId
    ? await prisma.courseSpec.findFirst({
        where: { id: courseSpecId, courseId },
        select: {
          id: true,
          reviewStatus: true,
          course: { select: { programmeId: true } },
        },
      })
    : await prisma.courseSpec.findFirst({
        where: { courseId },
        orderBy: [
          { versionMajor: "desc" },
          { versionMinor: "desc" },
        ],
        select: {
          id: true,
          reviewStatus: true,
          course: { select: { programmeId: true } },
        },
      });
  return spec
    ? {
        id: spec.id,
        programmeId: spec.course.programmeId,
        reviewStatus: spec.reviewStatus,
      }
    : null;
}

async function getProgrammeId(courseId: string): Promise<string> {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { programmeId: true },
  });
  if (!course) throw new CourseSpecThemeNotFoundError("Course not found");
  return course.programmeId;
}

async function ensureProgrammeDefault(programmeId: string): Promise<void> {
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "ProgrammeCourseSpecDocumentTheme" ("programmeId")
    VALUES (${programmeId})
    ON CONFLICT ("programmeId") DO NOTHING
  `);
}

async function readProgrammeDefault(programmeId: string): Promise<CourseSpecDocumentTheme> {
  await ensureProgrammeDefault(programmeId);
  const rows = await prisma.$queryRaw<ThemeRow[]>(Prisma.sql`
    SELECT
      "bodyFontFamily", "bodyFontSizePt", "documentTitleSizePt",
      "heading1SizePt", "heading2SizePt", "heading3SizePt", "lineHeight",
      "paragraphSpacingPt", "letterSpacingPx", "defaultAlignment",
      "marginTopMm", "marginBottomMm", "marginLeftMm", "marginRightMm",
      "tableFontSizePt", "tableCellPaddingPt", "headerFontSizePt", "footerFontSizePt",
      "showHeader", "showFooter", "showPageNumbers"
    FROM "ProgrammeCourseSpecDocumentTheme"
    WHERE "programmeId" = ${programmeId}
    LIMIT 1
  `);
  return rowToTheme(rows[0]);
}

async function readVersionTheme(courseSpecId: string): Promise<CourseSpecDocumentTheme | null> {
  const rows = await prisma.$queryRaw<ThemeRow[]>(Prisma.sql`
    SELECT
      "bodyFontFamily", "bodyFontSizePt", "documentTitleSizePt",
      "heading1SizePt", "heading2SizePt", "heading3SizePt", "lineHeight",
      "paragraphSpacingPt", "letterSpacingPx", "defaultAlignment",
      "marginTopMm", "marginBottomMm", "marginLeftMm", "marginRightMm",
      "tableFontSizePt", "tableCellPaddingPt", "headerFontSizePt", "footerFontSizePt",
      "showHeader", "showFooter", "showPageNumbers"
    FROM "CourseSpecDocumentTheme"
    WHERE "courseSpecId" = ${courseSpecId}
    LIMIT 1
  `);
  return rows.length ? rowToTheme(rows[0]) : null;
}

/**
 * Snapshot the programme default onto an editable Course Spec version. Calling
 * this repeatedly is idempotent; later programme-default edits never overwrite
 * a version snapshot.
 */
export async function ensureCourseSpecThemeSnapshot(
  courseId: string,
  courseSpecId?: string,
): Promise<CourseSpecDocumentTheme | null> {
  const header = await getSpecHeader(courseId, courseSpecId);
  if (!header) return null;
  const existing = await readVersionTheme(header.id);
  if (existing) return existing;

  // Approved/submitted rows must already have a migration/creation-time snapshot.
  // Never synthesize one from today's default because that would restyle history.
  assertCourseSpecEditable(header.reviewStatus);
  await ensureProgrammeDefault(header.programmeId);
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "CourseSpecDocumentTheme" (
      "courseSpecId", "bodyFontFamily", "bodyFontSizePt", "documentTitleSizePt",
      "heading1SizePt", "heading2SizePt", "heading3SizePt", "lineHeight",
      "paragraphSpacingPt", "letterSpacingPx", "defaultAlignment",
      "marginTopMm", "marginBottomMm", "marginLeftMm", "marginRightMm",
      "tableFontSizePt", "tableCellPaddingPt", "headerFontSizePt", "footerFontSizePt",
      "showHeader", "showFooter", "showPageNumbers"
    )
    SELECT
      ${header.id}, "bodyFontFamily", "bodyFontSizePt", "documentTitleSizePt",
      "heading1SizePt", "heading2SizePt", "heading3SizePt", "lineHeight",
      "paragraphSpacingPt", "letterSpacingPx", "defaultAlignment",
      "marginTopMm", "marginBottomMm", "marginLeftMm", "marginRightMm",
      "tableFontSizePt", "tableCellPaddingPt", "headerFontSizePt", "footerFontSizePt",
      "showHeader", "showFooter", "showPageNumbers"
    FROM "ProgrammeCourseSpecDocumentTheme"
    WHERE "programmeId" = ${header.programmeId}
    ON CONFLICT ("courseSpecId") DO NOTHING
  `);
  return readVersionTheme(header.id);
}

export async function getCourseSpecDocumentTheme(
  courseId: string,
  courseSpecId?: string,
): Promise<CourseSpecDocumentThemeResponse> {
  const programmeId = await getProgrammeId(courseId);
  const programmeDefault = await readProgrammeDefault(programmeId);
  const header = await getSpecHeader(courseId, courseSpecId);
  if (!header) {
    if (courseSpecId) {
      throw new CourseSpecThemeNotFoundError("Course Specification version not found");
    }
    return {
      courseSpecId: null,
      reviewStatus: null,
      theme: programmeDefault,
      programmeDefault,
    };
  }

  let theme = await readVersionTheme(header.id);
  if (!theme) {
    if (!["Draft", "ChangesRequested"].includes(header.reviewStatus)) {
      throw new CourseSpecThemeIntegrityError(
        "This locked Course Specification version is missing its document style snapshot",
      );
    }
    theme = await ensureCourseSpecThemeSnapshot(courseId, header.id);
  }
  if (!theme) {
    throw new CourseSpecThemeIntegrityError(
      "Course Specification document style snapshot could not be created",
    );
  }
  return {
    courseSpecId: header.id,
    reviewStatus: header.reviewStatus,
    theme,
    programmeDefault,
  };
}

async function writeAudit(
  programmeId: string,
  courseSpecId: string | null,
  actorId: string,
  scope: "VERSION" | "PROGRAMME_DEFAULT",
  theme: CourseSpecDocumentTheme,
): Promise<void> {
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "CourseSpecDocumentThemeAuditEvent"
      ("programmeId", "courseSpecId", "actorId", "scope", "details")
    VALUES (${programmeId}, ${courseSpecId}, ${actorId}, ${scope}, ${JSON.stringify(theme)})
  `);
}

export async function updateCourseSpecDocumentTheme(
  courseId: string,
  input: UpdateCourseSpecDocumentThemeInput,
  actorId: string,
  courseSpecId?: string,
): Promise<CourseSpecDocumentTheme> {
  const header = await getSpecHeader(courseId, courseSpecId);
  if (!header) throw new CourseSpecThemeNotFoundError("Course Specification has not been started");
  assertCourseSpecEditable(header.reviewStatus);
  const theme = CourseSpecDocumentThemeSchema.parse(input);
  await ensureCourseSpecThemeSnapshot(courseId, header.id);
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`
      UPDATE "CourseSpecDocumentTheme"
      SET
        "bodyFontFamily" = ${theme.bodyFontFamily},
        "bodyFontSizePt" = ${theme.bodyFontSizePt},
        "documentTitleSizePt" = ${theme.documentTitleSizePt},
        "heading1SizePt" = ${theme.heading1SizePt},
        "heading2SizePt" = ${theme.heading2SizePt},
        "heading3SizePt" = ${theme.heading3SizePt},
        "lineHeight" = ${theme.lineHeight},
        "paragraphSpacingPt" = ${theme.paragraphSpacingPt},
        "letterSpacingPx" = ${theme.letterSpacingPx},
        "defaultAlignment" = ${theme.defaultAlignment},
        "marginTopMm" = ${theme.marginsMm.top},
        "marginBottomMm" = ${theme.marginsMm.bottom},
        "marginLeftMm" = ${theme.marginsMm.left},
        "marginRightMm" = ${theme.marginsMm.right},
        "tableFontSizePt" = ${theme.tableFontSizePt},
        "tableCellPaddingPt" = ${theme.tableCellPaddingPt},
        "headerFontSizePt" = ${theme.headerFontSizePt},
        "footerFontSizePt" = ${theme.footerFontSizePt},
        "showHeader" = ${theme.showHeader},
        "showFooter" = ${theme.showFooter},
        "showPageNumbers" = ${theme.showPageNumbers},
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "courseSpecId" = ${header.id}
    `);
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "CourseSpecDocumentThemeAuditEvent"
        ("programmeId", "courseSpecId", "actorId", "scope", "details")
      VALUES (${header.programmeId}, ${header.id}, ${actorId}, 'VERSION', ${JSON.stringify(theme)})
    `);
  });
  return theme;
}

export async function updateProgrammeCourseSpecDocumentTheme(
  courseId: string,
  input: UpdateCourseSpecDocumentThemeInput,
  actorId: string,
): Promise<CourseSpecDocumentTheme> {
  const programmeId = await getProgrammeId(courseId);
  const theme = CourseSpecDocumentThemeSchema.parse(input);
  await ensureProgrammeDefault(programmeId);
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`
      UPDATE "ProgrammeCourseSpecDocumentTheme"
      SET
        "bodyFontFamily" = ${theme.bodyFontFamily},
        "bodyFontSizePt" = ${theme.bodyFontSizePt},
        "documentTitleSizePt" = ${theme.documentTitleSizePt},
        "heading1SizePt" = ${theme.heading1SizePt},
        "heading2SizePt" = ${theme.heading2SizePt},
        "heading3SizePt" = ${theme.heading3SizePt},
        "lineHeight" = ${theme.lineHeight},
        "paragraphSpacingPt" = ${theme.paragraphSpacingPt},
        "letterSpacingPx" = ${theme.letterSpacingPx},
        "defaultAlignment" = ${theme.defaultAlignment},
        "marginTopMm" = ${theme.marginsMm.top},
        "marginBottomMm" = ${theme.marginsMm.bottom},
        "marginLeftMm" = ${theme.marginsMm.left},
        "marginRightMm" = ${theme.marginsMm.right},
        "tableFontSizePt" = ${theme.tableFontSizePt},
        "tableCellPaddingPt" = ${theme.tableCellPaddingPt},
        "headerFontSizePt" = ${theme.headerFontSizePt},
        "footerFontSizePt" = ${theme.footerFontSizePt},
        "showHeader" = ${theme.showHeader},
        "showFooter" = ${theme.showFooter},
        "showPageNumbers" = ${theme.showPageNumbers},
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "programmeId" = ${programmeId}
    `);
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "CourseSpecDocumentThemeAuditEvent"
        ("programmeId", "courseSpecId", "actorId", "scope", "details")
      VALUES (${programmeId}, NULL, ${actorId}, 'PROGRAMME_DEFAULT', ${JSON.stringify(theme)})
    `);
  });
  return theme;
}
