import { describe, expect, test } from "bun:test";
import {
  assertProgrammeCurriculumMutable,
  assertProgrammeCurriculumRevisionMetadata,
  assertProgrammeCurriculumYearLevel,
  formatProgrammeCurriculumVersion,
} from "./curriculum-domain";

describe("programme curriculum domain invariants", () => {
  test("formats initial 1.0 draft metadata version", () => {
    expect(formatProgrammeCurriculumVersion(1, 0)).toBe("1.0");
  });

  test.each([1, 2, 3, 4])("accepts supported year level %d", (yearLevel) => {
    expect(() => assertProgrammeCurriculumYearLevel(yearLevel)).not.toThrow();
  });

  test.each([0, 5, 1.5, Number.NaN])(
    "rejects unsupported year level %p",
    (yearLevel) => {
      expect(() => assertProgrammeCurriculumYearLevel(yearLevel)).toThrow(
        "Curriculum year level must be an integer between 1 and 4",
      );
    },
  );

  test("Draft remains editable", () => {
    expect(() => assertProgrammeCurriculumMutable("Draft")).not.toThrow();
  });

  test.each(["Approved", "Active", "Superseded"] as const)(
    "%s curriculum versions are immutable",
    (status) => {
      expect(() => assertProgrammeCurriculumMutable(status)).toThrow(
        `Curriculum version is immutable while status is ${status}`,
      );
    },
  );

  test("initial revisions do not require reason or summary", () => {
    expect(() =>
      assertProgrammeCurriculumRevisionMetadata({
        revisionType: "Initial",
        revisionReason: "",
        changeSummary: "",
      }),
    ).not.toThrow();
  });

  test("non-initial revisions require a reason", () => {
    expect(() =>
      assertProgrammeCurriculumRevisionMetadata({
        revisionType: "Minor",
        revisionReason: "  ",
        changeSummary: "Updates elective placement",
      }),
    ).toThrow("Curriculum revision reason is required for non-initial revisions");
  });

  test("non-initial revisions require a change summary", () => {
    expect(() =>
      assertProgrammeCurriculumRevisionMetadata({
        revisionType: "Major",
        revisionReason: "Scheduled programme review",
        changeSummary: "  ",
      }),
    ).toThrow("Curriculum change summary is required for non-initial revisions");
  });

  test("version components are bounded", () => {
    expect(() => formatProgrammeCurriculumVersion(0, 0)).toThrow();
    expect(() => formatProgrammeCurriculumVersion(1, -1)).toThrow();
    expect(() => formatProgrammeCurriculumVersion(1.5, 0)).toThrow();
  });
});
