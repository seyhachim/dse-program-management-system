import { describe, expect, test } from "bun:test";
import type { CourseSpecProgress, OfferingView } from "@dse-pms/shared-types";
import {
  ALL_COURSE_FILTER,
  buildCourseSpecRows,
  courseSpecRowGroupLabel,
  type CourseSpecCourse,
  type CourseSpecRowFilters,
} from "./my-course-spec-rows";

const lecturerId = "lecturer-me";
const allFilters: CourseSpecRowFilters = {
  search: "",
  term: ALL_COURSE_FILTER,
  semester: ALL_COURSE_FILTER,
  studyYear: ALL_COURSE_FILTER,
};

function course(id: string, code: string, title = `${code} title`): CourseSpecCourse {
  return { id, code, title };
}

function placement(
  programmeYear: number,
  semester: "First" | "Second",
  sortOrder = 0,
): NonNullable<CourseSpecProgress["curriculumPlacement"]> {
  return { programmeYear, semester, sortOrder };
}

function progress(
  courseRow: CourseSpecCourse,
  curriculumPlacement: CourseSpecProgress["curriculumPlacement"] = null,
): CourseSpecProgress {
  return {
    courseId: courseRow.id,
    code: courseRow.code,
    title: courseRow.title,
    completed: 3,
    total: 8,
    curriculumPlacement,
    incompleteSections: [],
  };
}

function offering({
  id,
  courseRow,
  primaryLecturerId,
  sectionCode = "A",
  term = "2026-2027",
  semester = "First",
  programmeYear = 2,
}: {
  id: string;
  courseRow: CourseSpecCourse;
  primaryLecturerId: string;
  sectionCode?: string;
  term?: string;
  semester?: "First" | "Second";
  programmeYear?: number | null;
}): OfferingView {
  return {
    id,
    course: {
      ...courseRow,
      programmeId: "dse",
    },
    lecturer: { id: primaryLecturerId },
    sectionCode,
    term,
    semester,
    programmeYear,
  } as unknown as OfferingView;
}

