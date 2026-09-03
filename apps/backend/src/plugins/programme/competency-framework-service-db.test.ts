import { afterAll, describe, expect, test } from "bun:test";
import { PrismaClient } from "@prisma/client";
import { curriculumService } from "./curriculum-service.ts";
import {
  InvalidCompetencyFrameworkAssignmentError,
  competencyFrameworkService,
} from "./competency-framework-service.ts";

const dbTestsEnabled = process.env.CURRICULUM_DB_TESTS === "1";
const describeDb = dbTestsEnabled ? describe : describe.skip;
const prisma = new PrismaClient();
const suffix = () => crypto.randomUUID().slice(0, 8);

async function createBase() {
  const token = suffix();
  const user = await prisma.user.create({
    data: { email: `competency-framework-${token}@example.test`, name: `Competency Framework ${token}` },
  });
  const programme = await prisma.programme.create({
    data: { id: `competency-framework-${token}`, code: `CF${token}`, name: `Competency Framework Programme ${token}` },
  });
  const curriculum = await curriculumService.createInitial(programme.id, user.id, {
    code: `CURR-${token}`,
    name: `Curriculum ${token}`,
    cohortLabel: "",
    intakeYear: null,
    academicYear: "",
    effectiveFrom: null,
  });
  return { user, programme, curriculum, token };
}

describeDb("curriculum competency framework versioning", () => {
  test("snapshots canonical competencies, binds Draft only, and revision inherits the exact snapshot", async () => {
    const { user, programme, curriculum, token } = await createBase();
    const canonical = await prisma.programCompetency.findMany({
      where: { active: true },
      include: { ploLinks: { include: { plo: true } } },
      orderBy: { order: "asc" },
    });
    expect(canonical.length).toBeGreaterThan(0);

    const snapshot = await competencyFrameworkService.createSnapshot(programme.id, user.id, {
      code: `framework-${token}`,
      name: "Graduate Competencies",
      changeNote: "Initial curriculum design baseline",
    });
    expect(snapshot.version).toBe(1);
    expect(snapshot.competencies.map((item) => item.code)).toEqual(canonical.map((item) => item.code));
    expect(snapshot.competencies[0]?.ploCodes).toEqual(
      canonical[0]!.ploLinks.map((link) => link.plo.code).sort(),
    );

    await competencyFrameworkService.bindToCurriculumVersion(
      curriculum.selectedVersion.id,
      snapshot.frameworkVersionId,
      user.id,
    );
    const bound = await curriculumService.getById(curriculum.curriculum.id, curriculum.selectedVersion.id);
    expect(bound.competencyFramework).toMatchObject({
      frameworkVersionId: snapshot.frameworkVersionId,
      frameworkCode: `framework-${token}`,
      version: 1,
    });

    await prisma.programmeCurriculumVersion.update({
      where: { id: curriculum.selectedVersion.id },
      data: { status: "Approved", approvedAt: new Date() },
    });
    await expect(
      competencyFrameworkService.bindToCurriculumVersion(
        curriculum.selectedVersion.id,
        snapshot.frameworkVersionId,
        user.id,
      ),
    ).rejects.toBeInstanceOf(InvalidCompetencyFrameworkAssignmentError);
    await expect(
      prisma.programmeCurriculumVersion.update({
        where: { id: curriculum.selectedVersion.id },
        data: { competencyFrameworkVersionId: null, competencyFrameworkAssignedById: null, competencyFrameworkAssignedAt: null },
      }),
    ).rejects.toThrow();

    const revision = await curriculumService.createRevision(
      curriculum.curriculum.id,
      curriculum.selectedVersion.id,
      user.id,
      {
        revisionType: "Minor",
        revisionTriggers: ["ScheduledReview"],
        revisionReason: "Periodic review",
        changeSummary: "Start a new auditable design revision",
      },
    );
    expect(revision.competencyFramework?.frameworkVersionId).toBe(snapshot.frameworkVersionId);
    expect(revision.competencyFramework?.assignedById).toBe(user.id);
  });

  test("rejects cross-programme framework assignment and immutable snapshot mutation", async () => {
    const first = await createBase();
    const second = await createBase();
    const snapshot = await competencyFrameworkService.createSnapshot(
      second.programme.id,
      second.user.id,
      { code: `framework-${second.token}`, name: "Other programme framework", changeNote: "" },
    );

    await expect(
      competencyFrameworkService.bindToCurriculumVersion(
        first.curriculum.selectedVersion.id,
        snapshot.frameworkVersionId,
        first.user.id,
      ),
    ).rejects.toBeInstanceOf(InvalidCompetencyFrameworkAssignmentError);

    await expect(
      prisma.programmeCompetencyFrameworkVersion.update({
        where: { id: snapshot.frameworkVersionId },
        data: { changeNote: "rewrite history" },
      }),
    ).rejects.toThrow();
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
