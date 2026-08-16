import { createHmac } from "node:crypto";
import type {
  CourseDeliveryOffering,
  CourseFeedbackInput,
  CourseFeedbackSummary,
  PortalAnnouncement,
  PortalCloAchievement,
  PortalCourseDetail,
  PortalCourseSummary,
  PublishAnnouncementInput,
  PublishAssessmentResultInput,
  SetAssessmentDeadlineInput,
  StudentPortalHome,
} from "@dse-pms/shared-types";
import { Prisma } from "@prisma/client";
import { prisma } from "../../core/db/prisma.ts";
import { rubricContentHash } from "../../core/academic/rubric-context.ts";
import { calculateCloEvidence, calculateCourseGrade } from "./assessment-calculation.ts";

export class PortalNotFoundError extends Error {}
export class PortalConflictError extends Error {}
export class PortalAccessError extends Error {}

const lecturerSelect = { id: true, name: true, email: true, title: true } as const;
const enrollmentInclude = {
  results: {
    where: { publishedAt: { not: null } },
    include: { criterionScores: true },
  },
  offering: {
    include: {
      lecturer: { select: lecturerSelect },
      coLecturers: { include: { lecturer: { select: lecturerSelect } } },
      meetings: true,
      assessmentDeadlines: true,
      announcements: {
        where: { publishedAt: { not: null } },
        include: { author: { select: { name: true } } },
      },
      course: {
        include: {
          specs: {
            where: { reviewStatus: "Approved" },
            orderBy: [{ versionMajor: "desc" }, { versionMinor: "desc" }],
            take: 1,
            include: {
              clos: { orderBy: { order: "asc" as const } },
              weeks: { orderBy: { order: "asc" as const } },
              assessmentItems: {
                orderBy: { order: "asc" as const },
                include: {
                  criterionCloMappings: true,
                  rubric: {
                    include: { levelRows: { orderBy: { order: "asc" } }, criterionRows: { orderBy: { order: "asc" } } },
                  },
                },
              },
              resources: { orderBy: { order: "asc" as const } },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.EnrollmentInclude;

type EnrollmentRow = Awaited<ReturnType<typeof enrolledRows>>[number];

async function studentForUser(userId: string) {
  const student = await prisma.student.findUnique({ where: { userId } });
  if (!student || student.status !== "Active") {
    throw new PortalAccessError("No active student profile is linked to this account");
  }
  return student;
}

async function enrolledRows(userId: string) {
  const student = await studentForUser(userId);
  const rows = await prisma.enrollment.findMany({
    where: { studentId: student.id },
    include: enrollmentInclude,
    orderBy: { createdAt: "desc" },
  });
  return Object.assign(rows, { student });
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function feedbackKey(userId: string, offeringId: string): string {
  const secret = process.env.FEEDBACK_SECRET ?? process.env.JWT_SECRET;
  if (!secret) throw new Error("FEEDBACK_SECRET or JWT_SECRET must be configured");
  return createHmac("sha256", secret).update(`${userId}:${offeringId}`).digest("hex");
}

function achievementStatus(percentage: number | null): PortalCloAchievement["status"] {
  if (percentage === null) return "not-enough-evidence";
  if (percentage >= 70) return "achieved";
  if (percentage >= 50) return "developing";
  return "needs-attention";
}

export function calculateCloAchievements(
  clos: Array<{ order: number; description: string; status: string }>,
  assessments: Array<{ id: string; name: string; cloCodes: string[]; weight: number | null; status: string }>,
  results: Array<{
    assessmentItemId: string;
    score: number;
    maxScore: number;
    criterionScores?: Array<{
      rubricId: string; criterionId: string; criterionName: string; rubricContentHash: string; score: number; maxScore: number;
    }>;
  }>,
  criterionMappings: Array<{ assessmentItemId: string; rubricId: string; criterionId: string; cloCode: string }> = [],
): PortalCloAchievement[] {
  const assessmentById = new Map(assessments.map((assessment) => [assessment.id, assessment]));
  return clos
    .filter((clo) => clo.status === "Active")
    .map((clo) => {
      const code = `CLO${clo.order + 1}`;
      const criterionEvidence = results.flatMap((result) =>
        (result.criterionScores ?? []).map((score) => ({
          assessmentItemId: result.assessmentItemId,
          rubricId: score.rubricId,
          criterionId: score.criterionId,
          criterionName: score.criterionName,
          rubricContentHash: score.rubricContentHash,
          score: score.score,
          maxScore: score.maxScore,
          cloCodes: criterionMappings
            .filter((mapping) =>
              mapping.assessmentItemId === result.assessmentItemId &&
              mapping.rubricId === score.rubricId &&
              mapping.criterionId === score.criterionId,
            )
            .map((mapping) => mapping.cloCode),
        })),
      );
      const calculation = calculateCloEvidence(code, assessments, results, criterionEvidence);
      return {
        code,
        description: clo.description,
        percentage: calculation.percentage,
        status: achievementStatus(calculation.percentage),
        evidenceCount: calculation.evidence.length,
        evidence: calculation.evidence.map((item) => ({
          assessmentItemId: item.assessmentItemId,
          assessmentName: assessmentById.get(item.assessmentItemId)?.name ?? "Assessment",
          rawPercentage: item.rawPercentage,
          source: item.source,
          ...(item.source === "criterion"
            ? {
                rubricId: item.rubricId,
                criterionId: item.criterionId,
                criterionName: item.criterionName,
                score: item.score,
                maxScore: item.maxScore,
                rubricContentHash: item.rubricContentHash,
              }
            : {}),
        })),
      };
    });
}

const FEEDBACK_MINIMUM_RESPONSES = 3;

type FeedbackSummaryRow = {
  overallRating: number;
  teachingClarityRating: number;
  assessmentClarityRating: number;
  workload: string;
  positiveComment: string;
  improvementComment: string;
};

export function summarizeAnonymousFeedback(
  rows: FeedbackSummaryRow[],
  minimumResponses = FEEDBACK_MINIMUM_RESPONSES,
): CourseFeedbackSummary {
  const workload = { light: 0, appropriate: 0, heavy: 0 };
  for (const row of rows) {
    if (row.workload === "light" || row.workload === "appropriate" || row.workload === "heavy") {
      workload[row.workload] += 1;
    }
  }

  const available = rows.length >= minimumResponses;
  if (!available) {
    return {
      responseCount: rows.length,
      minimumResponses,
      available: false,
      averages: null,
      workload: { light: 0, appropriate: 0, heavy: 0 },
      positiveComments: [],
      improvementComments: [],
    };
  }

  const average = (values: number[]) =>
    Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
  return {
    responseCount: rows.length,
    minimumResponses,
    available: true,
    averages: {
      overall: average(rows.map((row) => row.overallRating)),
      teachingClarity: average(rows.map((row) => row.teachingClarityRating)),
      assessmentClarity: average(rows.map((row) => row.assessmentClarityRating)),
    },
    workload,
    positiveComments: rows.map((row) => row.positiveComment.trim()).filter(Boolean),
    improvementComments: rows.map((row) => row.improvementComment.trim()).filter(Boolean),
  };
}

export function deliveryOfferingScope(userId: string, programmeWide: boolean) {
  return programmeWide
    ? {}
    : {
        OR: [
          { lecturerId: userId },
          { coLecturers: { some: { lecturerId: userId } } },
        ],
      };
}

function approvedSpec(row: EnrollmentRow) {
  return row.offering.course.specs[0] ?? null;
}

function toSummary(row: EnrollmentRow): PortalCourseSummary {
  const { offering } = row;
  const spec = approvedSpec(row);
  const deadlines = new Map(
    offering.assessmentDeadlines.map((deadline) => [deadline.assessmentItemId, deadline.dueAt]),
  );
  const nextAssessment = (spec?.assessmentItems ?? [])
    .filter((item) => item.status === "Active")
    .map((item) => ({
      id: item.id,
      name: item.name,
      dueAt: deadlines.get(item.id)?.toISOString() ?? null,
      dueWeek: item.dueWeek,
    }))
    .sort((a, b) => {
      if (a.dueAt && b.dueAt) return a.dueAt.localeCompare(b.dueAt);
      if (a.dueAt) return -1;
      if (b.dueAt) return 1;
      return (a.dueWeek ?? Number.MAX_SAFE_INTEGER) - (b.dueWeek ?? Number.MAX_SAFE_INTEGER);
    })[0] ?? null;
  return {
    offeringId: offering.id,
    enrollmentId: row.id,
    courseId: offering.course.id,
    code: offering.course.code,
    title: offering.course.title,
    description: offering.course.description,
    credits: offering.course.credits,
    term: offering.term,
    sectionCode: offering.sectionCode,
    lecturer: offering.lecturer,
    coLecturers: offering.coLecturers.map((item) => item.lecturer),
    meetings: offering.meetings.map((meeting) => ({
      ...meeting,
      dayOfWeek: meeting.dayOfWeek as PortalCourseSummary["meetings"][number]["dayOfWeek"],
      activityType: meeting.activityType as PortalCourseSummary["meetings"][number]["activityType"],
    })),
    specAvailable: spec !== null,
    nextAssessment,
  };
}

async function toDetail(row: EnrollmentRow, userId: string): Promise<PortalCourseDetail> {
  const summary = toSummary(row);
  const spec = approvedSpec(row);
  const deadlines = new Map(
    row.offering.assessmentDeadlines.map((deadline) => [deadline.assessmentItemId, deadline.dueAt]),
  );
  const resultByAssessment = new Map(
    row.results.map((result) => [result.assessmentItemId, result]),
  );
  const criterionMappings = (spec?.assessmentItems ?? []).flatMap((assessment) =>
    assessment.criterionCloMappings.map((mapping) => ({
      assessmentItemId: assessment.id,
      rubricId: mapping.rubricId,
      criterionId: mapping.criterionId,
      cloCode: mapping.cloCode,
    })),
  );
  const achievements = spec
    ? calculateCloAchievements(spec.clos, spec.assessmentItems, row.results, criterionMappings)
    : [];
  const grade = spec
    ? calculateCourseGrade(spec.assessmentItems, row.results)
    : { totalGrade: null, complete: false, completedWeight: 0, configuredWeight: 0, contributions: [] };
  const contributionByAssessment = new Map(
    grade.contributions.map((item) => [item.assessmentItemId, item.weightedContribution]),
  );
  const measured = achievements.flatMap((item) => item.percentage === null ? [] : [item.percentage]);
  const responseKeyHash = feedbackKey(userId, row.offeringId);
  return {
    ...summary,
    clos: (spec?.clos ?? [])
      .filter((clo) => clo.status === "Active")
      .map((clo) => ({
        code: `CLO${clo.order + 1}`,
        description: clo.description,
        level: clo.level,
        mappedPlos: clo.mappedPlos,
      })),
    weeks: (spec?.weeks ?? []).map((week) => ({
      id: week.id,
      week: week.week,
      topic: week.topic,
      cloCodes: week.cloCodes,
      learningOutcomes: stringArray(week.lessonLearningOutcomes).length
        ? stringArray(week.lessonLearningOutcomes)
        : week.lloItems,
      activities: week.activities,
    })),
    assessments: (spec?.assessmentItems ?? [])
      .filter((item) => item.status === "Active")
      .map((item) => {
        const result = resultByAssessment.get(item.id);
        const countsTowardGrade = item.weight !== null && item.weight > 0;
        return {
          id: item.id,
          name: item.name,
          type: item.type,
          description: item.description,
          mode: item.mode === "Group" ? "group" as const : "individual" as const,
          cloCodes: item.cloCodes,
          weight: item.weight,
          countsTowardGrade,
          courseGradeWeight: item.weight,
          dueAt: deadlines.get(item.id)?.toISOString() ?? null,
          dueWeek: item.dueWeek,
          format: item.format,
          submissionMethod: item.submissionMethod,
          instructions: item.instructions,
          rubricName: item.rubric?.name ?? "",
          result: result && result.publishedAt
            ? {
                assessmentItemId: item.id,
                score: result.score,
                maxScore: result.maxScore,
                percentage: Math.round((result.score / result.maxScore) * 100),
                weightedCourseContribution: countsTowardGrade
                  ? contributionByAssessment.get(item.id) ?? null
                  : null,
                feedback: result.feedback,
                publishedAt: result.publishedAt.toISOString(),
                criterionEvidence: result.criterionScores.map((score) => ({
                  assessmentItemId: item.id,
                  rubricId: score.rubricId,
                  criterionId: score.criterionId,
                  criterionName: score.criterionName,
                  score: score.score,
                  maxScore: score.maxScore,
                  rawPercentage: Math.round((score.score / score.maxScore) * 10000) / 100,
                  rubricLevelLabel: score.rubricLevelLabel,
                  rubricContentHash: score.rubricContentHash,
                  cloCodes: item.criterionCloMappings
                    .filter((mapping) => mapping.rubricId === score.rubricId && mapping.criterionId === score.criterionId)
                    .map((mapping) => mapping.cloCode),
                })),
              }
            : null,
        };
      }),
    resources: (spec?.resources ?? []).map((resource) => ({
      id: resource.id,
      resourceType: resource.resourceType,
      title: resource.title,
      url: resource.url,
      notes: resource.notes,
    })),
    totalCourseGrade: grade.totalGrade,
    courseGradeComplete: grade.complete,
    completedGradeWeight: grade.completedWeight,
    configuredGradeWeight: grade.configuredWeight,
    achievements,
    overallAchievement: measured.length
      ? Math.round(measured.reduce((sum, item) => sum + item, 0) / measured.length)
      : null,
    feedbackSubmitted: Boolean(await prisma.courseFeedback.findUnique({
      where: { offeringId_responseKeyHash: { offeringId: row.offeringId, responseKeyHash } },
      select: { id: true },
    })),
  };
}

function announcementsFrom(rows: EnrollmentRow[]): PortalAnnouncement[] {
  return rows.flatMap((row) => row.offering.announcements.map((announcement) => ({
    id: announcement.id,
    offeringId: row.offeringId,
    courseCode: row.offering.course.code,
    courseTitle: row.offering.course.title,
    sectionCode: row.offering.sectionCode,
    title: announcement.title,
    body: announcement.body,
    pinned: announcement.pinned,
    authorName: announcement.author.name,
    publishedAt: announcement.publishedAt!.toISOString(),
  }))).sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.publishedAt.localeCompare(a.publishedAt));
}

async function assertOfferingEditor(offeringId: string, userId: string, programmeWide: boolean) {
  const offering = await prisma.offering.findUnique({
    where: { id: offeringId },
    include: {
      coLecturers: true,
      course: {
        select: {
          specs: {
            where: { reviewStatus: "Approved" },
            orderBy: [{ versionMajor: "desc" }, { versionMinor: "desc" }],
            take: 1,
            select: {
              id: true,
              assessmentItems: { select: { id: true } },
            },
          },
        },
      },
    },
  });
  if (!offering) throw new PortalNotFoundError("Offering not found");
  const assigned = offering.lecturerId === userId || offering.coLecturers.some((item) => item.lecturerId === userId);
  if (!programmeWide && !assigned) throw new PortalAccessError("You are not assigned to this offering");
  return offering;
}

export const studentPortalService = {
  async deliveryOfferings(userId: string, programmeWide: boolean): Promise<CourseDeliveryOffering[]> {
    const offerings = await prisma.offering.findMany({
      where: deliveryOfferingScope(userId, programmeWide),
      include: {
        course: {
          include: {
            specs: {
              where: { reviewStatus: "Approved" },
              orderBy: [{ versionMajor: "desc" }, { versionMinor: "desc" }],
              take: 1,
              include: {
                assessmentItems: {
                  orderBy: { order: "asc" },
                  include: {
                    criterionCloMappings: true,
                    rubric: { include: { levelRows: { orderBy: { order: "asc" } }, criterionRows: { orderBy: { order: "asc" } } } },
                  },
                },
              },
            },
          },
        },
        enrollments: {
          include: {
            student: { select: { id: true, studentId: true, name: true } },
            results: { include: { criterionScores: true } },
          },
          orderBy: { student: { name: "asc" } },
        },
        assessmentDeadlines: true,
        announcements: {
          include: { author: { select: { name: true } } },
          orderBy: [{ pinned: "desc" }, { publishedAt: "desc" }],
        },
        feedbackResponses: { orderBy: { createdAt: "asc" } },
      },
      orderBy: [{ term: "desc" }, { course: { code: "asc" } }, { sectionCode: "asc" }],
    });

    return offerings.map((offering) => {
      const spec = offering.course.specs[0] ?? null;
      const deadlines = new Map(
        offering.assessmentDeadlines.map((deadline) => [deadline.assessmentItemId, deadline.dueAt]),
      );
      return {
        offeringId: offering.id,
        courseId: offering.courseId,
        code: offering.course.code,
        title: offering.course.title,
        term: offering.term,
        sectionCode: offering.sectionCode,
        status: offering.status,
        specificationStatus: spec?.reviewStatus ?? null,
        studentCount: offering.enrollments.length,
        assessments: (spec?.assessmentItems ?? [])
          .filter((assessment) => assessment.status === "Active")
          .map((assessment) => ({
            id: assessment.id,
            name: assessment.name,
            type: assessment.type,
            weight: assessment.weight,
            countsTowardGrade: assessment.weight !== null && assessment.weight > 0,
            courseGradeWeight: assessment.weight,
            cloCodes: assessment.cloCodes,
            dueWeek: assessment.dueWeek,
            dueAt: deadlines.get(assessment.id)?.toISOString() ?? null,
            rubricId: assessment.rubricId,
            rubricName: assessment.rubric?.name ?? "",
            rubricContentHash: assessment.rubric ? rubricContentHash(assessment.rubric) : null,
            rubricCriteria: (assessment.rubric?.criterionRows ?? []).map((criterion) => ({
              id: criterion.id,
              name: criterion.name,
              cloCodes: assessment.criterionCloMappings
                .filter((mapping) => mapping.rubricId === assessment.rubricId && mapping.criterionId === criterion.id)
                .map((mapping) => mapping.cloCode),
              levels: (assessment.rubric?.levelRows ?? []).map((level) => ({
                id: level.id, label: level.label, points: level.points,
              })),
            })),
            results: offering.enrollments.map((enrollment) => {
              const result = enrollment.results.find(
                (item) => item.courseSpecId === spec?.id && item.assessmentItemId === assessment.id,
              );
              return {
                enrollmentId: enrollment.id,
                studentId: enrollment.student.id,
                studentCode: enrollment.student.studentId,
                studentName: enrollment.student.name,
                score: result?.score ?? null,
                maxScore: result?.maxScore ?? null,
                feedback: result?.feedback ?? "",
                publishedAt: result?.publishedAt?.toISOString() ?? null,
                finalizedAt: result?.finalizedAt?.toISOString() ?? null,
                criterionScores: result?.criterionScores.map((score) => ({
                  criterionId: score.criterionId,
                  score: score.score,
                  maxScore: score.maxScore,
                  rubricLevelId: score.rubricLevelId,
                  rubricLevelLabel: score.rubricLevelLabel,
                })) ?? [],
              };
            }),
          })),
        announcements: offering.announcements.map((announcement) => ({
          id: announcement.id,
          title: announcement.title,
          body: announcement.body,
          pinned: announcement.pinned,
          authorName: announcement.author.name,
          publishedAt: announcement.publishedAt?.toISOString() ?? null,
        })),
        feedback: summarizeAnonymousFeedback(offering.feedbackResponses),
      };
    });
  },

  async courses(userId: string): Promise<PortalCourseSummary[]> {
    return (await enrolledRows(userId)).map(toSummary);
  },

  async course(userId: string, offeringId: string): Promise<PortalCourseDetail> {
    const rows = await enrolledRows(userId);
    const row = rows.find((item) => item.offeringId === offeringId);
    if (!row) throw new PortalNotFoundError("Enrolled course not found");
    return toDetail(row, userId);
  },

  async announcements(userId: string): Promise<PortalAnnouncement[]> {
    return announcementsFrom(await enrolledRows(userId));
  },

  async home(userId: string): Promise<StudentPortalHome> {
    const rows = await enrolledRows(userId);
    const details = await Promise.all(rows.map((row) => toDetail(row, userId)));
    const measured = details.flatMap((course) => course.overallAchievement === null ? [] : [course.overallAchievement]);
    return {
      student: {
        id: rows.student.id,
        name: rows.student.name,
        studentId: rows.student.studentId,
        email: rows.student.email,
      },
      courses: rows.map(toSummary),
      upcomingAssessments: details.flatMap((course) => course.assessments
        .filter((assessment) => !assessment.result)
        .map((assessment) => ({
          offeringId: course.offeringId,
          courseCode: course.code,
          assessmentId: assessment.id,
          name: assessment.name,
          dueAt: assessment.dueAt,
          dueWeek: assessment.dueWeek,
          weight: assessment.weight,
        })))
        .sort((a, b) => (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999"))
        .slice(0, 6),
      announcements: announcementsFrom(rows).slice(0, 5),
      overallAchievement: measured.length
        ? Math.round(measured.reduce((sum, item) => sum + item, 0) / measured.length)
        : null,
    };
  },

  async submitFeedback(userId: string, offeringId: string, input: CourseFeedbackInput) {
    const student = await studentForUser(userId);
    const enrollment = await prisma.enrollment.findUnique({
      where: { offeringId_studentId: { offeringId, studentId: student.id } },
    });
    if (!enrollment) throw new PortalNotFoundError("Enrolled course not found");
    try {
      await prisma.courseFeedback.create({
        data: { offeringId, responseKeyHash: feedbackKey(userId, offeringId), ...input },
      });
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") {
        throw new PortalConflictError("Feedback has already been submitted for this course");
      }
      throw error;
    }
    return { submitted: true };
  },

  async publishAnnouncement(authorId: string, programmeWide: boolean, input: PublishAnnouncementInput) {
    await assertOfferingEditor(input.offeringId, authorId, programmeWide);
    return prisma.courseAnnouncement.create({
      data: { ...input, authorId, publishedAt: new Date() },
    });
  },

  async publishResult(authorId: string, programmeWide: boolean, input: PublishAssessmentResultInput) {
    const enrollment = await prisma.enrollment.findUnique({
      where: { id: input.enrollmentId },
      include: {
        offering: {
          include: {
            course: {
              include: {
                specs: {
                  where: { reviewStatus: "Approved" },
                  orderBy: [{ versionMajor: "desc" }, { versionMinor: "desc" }],
                  take: 1,
                  include: { assessmentItems: true },
                },
              },
            },
          },
        },
      },
    });
    if (!enrollment) throw new PortalNotFoundError("Enrollment not found");
    await assertOfferingEditor(enrollment.offeringId, authorId, programmeWide);
    const spec = enrollment.offering.course.specs[0] ?? null;
    if (!spec || !spec.assessmentItems.some((item) => item.id === input.assessmentItemId)) {
      throw new PortalNotFoundError("Assessment not found");
    }
    return prisma.assessmentResult.upsert({
      where: {
        enrollmentId_courseSpecId_assessmentItemId: {
          enrollmentId: enrollment.id,
          courseSpecId: spec.id,
          assessmentItemId: input.assessmentItemId,
        },
      },
      update: { score: input.score, maxScore: input.maxScore, feedback: input.feedback, publishedAt: new Date() },
      create: {
        enrollmentId: enrollment.id,
        courseSpecId: spec.id,
        assessmentItemId: input.assessmentItemId,
        score: input.score,
        maxScore: input.maxScore,
        feedback: input.feedback,
        publishedAt: new Date(),
      },
    });
  },

  async setDeadline(authorId: string, programmeWide: boolean, input: SetAssessmentDeadlineInput) {
    const offering = await assertOfferingEditor(input.offeringId, authorId, programmeWide);
    const spec = offering.course.specs[0] ?? null;
    if (!spec?.id) throw new PortalNotFoundError("Course specification not found");
    if (!spec.assessmentItems.some((assessment) => assessment.id === input.assessmentItemId)) {
      throw new PortalNotFoundError("Assessment not found");
    }
    return prisma.offeringAssessmentDeadline.upsert({
      where: {
        offeringId_courseSpecId_assessmentItemId: {
          offeringId: input.offeringId,
          courseSpecId: spec.id,
          assessmentItemId: input.assessmentItemId,
        },
      },
      update: { dueAt: new Date(input.dueAt) },
      create: {
        offeringId: input.offeringId,
        courseSpecId: spec.id,
        assessmentItemId: input.assessmentItemId,
        dueAt: new Date(input.dueAt),
      },
    });
  },
};

export type StudentPortalService = typeof studentPortalService;
