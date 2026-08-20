import { describe, expect, test } from "bun:test";
import { projectLatestCourseSpecReviewStatus } from "./course-list-review-status.ts";

describe("course list review status projection", () => {
  test("returns CS101 as Approved from its latest CourseSpec and null for a course without a spec", () => {
    const courses = [
      { id: "course-cs101", code: "CS101", title: "Introduction to Programming" },
      { id: "course-nospec", code: "NEW101", title: "New Course" },
    ];

    const result = projectLatestCourseSpecReviewStatus(courses, [
      {
        courseId: "course-cs101",
        versionMajor: 1,
        versionMinor: 0,
        reviewStatus: "Approved",
      },
    ]);

    expect(result).toEqual([
      {
        id: "course-cs101",
        code: "CS101",
        title: "Introduction to Programming",
        reviewStatus: "Approved",
      },
      {
        id: "course-nospec",
        code: "NEW101",
        title: "New Course",
        reviewStatus: null,
      },
    ]);
  });

  test("uses the highest major/minor CourseSpec version regardless of input order", () => {
    const [course] = projectLatestCourseSpecReviewStatus(
      [{ id: "course-cs101", code: "CS101" }],
      [
        {
          courseId: "course-cs101",
          versionMajor: 1,
          versionMinor: 2,
          reviewStatus: "Submitted",
        },
        {
          courseId: "course-cs101",
          versionMajor: 2,
          versionMinor: 0,
          reviewStatus: "Approved",
        },
        {
          courseId: "course-cs101",
          versionMajor: 1,
          versionMinor: 9,
          reviewStatus: "ChangesRequested",
        },
      ],
    );

    expect(course?.reviewStatus).toBe("Approved");
  });
});
