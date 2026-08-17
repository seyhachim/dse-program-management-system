import { afterAll, describe, expect, test } from "bun:test";
import { CourseType, PrismaClient, Semester } from "@prisma/client";
import {
  CurriculumDraftConflictError,
  CurriculumDraftMutationError,
  curriculumDraftService,
} from "./curriculum-draft-service.ts";
import { curriculumService } from "./curriculum-service.ts";

const describeDb = process.env.CURRICULUM_DB_TESTS === "1" ? describe : describe.skip;
const prisma = new PrismaClient();
const suffix = () => crypto.randomUUID().slice(0, 8);

async function fixture() {
  const token = suffix();
  const user = await prisma.user.create({ data: { email: `draft-${token}@example.test`, name: `Draft ${token}` } });
  const programme = await prisma.programme.create({ data: { id: `draft-${token}`, code: `D${token}`, name: `Draft Programme ${token}` } });
  const initial = await curriculumService.createInitial(programme.id, user.id, { code: `CURR-${token}`, name: `Curriculum ${token}`, cohortLabel: "", intakeYear: null, academicYear: "", effectiveFrom: null });
  const course = await prisma.course.create({ data: { programmeId: programme.id, code: `C-${token}`, title: `Course ${token}`, credits: 3, courseType: CourseType.Core } });
  return { token, user, programme, versionId: initial.selectedVersion.id, curriculumId: initial.curriculum.id, course };
}

describeDb("curriculum draft service", () => {
  test("adds, moves, updates, reorders, removes, audits, and refreshes totals", async () => {
    const f = await fixture();
    const second = await prisma.course.create({ data: { programmeId: f.programme.id, code: `C2-${f.token}`, title: `Course 2 ${f.token}`, credits: 2, courseType: CourseType.Elective } });

    let read = await curriculumDraftService.addCourse(f.versionId, f.user.id, { courseId: f.course.id, yearLevel: 1, semester: "First", sortOrder: 0 });
    expect(read.totals.programmeCredits).toBe(3);
    const firstPlacement = read.years[0]!.semesters[0]!.courses[0]!;

    read = await curriculumDraftService.addCourse(f.versionId, f.user.id, { courseId: second.id, yearLevel: 1, semester: "First", sortOrder: 1 });
    const secondPlacement = read.years[0]!.semesters[0]!.courses[1]!;

    read = await curriculumDraftService.updateCourse(firstPlacement.placementId, f.user.id, { yearLevel: 2, semester: "Second", sortOrder: 0, credits: 4, courseType: "Specialization" });
    expect(read.years[1]!.semesters[1]!.courses[0]).toMatchObject({ courseId: f.course.id, credits: 4, courseType: "Specialization" });
    expect(read.totals.programmeCredits).toBe(6);

    // Move it back so reorder has two placements in the same semester.
    read = await curriculumDraftService.updateCourse(firstPlacement.placementId, f.user.id, { yearLevel: 1, semester: "First", sortOrder: 1 });
    read = await curriculumDraftService.reorderCourses(f.versionId, f.user.id, { yearLevel: 1, semester: "First", placementIds: [firstPlacement.placementId, secondPlacement.placementId] });
    expect(read.years[0]!.semesters[0]!.courses.map((c) => c.placementId)).toEqual([firstPlacement.placementId, secondPlacement.placementId]);

    read = await curriculumDraftService.removeCourse(secondPlacement.placementId, f.user.id, "Removed after curriculum committee review");
    expect(read.totals.programmeCredits).toBe(4);
    expect(await prisma.programmeCurriculumAuditAction.count({ where: { curriculumVersionId: f.versionId } })).toBeGreaterThanOrEqual(6);
  });

  test("rejects duplicate and cross-programme placement", async () => {
    const f = await fixture();
    await curriculumDraftService.addCourse(f.versionId, f.user.id, { courseId: f.course.id, yearLevel: 1, semester: "First", sortOrder: 0 });
    await expect(curriculumDraftService.addCourse(f.versionId, f.user.id, { courseId: f.course.id, yearLevel: 2, semester: "Second", sortOrder: 0 })).rejects.toBeInstanceOf(CurriculumDraftConflictError);

    const other = await prisma.programme.create({ data: { id: `other-${f.token}`, code: `O${f.token}`, name: `Other ${f.token}` } });
    const foreign = await prisma.course.create({ data: { programmeId: other.id, code: `F-${f.token}`, title: "Foreign", credits: 2, courseType: CourseType.Basic } });
    await expect(curriculumDraftService.addCourse(f.versionId, f.user.id, { courseId: foreign.id, yearLevel: 1, semester: "First", sortOrder: 0 })).rejects.toBeInstanceOf(CurriculumDraftMutationError);
  });

  test("rejects mutations after approval", async () => {
    const f = await fixture();
    const read = await curriculumDraftService.addCourse(f.versionId, f.user.id, { courseId: f.course.id, yearLevel: 1, semester: "First", sortOrder: 0 });
    const placementId = read.years[0]!.semesters[0]!.courses[0]!.placementId;
    await prisma.programmeCurriculumVersion.update({ where: { id: f.versionId }, data: { status: "Approved", approvedAt: new Date() } });
    await expect(curriculumDraftService.updateCourse(placementId, f.user.id, { yearLevel: 1, semester: "Second", sortOrder: 0 })).rejects.toBeInstanceOf(CurriculumDraftMutationError);
    await expect(curriculumDraftService.removeCourse(placementId, f.user.id, "Not allowed")).rejects.toBeInstanceOf(CurriculumDraftMutationError);
  });

  test("reorder requires exact membership", async () => {
    const f = await fixture();
    const read = await curriculumDraftService.addCourse(f.versionId, f.user.id, { courseId: f.course.id, yearLevel: 1, semester: "First", sortOrder: 0 });
    const placementId = read.years[0]!.semesters[0]!.courses[0]!.placementId;
    await expect(curriculumDraftService.reorderCourses(f.versionId, f.user.id, { yearLevel: 1, semester: "First", placementIds: [placementId, crypto.randomUUID()] })).rejects.toBeInstanceOf(CurriculumDraftMutationError);
  });
});

afterAll(async () => {
  // CI DB is disposable. Immutable approved fixtures intentionally remain.
  await prisma.$disconnect();
});
