import { randomUUID } from "node:crypto";
import { describe, expect, test } from "bun:test";
import type { AuthUser } from "../../core/auth/token.ts";
import { prisma } from "../../core/db/prisma.ts";
import { studentPortfolioCompetencyService } from "./portfolio-competencies.ts";
import { studentPortfolioEvidenceService } from "./portfolio-evidence.ts";
import { studentPortfolioLinksService } from "./portfolio-links.ts";
import { studentPortfolioProfileService } from "./portfolio-profile.ts";
import { studentPortfolioPublicService } from "./portfolio-public.ts";
import { studentPortfolioSoftSkillService } from "./portfolio-soft-skills.ts";
import { studentPortfolioVerificationService } from "./portfolio-verification.ts";

const dbDescribe = process.env.STUDENT_PORTFOLIO_DB_TESTS === "1" ? describe : describe.skip;

function lecturerActor(id: string): AuthUser {
  return {
    id,
    email: `portfolio-lecturer-${id}@dse.invalid`,
    roles: ["lecturer"],
    programmeRoles: [{ role: "lecturer", programmeId: "dse" }],
  };
}

dbDescribe("student portfolio integrated database boundary", () => {
  test("keeps verification auditable, derives competencies through PLOs, and publishes only explicit public data", async () => {
    const suffix = randomUUID();
    const slug = `portfolio-${suffix.slice(0, 12)}`;
    const courseCodeA = `PTA${suffix.slice(0, 5)}`.toUpperCase();
    const courseCodeB = `PTB${suffix.slice(0, 5)}`.toUpperCase();
    const ploCode = `PLO-PORT-${suffix.slice(0, 8)}`.toUpperCase();
    const competencyCode = `PC-PORT-${suffix.slice(0, 8)}`.toUpperCase();

    const programme = await prisma.programme.findUniqueOrThrow({
      where: { id: "dse" },
      select: { id: true },
    });

    const lecturer = await prisma.user.create({
      data: { email: `portfolio-lecturer-${suffix}@dse.invalid`, name: "Portfolio Lecturer" },
    });
    const outsiderLecturer = await prisma.user.create({
      data: { email: `portfolio-outsider-${suffix}@dse.invalid`, name: "Outside Lecturer" },
    });
    const studentUser = await prisma.user.create({
      data: { email: `portfolio-student-${suffix}@dse.invalid`, name: "Portfolio Student" },
    });
    const student = await prisma.student.create({
      data: {
        userId: studentUser.id,
        name: "Portfolio Student",
        email: studentUser.email,
        studentId: `PORT-${suffix}`,
        status: "Active",
      },
    });

    const plo = await prisma.programLearningOutcome.create({
      data: {
        code: ploCode,
        description: "Demonstrate portfolio competency through approved academic evidence.",
        order: 900000 + Math.floor(Math.random() * 90000),
        active: true,
      },
    });
    const competency = await prisma.programCompetency.create({
      data: {
        code: competencyCode,
        name: "Portfolio Integration Competency",
        description: "Temporary deterministic portfolio test competency.",
        order: 900000 + Math.floor(Math.random() * 90000),
        active: true,
        ploLinks: { create: [{ ploId: plo.id }] },
      },
    });

    const createAcademicSource = async (code: string, term: string) => {
      const course = await prisma.course.create({
        data: {
          code,
          title: `Portfolio Test ${code}`,
          programmeId: programme.id,
          lecturerId: lecturer.id,
        },
      });
      const spec = await prisma.courseSpec.create({
        data: {
          courseId: course.id,
          revisionTriggers: [],
          reviewStatus: "Approved",
          approvedAt: new Date(),
          clos: {
            create: [{ id: randomUUID(), order: 0, description: "Portfolio CLO", mappedPlos: [ploCode], status: "Active" }],
          },
          assessmentItems: {
            create: [{ id: randomUUID(), order: 0, name: "Portfolio Assessment", type: "Project", cloCodes: ["CLO1"], status: "Active" }],
          },
        },
        include: { assessmentItems: true },
      });
      const offering = await prisma.offering.create({
        data: {
          courseId: course.id,
          courseSpecId: spec.id,
          lecturerId: lecturer.id,
          term,
          sectionCode: "PORT",
          status: "Completed",
        },
      });
      await prisma.enrollment.create({ data: { offeringId: offering.id, studentId: student.id } });
      return { course, spec, offering, assessment: spec.assessmentItems[0]! };
    };

    const sourceA = await createAcademicSource(courseCodeA, `portfolio-a-${suffix}`);
    const sourceB = await createAcademicSource(courseCodeB, `portfolio-b-${suffix}`);

    try {
      await studentPortfolioProfileService.update(studentUser.id, {
        headline: "Data student building evidence-backed systems",
        bio: "Public biography without institutional identifiers.",
        careerInterests: ["Data Engineering", "Machine Learning"],
        visibility: "public",
        publicSlug: slug,
      });

      await studentPortfolioLinksService.create(studentUser.id, {
        provider: "github",
        label: "GitHub",
        url: `https://github.com/portfolio-${suffix}`,
        visibility: "public",
      });
      await studentPortfolioLinksService.create(studentUser.id, {
        provider: "linkedin",
        label: "Private LinkedIn",
        url: `https://www.linkedin.com/in/portfolio-${suffix}`,
        visibility: "private",
      });

      const createEvidence = (source: typeof sourceA, title: string) =>
        studentPortfolioEvidenceService.create(studentUser.id, {
          origin: "course_assessment",
          title,
          summary: "Student-authored public context.",
          role: "Data developer",
          contribution: "Implemented and documented the assigned project work.",
          startDate: null,
          endDate: null,
          skills: ["Python"],
          visibility: "public",
          featured: true,
          links: [{ kind: "repository", label: "Repository", url: `https://github.com/example/${randomUUID()}` }],
          source: {
            type: "course_assessment",
            offeringId: source.offering.id,
            assessmentItemId: source.assessment.id,
          },
        });

      const evidenceA = await createEvidence(sourceA, "Portfolio Evidence A");
      const evidenceB = await createEvidence(sourceB, "Portfolio Evidence B");

      await studentPortfolioSoftSkillService.updateEvidenceMapping(studentUser.id, evidenceA.id, {
        skillCodes: ["teamwork", "communication"],
      });

      await expect(
        studentPortfolioVerificationService.decide(
          lecturerActor(outsiderLecturer.id),
          evidenceA.id,
          { state: "verified", reason: "I should not have authority." },
        ),
      ).rejects.toThrow("verification authority");

      const actor = lecturerActor(lecturer.id);
      await studentPortfolioVerificationService.decide(actor, evidenceA.id, {
        state: "verified",
        reason: "Verified against the linked offering and student contribution.",
      });
      await studentPortfolioVerificationService.decide(actor, evidenceB.id, {
        state: "verified",
        reason: "Verified against the second linked course.",
      });

      const skills = await studentPortfolioSoftSkillService.list(studentUser.id);
      const teamwork = skills.find((item) => item.code === "teamwork")!;
      expect(teamwork.evidenceCount).toBe(1);
      expect(teamwork.verifiedExperienceCount).toBe(1);
      expect(teamwork.status).toBe("developing");

      const competencies = await studentPortfolioCompetencyService.list(studentUser.id);
      const derived = competencies.find((item) => item.competencyId === competency.id)!;
      expect(derived.linkedPloCodes).toContain(ploCode);
      expect(new Set(derived.evidence.map((item) => item.courseCode))).toEqual(new Set([courseCodeA, courseCodeB]));
      expect(derived.status).toBe("demonstrated");
      expect(derived.ruleVersion).toBe("portfolio-competency-v1");

      const publicPortfolio = await studentPortfolioPublicService.get(slug);
      expect(publicPortfolio.name).toBe("Portfolio Student");
      expect(publicPortfolio.links.map((item) => item.provider)).toEqual(["github"]);
      expect(publicPortfolio.evidence.map((item) => item.id)).toContain(evidenceA.id);
      expect(publicPortfolio.evidence.map((item) => item.id)).toContain(evidenceB.id);
      expect(JSON.stringify(publicPortfolio)).not.toContain(student.studentId);
      expect(JSON.stringify(publicPortfolio)).not.toContain(studentUser.email);
      expect(JSON.stringify(publicPortfolio)).not.toContain(sourceA.offering.id);
      expect(JSON.stringify(publicPortfolio)).not.toContain("Verified against the linked offering");

      const academicBefore = await prisma.courseSpecAssessmentItem.findUniqueOrThrow({
        where: { courseSpecId_id: { courseSpecId: sourceA.spec.id, id: sourceA.assessment.id } },
        select: { name: true, type: true, cloCodes: true, status: true },
      });

      await studentPortfolioEvidenceService.update(studentUser.id, evidenceA.id, {
        title: "Portfolio Evidence A — revised",
        summary: "A material presentation edit must invalidate the current badge.",
        role: "Data developer",
        contribution: "Revised contribution statement.",
        startDate: null,
        endDate: null,
        skills: ["Python"],
        visibility: "public",
        featured: true,
        links: [],
      });

      expect((await studentPortfolioVerificationService.summary(evidenceA.id)).state).toBe("unverified");
      const historyAfterEdit = await studentPortfolioVerificationService.history(studentUser.id, evidenceA.id);
      expect(historyAfterEdit.map((event) => event.newState)).toEqual(["verified", "unverified"]);
      expect(historyAfterEdit[1]?.actorContext).toBe("system");

      await studentPortfolioVerificationService.decide(actor, evidenceA.id, {
        state: "verified",
        reason: "Reverified after the student's material presentation change.",
      });
      await studentPortfolioEvidenceService.remove(studentUser.id, evidenceA.id);

      const archived = await prisma.studentPortfolioEvidence.findUniqueOrThrow({
        where: { id: evidenceA.id },
        select: { archivedAt: true },
      });
      expect(archived.archivedAt).not.toBeNull();
      expect((await studentPortfolioVerificationService.history(studentUser.id, evidenceA.id)).length).toBe(3);
      expect((await studentPortfolioEvidenceService.list(studentUser.id)).some((item) => item.id === evidenceA.id)).toBe(false);

      const publicAfterArchive = await studentPortfolioPublicService.get(slug);
      expect(publicAfterArchive.evidence.some((item) => item.id === evidenceA.id)).toBe(false);
      expect(publicAfterArchive.evidence.some((item) => item.id === evidenceB.id)).toBe(true);

      const academicAfter = await prisma.courseSpecAssessmentItem.findUniqueOrThrow({
        where: { courseSpecId_id: { courseSpecId: sourceA.spec.id, id: sourceA.assessment.id } },
        select: { name: true, type: true, cloCodes: true, status: true },
      });
      expect(academicAfter).toEqual(academicBefore);

      await studentPortfolioProfileService.update(studentUser.id, {
        headline: "Data student building evidence-backed systems",
        bio: "Public biography without institutional identifiers.",
        careerInterests: ["Data Engineering", "Machine Learning"],
        visibility: "private",
        publicSlug: slug,
      });
      await expect(studentPortfolioPublicService.get(slug)).rejects.toThrow("Public portfolio was not found");
    } finally {
      // Verification rows are append-only by database trigger, so remove their parent
      // test records only after explicitly dropping the temporary rows through a
      // transaction that disables the trigger for this isolated test cleanup.
      await prisma.$executeRawUnsafe('ALTER TABLE "StudentPortfolioVerificationEvent" DISABLE TRIGGER "StudentPortfolioVerificationEvent_no_delete"');
      await prisma.$executeRaw`DELETE FROM "StudentPortfolioVerificationEvent" WHERE "evidenceId" IN (SELECT "id" FROM "StudentPortfolioEvidence" WHERE "studentId" = ${student.id})`;
      await prisma.$executeRawUnsafe('ALTER TABLE "StudentPortfolioVerificationEvent" ENABLE TRIGGER "StudentPortfolioVerificationEvent_no_delete"');
      await prisma.studentPortfolioEvidence.deleteMany({ where: { studentId: student.id } });
      await prisma.studentPortfolioProfessionalLink.deleteMany({ where: { studentId: student.id } });
      await prisma.studentPortfolioProfile.deleteMany({ where: { studentId: student.id } });
      await prisma.enrollment.deleteMany({ where: { studentId: student.id } });
      await prisma.offering.deleteMany({ where: { id: { in: [sourceA.offering.id, sourceB.offering.id] } } });
      await prisma.courseSpec.deleteMany({ where: { id: { in: [sourceA.spec.id, sourceB.spec.id] } } });
      await prisma.course.deleteMany({ where: { id: { in: [sourceA.course.id, sourceB.course.id] } } });
      await prisma.programCompetencyPlo.deleteMany({ where: { competencyId: competency.id } });
      await prisma.programCompetency.delete({ where: { id: competency.id } });
      await prisma.programLearningOutcome.delete({ where: { id: plo.id } });
      await prisma.student.delete({ where: { id: student.id } });
      await prisma.user.deleteMany({ where: { id: { in: [lecturer.id, outsiderLecturer.id, studentUser.id] } } });
    }
  });
});
