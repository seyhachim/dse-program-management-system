import { randomUUID } from "node:crypto";
import { describe, expect, test } from "bun:test";
import { prisma } from "../../core/db/prisma.ts";
import { PortalAccessError, PortalNotFoundError } from "./service.ts";
import { studentPortfolioEvidenceService } from "./portfolio-evidence.ts";

const dbDescribe = process.env.STUDENT_PORTFOLIO_DB_TESTS === "1" ? describe : describe.skip;

dbDescribe("student portfolio evidence database boundary", () => {
  test("enforces ownership, immutable academic provenance, and fail-closed source details", async () => {
    const suffix = randomUUID();
    const userA = await prisma.user.create({
      data: { email: `portfolio-evidence-a-${suffix}@dse.invalid`, name: "Evidence Student A" },
    });
    const userB = await prisma.user.create({
      data: { email: `portfolio-evidence-b-${suffix}@dse.invalid`, name: "Evidence Student B" },
    });
    const studentA = await prisma.student.create({
      data: {
        userId: userA.id,
        name: "Evidence Student A",
        email: userA.email,
        studentId: `EVA-${suffix}`,
        status: "Active",
      },
    });
    const studentB = await prisma.student.create({
      data: {
        userId: userB.id,
        name: "Evidence Student B",
        email: userB.email,
        studentId: `EVB-${suffix}`,
        status: "Active",
      },
    });

    const spec = await prisma.courseSpec.findFirstOrThrow({
      where: {
        reviewStatus: "Approved",
        assessmentItems: { some: { status: "Active" } },
      },
      select: {
        id: true,
        courseId: true,
        assessmentItems: {
          where: { status: "Active" },
          orderBy: { order: "asc" },
          take: 1,
          select: { id: true, name: true, type: true, description: true, weight: true },
        },
      },
    });
    const assessment = spec.assessmentItems[0]!;
    const offering = await prisma.offering.create({
      data: {
        courseId: spec.courseId,
        courseSpecId: spec.id,
        term: `portfolio-evidence-${suffix}`,
        sectionCode: `PE-${suffix.slice(0, 8)}`,
        status: "Completed",
      },
    });
    const enrollment = await prisma.enrollment.create({
      data: { offeringId: offering.id, studentId: studentA.id },
    });

    const selfAdded = await studentPortfolioEvidenceService.create(userA.id, {
      origin: "external_project",
      title: "Independent data dashboard",
      summary: "A student-authored description.",
      role: "Developer",
      contribution: "Built the data pipeline and UI.",
      startDate: null,
      endDate: null,
      skills: ["TypeScript"],
      visibility: "private",
      featured: false,
      links: [{ kind: "repository", label: "Code", url: "https://github.com/example/project" }],
      source: null,
    });
    expect(selfAdded.visibility).toBe("private");
    expect(selfAdded.source).toBeNull();

    await expect(
      studentPortfolioEvidenceService.update(userB.id, selfAdded.id, {
        title: "Changed by another student",
        summary: "",
        role: "",
        contribution: "",
        startDate: null,
        endDate: null,
        skills: [],
        visibility: "private",
        featured: false,
        links: [],
      }),
    ).rejects.toBeInstanceOf(PortalNotFoundError);

    const eligible = await studentPortfolioEvidenceService.eligibleAssessmentSources(userA.id);
    expect(eligible.some((source) => source.offeringId === offering.id && source.assessmentItemId === assessment.id)).toBe(true);
    await expect(
      studentPortfolioEvidenceService.create(userB.id, {
        origin: "course_assessment",
        title: "Unauthorized link",
        summary: "",
        role: "",
        contribution: "",
        startDate: null,
        endDate: null,
        skills: [],
        visibility: "private",
        featured: false,
        links: [],
        source: { type: "course_assessment", offeringId: offering.id, assessmentItemId: assessment.id },
      }),
    ).rejects.toBeInstanceOf(PortalAccessError);

    const academicBefore = await prisma.courseSpecAssessmentItem.findUniqueOrThrow({
      where: { courseSpecId_id: { courseSpecId: spec.id, id: assessment.id } },
      select: { name: true, type: true, description: true, weight: true },
    });

    const linked = await studentPortfolioEvidenceService.create(userA.id, {
      origin: "course_assessment",
      title: "My assessment showcase",
      summary: "Student-authored context only.",
      role: "Team member",
      contribution: "Implemented forecasting evaluation.",
      startDate: null,
      endDate: null,
      skills: ["Forecasting"],
      visibility: "public",
      featured: true,
      links: [{ kind: "report", label: "Public report", url: "https://example.com/report.pdf" }],
      source: { type: "course_assessment", offeringId: offering.id, assessmentItemId: assessment.id },
    });
    expect(linked.source?.available).toBe(true);
    expect(linked.source?.assessmentName).toBe(assessment.name);

    const updated = await studentPortfolioEvidenceService.update(userA.id, linked.id, {
      title: "Updated showcase title",
      summary: "Presentation changed, provenance did not.",
      role: "Team member",
      contribution: "Updated student-authored contribution.",
      startDate: null,
      endDate: null,
      skills: ["Forecasting", "Python"],
      visibility: "private",
      featured: false,
      links: [],
    });
    expect(updated.source?.offeringId).toBe(offering.id);
    expect(updated.source?.assessmentItemId).toBe(assessment.id);

    const academicAfter = await prisma.courseSpecAssessmentItem.findUniqueOrThrow({
      where: { courseSpecId_id: { courseSpecId: spec.id, id: assessment.id } },
      select: { name: true, type: true, description: true, weight: true },
    });
    expect(academicAfter).toEqual(academicBefore);

    await prisma.enrollment.delete({ where: { id: enrollment.id } });
    const restricted = (await studentPortfolioEvidenceService.list(userA.id)).find((item) => item.id === linked.id)!;
    expect(restricted.source?.available).toBe(false);
    expect(restricted.source?.assessmentName).toBeNull();
    expect(restricted.source?.courseCode).toBeNull();

    await studentPortfolioEvidenceService.remove(userA.id, linked.id);
    const academicAfterPortfolioDelete = await prisma.courseSpecAssessmentItem.findUniqueOrThrow({
      where: { courseSpecId_id: { courseSpecId: spec.id, id: assessment.id } },
      select: { name: true, type: true, description: true, weight: true },
    });
    expect(academicAfterPortfolioDelete).toEqual(academicBefore);

    await studentPortfolioEvidenceService.remove(userA.id, selfAdded.id);
    await prisma.offering.delete({ where: { id: offering.id } });
    await prisma.student.deleteMany({ where: { id: { in: [studentA.id, studentB.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
  });
});