describe("lecturer Course Specification rows", () => {
  test("keeps a Responsible-Lecturer-only course and groups it by active curriculum placement", () => {
    const pan202 = course("pan202", "PAN202", "Predictive Analytics");
    const pan202Progress = progress(pan202, placement(2, "Second", 3));

    const rows = buildCourseSpecRows({
      courses: [pan202],
      offerings: [],
      specProgress: [pan202Progress],
      lecturerId,
      filters: allFilters,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.course).toEqual(pan202);
    expect(rows[0]?.offerings).toEqual([]);
    expect(rows[0]?.role).toBe("Responsible");
    expect(rows[0]?.progress).toBe(pan202Progress);
    expect(rows[0]?.progress.total).toBe(8);
    expect(courseSpecRowGroupLabel(rows[0]!)).toBe("Year 2 · Semester 2");
  });

  test("preserves Offering primary/co-lecturer access and groups sections once per course", () => {
    const primaryCourse = course("primary", "PRI201");
    const coCourse = course("co", "CO201");

    const rows = buildCourseSpecRows({
      courses: [primaryCourse, coCourse],
      offerings: [
        offering({
          id: "primary-a",
          courseRow: primaryCourse,
          primaryLecturerId: lecturerId,
          sectionCode: "A",
        }),
        offering({
          id: "primary-b",
          courseRow: primaryCourse,
          primaryLecturerId: lecturerId,
          sectionCode: "B",
        }),
        offering({
          id: "co-a",
          courseRow: coCourse,
          primaryLecturerId: "another-lecturer",
          sectionCode: "A",
        }),
      ],
      specProgress: [
        progress(primaryCourse, placement(2, "First", 1)),
        progress(coCourse, placement(2, "First", 2)),
      ],
      lecturerId,
      filters: allFilters,
    });

    expect(rows).toHaveLength(2);
    const primaryRow = rows.find((row) => row.course.id === primaryCourse.id);
    const coRow = rows.find((row) => row.course.id === coCourse.id);

    expect(primaryRow?.role).toBe("Primary");
    expect(primaryRow?.offerings.map((row) => row.sectionCode).sort()).toEqual([
      "A",
      "B",
    ]);
    expect(coRow?.role).toBe("Co-Lecturer");
    expect(coRow?.offerings).toHaveLength(1);
  });

  test("uses curriculum placement for grouping even when Offering metadata differs", () => {
    const taught = course("taught", "TAUGHT202");
    const rows = buildCourseSpecRows({
      courses: [taught],
      offerings: [
        offering({
          id: "taught-a",
          courseRow: taught,
          primaryLecturerId: lecturerId,
          semester: "First",
          programmeYear: 4,
        }),
      ],
      specProgress: [progress(taught, placement(2, "Second", 4))],
      lecturerId,
      filters: allFilters,
    });

    expect(rows).toHaveLength(1);
    expect(courseSpecRowGroupLabel(rows[0]!)).toBe("Year 2 · Semester 2");
  });

  test("orders rows by curriculum year, semester, sort order, then code and puts unplaced courses last", () => {
    const year2Second = course("year2-second", "B202");
    const year1Second = course("year1-second", "A102");
    const year1FirstLater = course("year1-first-later", "B101");
    const year1FirstEarlier = course("year1-first-earlier", "A101");
    const sameSortLaterCode = course("same-sort-later-code", "C101");
    const unplaced = course("unplaced", "ZZZ999");

    const rows = buildCourseSpecRows({
      courses: [
        unplaced,
        year2Second,
        sameSortLaterCode,
        year1Second,
        year1FirstLater,
        year1FirstEarlier,
      ],
      offerings: [],
      specProgress: [
        progress(unplaced),
        progress(year2Second, placement(2, "Second", 1)),
        progress(sameSortLaterCode, placement(1, "First", 2)),
        progress(year1Second, placement(1, "Second", 1)),
        progress(year1FirstLater, placement(1, "First", 2)),
        progress(year1FirstEarlier, placement(1, "First", 1)),
      ],
      lecturerId,
      filters: allFilters,
    });

    expect(rows.map((row) => row.course.id)).toEqual([
      year1FirstEarlier.id,
      year1FirstLater.id,
      sameSortLaterCode.id,
      year1Second.id,
      year2Second.id,
      unplaced.id,
    ]);
    expect(courseSpecRowGroupLabel(rows.at(-1)!)).toBe("Not in current curriculum");
  });

  test("concrete Offering filters exclude zero-Offering courses and All restores them", () => {
    const responsibleOnly = course("responsible", "RESP202");
    const taught = course("taught", "TAUGHT202");
    const taughtOffering = offering({
      id: "taught-a",
      courseRow: taught,
      primaryLecturerId: lecturerId,
      term: "2026-2027",
      semester: "Second",
      programmeYear: 3,
    });

    const termFiltered = buildCourseSpecRows({
      courses: [responsibleOnly, taught],
      offerings: [taughtOffering],
      specProgress: [
        progress(responsibleOnly, placement(2, "First", 1)),
        progress(taught, placement(3, "Second", 1)),
      ],
      lecturerId,
      filters: {
        ...allFilters,
        term: "2026-2027",
      },
    });

    expect(termFiltered.map((row) => row.course.id)).toEqual([taught.id]);

    const allRows = buildCourseSpecRows({
      courses: [responsibleOnly, taught],
      offerings: [taughtOffering],
      specProgress: [
        progress(responsibleOnly, placement(2, "First", 1)),
        progress(taught, placement(3, "Second", 1)),
      ],
      lecturerId,
      filters: allFilters,
    });

    expect(allRows.map((row) => row.course.id).sort()).toEqual(
      [responsibleOnly.id, taught.id].sort(),
    );
  });

  test("uses the authorized course list as the row boundary", () => {
    const authorized = course("authorized", "AUTH202");
    const stray = course("stray", "STRAY202");

    const rows = buildCourseSpecRows({
      courses: [authorized],
      offerings: [
        offering({
          id: "stray-a",
          courseRow: stray,
          primaryLecturerId: lecturerId,
        }),
      ],
      specProgress: [
        progress(authorized, placement(2, "First", 1)),
        progress(stray, placement(2, "First", 2)),
      ],
      lecturerId,
      filters: allFilters,
    });

    expect(rows.map((row) => row.course.id)).toEqual([authorized.id]);
  });
});
