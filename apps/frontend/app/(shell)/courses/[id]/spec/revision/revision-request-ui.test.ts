import { describe, expect, test } from "bun:test";
import type { CourseSpecRevisionImpact } from "@dse-pms/shared-types";
import { revisionRequestUiDecision } from "./revision-request-ui.ts";

const noImpact: CourseSpecRevisionImpact = {
  courseCodeOrTitle: false,
  creditsOrSlt: false,
  prerequisites: false,
  materialCloChanges: false,
  bloomOrCapLevels: false,
  cloPloAlignment: false,
  assessmentStructureOrWeighting: false,
  curriculumOrRegulatoryAlignment: false,
};

describe("revision request workspace decisions", () => {
  test("shows Minor recommendation without override field when no major impact is selected", () => {
    expect(revisionRequestUiDecision(noImpact, "Minor")).toEqual({
      recommendedRevisionType: "Minor",
      showOverrideJustification: false,
    });
  });

  test("shows Major recommendation and override field when proposed Minor conflicts", () => {
    expect(
      revisionRequestUiDecision(
        { ...noImpact, assessmentStructureOrWeighting: true },
        "Minor",
      ),
    ).toEqual({
      recommendedRevisionType: "Major",
      showOverrideJustification: true,
    });
  });

  test("does not show override field when user follows a Major recommendation", () => {
    expect(
      revisionRequestUiDecision(
        { ...noImpact, curriculumOrRegulatoryAlignment: true },
        "Major",
      ),
    ).toEqual({
      recommendedRevisionType: "Major",
      showOverrideJustification: false,
    });
  });
});
