import { describe, expect, test } from "bun:test";
import {
  courseInfoSnapshotFromDocument,
  courseInfoSnapshotWarnings,
  type CourseInfoImportDocument,
} from "./course-spec-import-course-info.ts";

const PAN202: CourseInfoImportDocument = {
  source: { yearFolder: 2, semesterFolder: 2 },
  course: {
    programmeTitle: "Bachelor of Engineering in Data Science and Engineering",
    code: "PAN202",
    title: "Predictive Analytics",
    credits: { total: 3 },
    prerequisites: "Math I–III; Statistics I–II",
    courseType: "Core",
    // Mirrors the real regression fixture: extraction metadata disagrees with
    // the folder placement. We preserve the conflict as evidence and choose the
    // importer placement context deterministically.
    availability: { semester: 1, year: 2 },
    description: "Predictive analytics course",
  },
  lecturers: {
    primary: {
      name: "Chim Seyha",
      qualification: "Master’s degree in computer science",
      email: "chim.seyha@rupp.edu.kh",
      phone: "096 5321 532",
    },
    coLecturers: [],
  },
};

describe("course-spec import Course Information snapshot", () => {
  test("captures document values and source placement as an immutable snapshot", () => {
    const snapshot = courseInfoSnapshotFromDocument(PAN202, 120);

    expect(snapshot).toMatchObject({
      programmeTitle: "Bachelor of Engineering in Data Science and Engineering",
      courseTitle: "Predictive Analytics",
      courseCode: "PAN202",
      credits: 3,
      courseType: "Core",
      totalSltHours: 120,
      instructorName: "Chim Seyha",
      qualification: "Master’s degree in computer science",
      email: "chim.seyha@rupp.edu.kh",
      telephone: "096 5321 532",
      semester: "Second",
      programmeYear: 2,
    });

    const changedSource = structuredClone(PAN202);
    changedSource.course.title = "Changed after import";
    changedSource.lecturers.primary.name = "Changed lecturer";

    expect(snapshot.courseTitle).toBe("Predictive Analytics");
    expect(snapshot.instructorName).toBe("Chim Seyha");
  });

  test("surfaces conflicting semester metadata instead of silently hiding it", () => {
    expect(courseInfoSnapshotWarnings(PAN202)).toEqual([
      "Semester metadata conflict: source folder=2, extracted document=1; Course Information snapshot uses source folder",
    ]);
  });
});
