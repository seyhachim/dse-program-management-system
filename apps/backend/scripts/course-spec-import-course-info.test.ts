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

function reviewedRelocation(): CourseInfoImportDocument {
  return {
    source: { yearFolder: 1, semesterFolder: 2 },
    reviewedPlacement: {
      year: 1,
      semester: 1,
      reason: "Programme owner approved 2026 curriculum relocation from DSC102 to CCS101",
      approvedBy: "programme-owner",
      approvedAt: "2026-08-25",
      sourceIssue: "#633",
    },
    course: {
      programmeTitle: "Bachelor of Engineering in Data Science and Engineering",
      code: "CCS101",
      title: "Climate Change and Sustainable Development",
      credits: { total: 3 },
      prerequisites: "",
      courseType: "Basic",
      availability: { semester: 1, year: 1 },
      description: "Reviewed relocation fixture",
    },
    lecturers: {
      primary: { name: "Lecturer Example" },
      coLecturers: [],
    },
  };
}

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

  test("uses explicit reviewed placement while preserving legacy source provenance", () => {
    const doc = reviewedRelocation();
    const originalSource = structuredClone(doc.source);

    const snapshot = courseInfoSnapshotFromDocument(doc, 120);
    const warnings = courseInfoSnapshotWarnings(doc);

    expect(snapshot.programmeYear).toBe(1);
    expect(snapshot.semester).toBe("First");
    expect(doc.source).toEqual(originalSource);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("Reviewed placement override applied: Year 1, Semester 1");
    expect(warnings[0]).toContain("legacy source placement remains preserved as provenance");
    expect(warnings[0]).toContain("via #633");
  });

  test("malformed reviewed placement fails closed", () => {
    const doc = reviewedRelocation();
    doc.reviewedPlacement = {
      year: 1,
      semester: 1,
      approvedBy: "programme-owner",
      approvedAt: "2026-08-25",
    };

    expect(() => courseInfoSnapshotWarnings(doc)).toThrow(
      "reviewedPlacement.reason is required",
    );
  });
});
