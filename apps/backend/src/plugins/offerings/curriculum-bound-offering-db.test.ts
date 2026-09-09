import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { CourseType, Semester } from "@prisma/client";
import { prisma } from "../../core/db/prisma.ts";
import { registry } from "../../core/plugins/registry.ts";
import { coursesPlugin } from "../courses/index.ts";
import { lecturersPlugin } from "../lecturers/index.ts";
import { programmePlugin } from "../programme/index.ts";
import { academicCalendarService } from "../programme/academic-calendar-service.ts";
import { curriculumWorkflowService } from "../programme/curriculum-workflow-service.ts";
import { studentsPlugin } from "../students/index.ts";
import { curriculumBoundOfferingService } from "./curriculum-bound-service.ts";
import { offeringService } from "./service.ts";

process.env.JWT_SECRET ??= "issue-968-curriculum-binding-test-secret-at-least-32-characters";

const runDbTests = process.env.OFFERING_COURSE_SPEC_DB_TESTS === "1";
const dbDescribe = runDbTests ? describe : describe.skip;

function ensureDependencies() {
  if (!registry.has("students")) registry.register(studentsPlugin);
  if (!registry.has("lecturers")) registry.register(lecturersPlugin);
  if (!registry.has("courses")) registry.register(coursesPlugin);
  if (!registry.has("programme")) registry.register(programmePlugin);
}

async function expectRejected(operation: () => Promise<unknown>) {
  let rejected = false;
  try { await operation(); } catch { rejected = true; }
  expect(rejected).toBe(true);
}

