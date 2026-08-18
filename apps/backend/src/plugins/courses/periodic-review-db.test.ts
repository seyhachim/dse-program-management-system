import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { prisma } from "../../core/db/prisma.ts";
import { courseService } from "./service.ts";
import { courseSpecPeriodicReviewService } from "./periodic-review-service.ts";

const enabled = process.env.COURSE_SPEC_PERIODIC_REVIEW_DB_TESTS === "1";
const dbDescribe = enabled ? describe : describe.skip;

async function createApprovedCourse(label: string, dueAt: Date) {
  const suffix = randomUUID();
  const course = await prisma.course.create({
    data: {
      code: `${label}-${suffix.slice(0, 8)}`,
      title: `${label} periodic review fixture`,
      description: "Periodic review fixture",
      credits: 3,
      courseType: "Core",
      totalSltHours: 120,
      programmeId: "dse",
    },
  });

  await courseService.saveSection(course.id, "courseInfo", {
    prerequisites: "None",
    description: "Periodic review fixture",
  });
  const source = await prisma.courseSpec.findFirstOrThrow({
    where: { courseId: course.id },
    orderBy: [{ versionMajor: "desc" }, { versionMinor: "desc" }],
  });
  await prisma.courseSpec.update({
    where: { id: source.id },
    data: {
      reviewStatus: "Approved",
      approvedAt: new Date("2022-08-18T00:00:00.000Z"),
      nextReviewDueAt: dueAt,
    },
  });
  return { course, source };
}

async function createReviewer() {
  return prisma.user.create({
    data: {
      email: `issue209-${randomUUID()}@dse.invalid`,
      name: "Issue 209 Programme Reviewer",
    },
  });
}

dbDescribe("CourseSpec periodic-review governance", () => {
  test("reaffirms an approved version without cloning it and reschedules the review", async () => {
    const reviewer = await createReviewer();
    const { course, source } = await createApprovedCourse(
      "I209R",
      new Date("2025-08-18T00:00:00.000Z"),
    );

    const beforeCount = await prisma.courseSpec.count({
      where: { courseId: course.id },
    });
    const review = await courseSpecPeriodicReviewService.create(
      course.id,
      reviewer.id,
      {
        courseSpecId: source.id,
        reviewedAt: "2026-08-18",
        evidenceSummary: "Programme evidence supports retaining the approved specification.",
        decisionReason: "No material academic change is required at this review point.",
        outcome: "Reaffirmed",
        changeSummary: "",
      },
    );

    expect(review.outcome).toBe("Reaffirmed");
    expect(review.createdRevisionId).toBeNull();
    expect(review.scheduledDueAt).toBe("2025-08-18");
    expect(review.nextReviewDueAt).toBe("2029-08-18");
    expect(
      await prisma.courseSpec.count({ where: { courseId: course.id } }),
    ).toBe(beforeCount);

    const sourceAfter = await prisma.courseSpec.findUniqueOrThrow({
      where: { id: source.id },
    });
    expect(sourceAfter.reviewStatus).toBe("Approved");
    expect(sourceAfter.nextReviewDueAt?.toISOString().slice(0, 10)).toBe(
      "2025-08-18",
    );

    const notDue = await courseSpecPeriodicReviewService.listDue(
      "dse",
      "2028-08-18",
    );
    expect(notDue.some((item) => item.courseId === course.id)).toBe(false);

    const dueLater = await courseSpecPeriodicReviewService.listDue(
      "dse",
      "2029-08-19",
    );
    expect(dueLater.find((item) => item.courseId === course.id)).toMatchObject({
      courseSpecId: source.id,
      academicVersion: "1.0",
      effectiveDueAt: "2029-08-18",
      daysOverdue: 1,
    });
  });

  test("creates a canonical revision for a revision outcome and links the immutable review", async () => {
    const reviewer = await createReviewer();
    const { course, source } = await createApprovedCourse(
      "I209M",
      new Date("2025-08-18T00:00:00.000Z"),
    );

    const review = await courseSpecPeriodicReviewService.create(
      course.id,
      reviewer.id,
      {
        courseSpecId: source.id,
        reviewedAt: "2026-08-18",
        evidenceSummary: "Scheduled review identified a bounded update to assessment guidance.",
        decisionReason: "The approved version should be revised while retaining course scope.",
        outcome: "MinorRevision",
        changeSummary: "Update assessment guidance and aligned explanatory text.",
      },
    );

    expect(review.outcome).toBe("MinorRevision");
    expect(review.nextReviewDueAt).toBeNull();
    expect(review.createdRevisionId).not.toBeNull();

    const revision = await prisma.courseSpec.findUniqueOrThrow({
      where: { id: review.createdRevisionId! },
    });
    expect(revision.basedOnVersionId).toBe(source.id);
    expect(revision.reviewStatus).toBe("Draft");
    expect(revision.revisionType).toBe("Minor");
    expect(revision.revisionTriggers).toContain("ScheduledReview");
    expect(`${revision.versionMajor}.${revision.versionMinor}`).toBe("1.1");

    const dueWhileRevisionPending = await courseSpecPeriodicReviewService.listDue(
      "dse",
      "2030-08-18",
    );
    expect(
      dueWhileRevisionPending.some((item) => item.courseId === course.id),
    ).toBe(false);

    const rows = await courseSpecPeriodicReviewService.list(course.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.createdRevisionId).toBe(revision.id);

    let updateRejected = false;
    try {
      await prisma.$executeRaw`
        UPDATE "course_spec_governance"."CourseSpecPeriodicReview"
        SET "decisionReason" = 'attempted rewrite'
        WHERE "id" = ${review.id}
      `;
    } catch {
      updateRejected = true;
    }
    expect(updateRejected).toBe(true);

    let deleteRejected = false;
    try {
      await prisma.$executeRaw`
        DELETE FROM "course_spec_governance"."CourseSpecPeriodicReview"
        WHERE "id" = ${review.id}
      `;
    } catch {
      deleteRejected = true;
    }
    expect(deleteRejected).toBe(true);
  });
});
