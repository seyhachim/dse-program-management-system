import { afterAll, describe, expect, test } from "bun:test";
import { Prisma, PrismaClient } from "@prisma/client";
import { DEFAULT_COURSE_SPEC_DOCUMENT_THEME } from "@dse-pms/shared-types";
import {
  ensureCourseSpecThemeSnapshot,
  getCourseSpecDocumentTheme,
  updateCourseSpecDocumentTheme,
  updateProgrammeCourseSpecDocumentTheme,
} from "../plugins/courses/document-theme-service.ts";
import { CourseSpecLockedError } from "../plugins/courses/spec-lock.ts";
import { gradingScaleService } from "../plugins/programme/grading-scale-service.ts";

const describeDb = process.env.BACKEND_INTEGRATION_TESTS === "1" ? describe : describe.skip;
const prisma = new PrismaClient();

async function fixture() {
  const token = crypto.randomUUID().slice(0, 8);
  const programme = await prisma.programme.create({
    data: {
      id: `theme-programme-${token}`,
      code: `TH${token}`,
      name: `Theme Programme ${token}`,
    },
  });
  const actor = await prisma.user.create({
    data: {
      email: `theme-admin-${token}@example.test`,
      name: `Theme Admin ${token}`,
    },
  });
  const course = await prisma.course.create({
    data: {
      code: `THEME${token}`,
      title: `Theme Course ${token}`,
      programmeId: programme.id,
    },
  });

  // Submission is intentionally protected by the programme grading-policy
  // invariant. Use a real approved default policy rather than bypassing it.
  const draftScale = await gradingScaleService.create(actor.id, {
    programmeId: programme.id,
    code: "standard",
    name: "Theme fixture grading scale",
    description: "Approved policy required for Course Spec submission",
    effectiveFrom: "2026-01-01",
    changeSummary: "Theme integration fixture",
    grades: [
      {
        sortOrder: 1,
        letterGrade: "P",
        gradePoint: 1,
        minScore: 50,
        maxScore: 100,
        minInclusive: true,
        maxInclusive: true,
        explanation: "Pass",
        isPassing: true,
      },
      {
        sortOrder: 2,
        letterGrade: "F",
        gradePoint: 0,
        minScore: 0,
        maxScore: 50,
        minInclusive: true,
        maxInclusive: false,
        explanation: "Fail",
        isPassing: false,
      },
    ],
  });
  await gradingScaleService.approve(draftScale.id, actor.id, {
    note: "Approve theme fixture grading policy",
  });

  return { programme, actor, course };
}

describeDb("Course Specification document theme integration", () => {
  test("programme default is snapshotted per version and later default edits do not restyle it", async () => {
    const f = await fixture();

    const beforeSpec = await getCourseSpecDocumentTheme(f.course.id);
    expect(beforeSpec.courseSpecId).toBeNull();
    expect(beforeSpec.theme).toEqual(DEFAULT_COURSE_SPEC_DOCUMENT_THEME);

    const firstProgrammeDefault = {
      ...DEFAULT_COURSE_SPEC_DOCUMENT_THEME,
      bodyFontFamily: "Times New Roman" as const,
      bodyFontSizePt: 10,
      marginsMm: { top: 18, bottom: 18, left: 20, right: 20 },
    };
    await updateProgrammeCourseSpecDocumentTheme(
      f.course.id,
      firstProgrammeDefault,
      f.actor.id,
    );

    const spec = await prisma.courseSpec.create({
      data: { courseId: f.course.id },
    });
    expect(await ensureCourseSpecThemeSnapshot(f.course.id, spec.id)).toEqual(
      firstProgrammeDefault,
    );

    const secondProgrammeDefault = {
      ...DEFAULT_COURSE_SPEC_DOCUMENT_THEME,
      bodyFontFamily: "Calibri" as const,
      bodyFontSizePt: 11,
    };
    await updateProgrammeCourseSpecDocumentTheme(
      f.course.id,
      secondProgrammeDefault,
      f.actor.id,
    );

    const stored = await getCourseSpecDocumentTheme(f.course.id, spec.id);
    expect(stored.theme).toEqual(firstProgrammeDefault);
    expect(stored.programmeDefault).toEqual(secondProgrammeDefault);
  });

  test("governance can update an editable version and the DB freezes its style after submission", async () => {
    const f = await fixture();
    const spec = await prisma.courseSpec.create({
      data: { courseId: f.course.id },
    });
    await ensureCourseSpecThemeSnapshot(f.course.id, spec.id);

    const customTheme = {
      ...DEFAULT_COURSE_SPEC_DOCUMENT_THEME,
      heading1SizePt: 17,
      lineHeight: 1.45,
      paragraphSpacingPt: 8,
      letterSpacingPx: 0.1,
    };
    expect(
      await updateCourseSpecDocumentTheme(
        f.course.id,
        customTheme,
        f.actor.id,
        spec.id,
      ),
    ).toEqual(customTheme);
    expect((await getCourseSpecDocumentTheme(f.course.id, spec.id)).theme).toEqual(
      customTheme,
    );

    await prisma.courseSpec.update({
      where: { id: spec.id },
      data: {
        reviewStatus: "Submitted",
        submittedAt: new Date(),
        submittedById: f.actor.id,
        submissionVersion: 1,
      },
    });

    await expect(
      updateCourseSpecDocumentTheme(
        f.course.id,
        DEFAULT_COURSE_SPEC_DOCUMENT_THEME,
        f.actor.id,
        spec.id,
      ),
    ).rejects.toBeInstanceOf(CourseSpecLockedError);

    const mutateDirectly = async () => {
      await prisma.$executeRaw(Prisma.sql`
        UPDATE "CourseSpecDocumentTheme"
        SET "bodyFontSizePt" = 12
        WHERE "courseSpecId" = ${spec.id}
      `);
    };
    await expect(mutateDirectly()).rejects.toThrow(/immutable/i);
  });

  test("style changes append audit evidence instead of rewriting history", async () => {
    const f = await fixture();
    const spec = await prisma.courseSpec.create({
      data: { courseId: f.course.id },
    });
    await ensureCourseSpecThemeSnapshot(f.course.id, spec.id);

    await updateCourseSpecDocumentTheme(
      f.course.id,
      {
        ...DEFAULT_COURSE_SPEC_DOCUMENT_THEME,
        tableFontSizePt: 8.5,
      },
      f.actor.id,
      spec.id,
    );

    const rows = await prisma.$queryRaw<
      Array<{ scope: string; actorId: string; courseSpecId: string | null }>
    >(Prisma.sql`
      SELECT "scope", "actorId", "courseSpecId"
      FROM "CourseSpecDocumentThemeAuditEvent"
      WHERE "programmeId" = ${f.programme.id}
      ORDER BY "createdAt" ASC
    `);
    expect(
      rows.some(
        (row) =>
          row.scope === "VERSION" &&
          row.actorId === f.actor.id &&
          row.courseSpecId === spec.id,
      ),
    ).toBe(true);
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