dbDescribe("curriculum-bound Offerings", () => {
  test("pins an older approved curriculum while using a later published Academic Calendar", async () => {
    ensureDependencies();
    const suffix = randomUUID();
    const actor = await prisma.user.findFirstOrThrow({ select: { id: true } });
    const lecturer = await prisma.user.findFirstOrThrow({
      where: { roleAssignments: { some: { role: { slug: "lecturer" } } } },
      select: { id: true },
    });
    const programmeId = `issue968-${suffix}`;
    await prisma.programme.create({
      data: {
        id: programmeId,
        code: `I968-${suffix.slice(0, 8)}`,
        name: "Issue 968 cross-year curriculum test",
      },
    });
    const curriculum = await prisma.programmeCurriculum.create({
      data: { programmeId, code: `CURR-${suffix.slice(0, 8)}`, name: "DSE test curriculum" },
    });
    const olderCourse = await prisma.course.create({
      data: {
        programmeId,
        code: `SDA-${suffix.slice(0, 8)}`,
        title: "Simulation and Decision Analytics",
        credits: 3,
        courseType: CourseType.Core,
      },
    });
    const newerCourse = await prisma.course.create({
      data: {
        programmeId,
        code: `BIA-${suffix.slice(0, 8)}`,
        title: "Business Intelligence and Analytics",
        credits: 3,
        courseType: CourseType.Core,
      },
    });

    // Build both curriculum versions through the canonical Draft → submit → approve
    // workflow. The database correctly prevents adding placements after approval.
    const olderVersion = await prisma.programmeCurriculumVersion.create({
      data: {
        curriculumId: curriculum.id,
        versionMajor: 1,
        versionMinor: 0,
        cohortLabel: "Cohort 2025",
        intakeYear: 2025,
        academicYear: "2025-2026",
        createdById: actor.id,
      },
    });
    const olderPlacement = await prisma.programmeCurriculumCourse.create({
      data: {
        curriculumVersionId: olderVersion.id,
        courseId: olderCourse.id,
        yearLevel: 3,
        semester: Semester.First,
        creditsSnapshot: 3,
        courseTypeSnapshot: CourseType.Core,
      },
    });
    await curriculumWorkflowService.submit(
      olderVersion.id,
      actor.id,
      "Submit older curriculum fixture for issue 968",
    );
    await curriculumWorkflowService.approve(
      olderVersion.id,
      actor.id,
      "Approve older curriculum fixture for issue 968",
    );

    const newerVersion = await prisma.programmeCurriculumVersion.create({
      data: {
        curriculumId: curriculum.id,
        versionMajor: 2,
        versionMinor: 0,
        revisionType: "Major",
        revisionTriggers: ["ProgrammeCoordinator"],
        revisionReason: "Issue 968 fixture newer curriculum",
        changeSummary: "Replace the Year III example course",
        basedOnVersionId: olderVersion.id,
        cohortLabel: "Cohort 2026",
        intakeYear: 2026,
        academicYear: "2026-2027",
        createdById: actor.id,
      },
    });
    await prisma.programmeCurriculumCourse.create({
      data: {
        curriculumVersionId: newerVersion.id,
        courseId: newerCourse.id,
        yearLevel: 3,
        semester: Semester.First,
        creditsSnapshot: 3,
        courseTypeSnapshot: CourseType.Core,
      },
    });
    await curriculumWorkflowService.submit(
      newerVersion.id,
      actor.id,
      "Submit newer curriculum fixture for issue 968",
    );
    await curriculumWorkflowService.approve(
      newerVersion.id,
      actor.id,
      "Approve newer curriculum fixture for issue 968",
    );

    const academicYear = await academicCalendarService.createAcademicYear(programmeId, {
      label: "2026-2027",
      startYear: 2026,
      endYear: 2027,
      isCurrent: false,
    });
    const draft = await academicCalendarService.createCalendar(programmeId, actor.id, {
      academicYearId: academicYear.id,
      revisionReason: "Issue 968 test calendar",
      studyYears: [3],
      periods: [
        {
          semester: "First",
          teachingStart: "2026-09-14",
          teachingEnd: "2027-01-16",
          examStart: "2027-01-11",
          examEnd: "2027-01-16",
        },
      ],
      events: [],
      sourceTitle: "Official Year 3 test calendar",
      sourcePublishedAt: "2026-08-01",
      sourceUrl: null,
      sourceFileRef: null,
      sourceNote: "Issue 968 test source",
    });
    const published = await academicCalendarService.publishCalendar(programmeId, draft.id, actor.id);
    const period = published.periods[0]!;

    const baseInput = {
      courseId: olderCourse.id,
      courseSpecId: null,
      term: "ignored-client-term",
      sectionCode: "M1",
      lecturerId: lecturer.id,
      coLecturerIds: [],
      capacity: 30,
      status: "Planned" as const,
      semester: "First" as const,
      programmeYear: 3,
      academicCalendarPeriodId: period.id,
      meetings: [
        {
          dayOfWeek: "Monday" as const,
          startTime: "08:00",
          endTime: "12:00",
          room: "STEM 306",
          activityType: "Lecture" as const,
        },
      ],
    };

    // The legacy year-derived path sees v2.0 for 2026-2027 and rejects SDA.
    await expectRejected(() => offeringService.create(baseInput));

    const created = await curriculumBoundOfferingService.create(
      { curriculumCourseId: olderPlacement.id, offering: baseInput },
      actor.id,
    );
    expect(created.term).toBe("2026-2027-S1");
    expect(created.course?.id).toBe(olderCourse.id);
    expect(created.academicCalendar?.academicYearLabel).toBe("2026-2027");

    const binding = await curriculumBoundOfferingService.getBinding(created.id);
    expect(binding?.curriculumCourseId).toBe(olderPlacement.id);
    expect(binding?.curriculumVersionId).toBe(olderVersion.id);
    expect(binding?.version.version).toBe("1.0");
    expect(binding?.placement.yearLevel).toBe(3);
  });

  test("does not allow a Draft curriculum placement to authorize delivery", async () => {
    ensureDependencies();
    const suffix = randomUUID();
    const actor = await prisma.user.findFirstOrThrow({ select: { id: true } });
    const programmeId = `issue968-draft-${suffix}`;
    await prisma.programme.create({
      data: { id: programmeId, code: `I968D-${suffix.slice(0, 8)}`, name: "Issue 968 draft test" },
    });
    const curriculum = await prisma.programmeCurriculum.create({
      data: { programmeId, code: `DRAFT-${suffix.slice(0, 8)}`, name: "Draft curriculum" },
    });
    const course = await prisma.course.create({
      data: {
        programmeId,
        code: `DR-${suffix.slice(0, 8)}`,
        title: "Draft-only course",
        credits: 3,
        courseType: CourseType.Core,
      },
    });
    const draftVersion = await prisma.programmeCurriculumVersion.create({
      data: { curriculumId: curriculum.id, createdById: actor.id },
    });
    const placement = await prisma.programmeCurriculumCourse.create({
      data: {
        curriculumVersionId: draftVersion.id,
        courseId: course.id,
        yearLevel: 3,
        semester: Semester.First,
        creditsSnapshot: 3,
        courseTypeSnapshot: CourseType.Core,
      },
    });

    expect(await programmePlugin.service.offeringCurriculum.getPlacement(programmeId, placement.id)).toBeNull();
  });

  test("keeps the curriculum binding outside Supabase Data API access", async () => {
    const rls = await prisma.$queryRaw<{ rls_enabled: boolean }[]>`
      SELECT c.relrowsecurity AS rls_enabled
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'offering_governance'
        AND c.relname = 'OfferingCurriculumBinding'
    `;
    expect(rls[0]?.rls_enabled).toBe(true);

    const forbiddenTableGrants = await prisma.$queryRaw<{
      grantee: string;
      privilege_type: string;
    }[]>`
      SELECT grantee, privilege_type
      FROM information_schema.table_privileges
      WHERE table_schema = 'offering_governance'
        AND table_name = 'OfferingCurriculumBinding'
        AND grantee IN ('PUBLIC', 'anon', 'authenticated', 'service_role')
    `;
    expect(forbiddenTableGrants).toEqual([]);

    const forbiddenSchemaUsage = await prisma.$queryRaw<{
      role_name: string;
      has_usage: boolean;
    }[]>`
      SELECT rolname AS role_name,
             has_schema_privilege(rolname, 'offering_governance', 'USAGE') AS has_usage
      FROM pg_roles
      WHERE rolname IN ('anon', 'authenticated', 'service_role')
    `;
    expect(forbiddenSchemaUsage.every((row) => row.has_usage === false)).toBe(true);
  });
});
