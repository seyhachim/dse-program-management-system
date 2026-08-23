import { describe, expect, test } from "bun:test";
import type { StudentHandbookSourcePreview } from "@dse-pms/shared-types";
import { getStudentHandbookUnavailableSourceState } from "./student-handbook-source-state";

describe("student handbook unavailable source state", () => {
  test("returns a friendly curriculum state for an unavailable published source", () => {
    const preview: StudentHandbookSourcePreview = {
      kind: "CURRICULUM_SUMMARY",
      label: "From Curriculum",
      readOnly: true,
      snapshot: false,
      data: {
        unavailable: true,
        message: "No published curriculum is available",
      },
    };

    expect(getStudentHandbookUnavailableSourceState(preview)).toEqual({
      title: "Curriculum unavailable",
      message: "No published curriculum is available",
      explanation: "The handbook can only use published PMS data.",
    });
  });

  test("keeps available source data on the normal preview path", () => {
    const preview: StudentHandbookSourcePreview = {
      kind: "CURRICULUM_SUMMARY",
      label: "From Curriculum",
      readOnly: true,
      snapshot: false,
      data: { totalCourses: 48, totalCredits: 143 },
    };

    expect(getStudentHandbookUnavailableSourceState(preview)).toBeNull();
  });
});
