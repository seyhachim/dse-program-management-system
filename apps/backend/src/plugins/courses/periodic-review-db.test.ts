import { beforeAll, describe, expect, test } from "bun:test";
import { prisma } from "../../core/db/prisma.ts";
import { courseSpecPeriodicReviewService } from "./periodic-review-service.ts";

const runDbTests = process.env.COURSE_SPEC_PERIODIC_REVIEW_DB_TESTS === "1";
const describeDb = runDbTests ? describe : describe.skip;

const approvedAt = new Date("2026-01-15T00:00:00.000Z");
const initialDueAt = new Date("2029-01-15T00:00:00.000Z");

async function createApprovedCourse(code: string, title: string) {
  const programme = await prisma.programme.findFirstOrThrow({ select: { id: true } });
  const course = await prisma.course.create({
    data: {
      code,
      title,
      description: `${title} description`,
      credits: 3,
      totalSltHours: 120,
      programmeId: programme.id,
    },
  });
  const spec = await prisma.courseSpec.create({
    data: {
      courseId: course.id,
      versionMajor: 1,
      versionMinor: 0,
      revisionType: "Initial",
      revisionTriggers: [],
      reviewStatus: "Approved",
      approvedAt,
      nextReviewDueAt: initialDueAt,
      courseInfo: {
        create: {
          programmeTitle: "Data Science and Engineering",
          courseTitle: title,
          courseCode: code,
          credits: 3,
          prerequisites: "",
          description: `${title} description`,
          totalSltHours: 120,
          instructorName: "",
          instructorTitle: "",
          qualification: "",
          email: "",
          telephone: "",
          otherLecturers: "",
        },
      },
    },
  });
  return { course, spec };
}

describeDb("CourseSpec periodic reviews", () => {
  let reviewerId = "";

  beforeAll(async () => {
    reviewerId = (await prisma.user.findFirstOrThrow({ select: { id: true } })).id;
  });

  test("reaffirmation preserves the approved version and schedules the next review append-only", async () => {
    const { course, spec } = await createApprovedCourse(
      `REV-REAFF-${Date.now()}`,
      "Periodic Review Reaffirmation",
    );
    const beforeCount = await prisma.courseSpec.count({ where: { courseId: course.id } });
    const review = await courseSpecPeriodicReviewService.create(course.id, reviewerId, {
      scheduledReviewAt: new Date("2029-01-10T00:00:00.000Z"),
      reviewedAt: new Date("2029-01-15T00:00:00.000Z"),
      evidenceSummary: "Stakeholder feedback and course evidence support continuation without academic change.",
      decisionReason: "The approved learning outcomes, alignment, and assessment structure remain appropriate.",
      outcome: "Reaffirmed",
      nextReviewDueAt: new Date("2032-01-15T00:00:00.000Z"),
    });

    expect(review.courseSpecId).toBe(spec.id);
    expect(review.createdRevisionId).toBeNull();
    expect(await prisma.courseSpec.count({ where: { courseId: course.id } })).toBe(beforeCount);
    const unchanged = await prisma.courseSpec.findUniqueOrThrow({
      where: { id: spec.id },
      select: { reviewStatus: true, nextReviewDueAt: true },
    });
    expect(unchanged.reviewStatus).toBe("Approved");
    expect(unchanged.nextReviewDueAt?.toISOString()).toBe(initialDueAt.toISOString());

    await expect(Promise.resolve(prisma.$executeRaw`
      UPDATE "CourseSpecPeriodicReview" SET "decisionReason" = 'mutated' WHERE id = ${review.id}::uuid
    `)).rejects.toThrow(/append-only/i);
    await expect(Promise.resolve(prisma.$executeRaw`
      DELETE FROM "CourseSpecPeriodicReview" WHERE id = ${review.id}::uuid
    `)).rejects.toThrow(/append-only/i);
  });

  test("minor review creates the next draft through the canonical revision service and links it", async () => {
    const { course, spec } = await createApprovedCourse(
      `REV-MINOR-${Date.now()}`,
      "Periodic Review Minor Revision",
    );
    const review = await courseSpecPeriodicReviewService.create(course.id, reviewerId, {
      scheduledReviewAt: new Date("2029-01-10T00:00:00.000Z"),
      reviewedAt: new Date("2029-01-15T00:00:00.000Z"),
      evidenceSummary: "Review identified a small clarification to teaching and assessment documentation.",
      decisionReason: "A minor revision is appropriate because programme outcomes and course identity remain unchanged.",
      outcome: "MinorRevision",
      nextReviewDueAt: new Date("2032-01-15T00:00:00.000Z"),
    });

    expect(review.courseSpecId).toBe(spec.id);
    expect(review.createdRevisionVersion).toBe("1.1");
    const revision = await prisma.courseSpec.findUniqueOrThrow({
      where: { id: review.createdRevisionId! },
      select: {
        reviewStatus: true,
        revisionType: true,
        revisionTriggers: true,
        basedOnVersionId: true,
      },
    });
    expect(revision).toEqual({
      reviewStatus: "Draft",
      revisionType: "Minor",
      revisionTriggers: ["ScheduledReview"],
      basedOnVersionId: spec.id,
    });
  });

  test("due query uses the latest periodic schedule and reports overdue separately", async () => {
    const { course } = await createApprovedCourse(
      `REV-DUE-${Date.now()}`,
      "Periodic Review Due Query",
    );
    const before = await courseSpecPeriodicReviewService.listDue({
      asOf: new Date("2029-01-16T00:00:00.000Z"),
      includeFutureDays: 0,
    });
    expect(before.find((item) => item.courseId === course.id)?.status).toBe("Overdue");

    await courseSpecPeriodicReviewService.create(course.id, reviewerId, {
      scheduledReviewAt: new Date("2029-01-10T00:00:00.000Z"),
      reviewedAt: new Date("2029-01-16T00:00:00.000Z"),
      evidenceSummary: "Periodic review completed with sufficient evidence to reaffirm the current academic version.",
      decisionReason: "No material revision is required and the next review is scheduled in three years.",
      outcome: "Reaffirmed",
      nextReviewDueAt: new Date("2032-01-16T00:00:00.000Z"),
    });

    const after = await courseSpecPeriodicReviewService.listDue({
      asOf: new Date("2029-01-16T00:00:00.000Z"),
      includeFutureDays: 0,
    });
    expect(after.some((item) => item.courseId === course.id)).toBe(false);

    const next = await courseSpecPeriodicReviewService.listDue({
      asOf: new Date("2032-01-16T00:00:00.000Z"),
      includeFutureDays: 0,
    });
    const due = next.find((item) => item.courseId === course.id);
    expect(due?.status).toBe("Due");
    expect(due?.latestPeriodicOutcome).toBe("Reaffirmed");
  });
});
