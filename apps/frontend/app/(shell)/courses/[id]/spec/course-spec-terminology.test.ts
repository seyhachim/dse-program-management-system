import { describe, expect, test } from "bun:test";
import { courseSpecTerminologyForCode } from "./course-spec-terminology";

describe("Course Specification terminology", () => {
  test("uses supervised-project vocabulary for FPR401/FPR402", () => {
    const fpr401 = courseSpecTerminologyForCode("FPR401");
    const fpr402 = courseSpecTerminologyForCode("fpr402");

    expect(fpr401.projectBased).toBe(true);
    expect(fpr401.teachingLearning).toBe("Supervision & Learning");
    expect(fpr401.weeklyPlan).toBe("Milestone Plan");
    expect(fpr401.topic).toBe("Milestone / Focus");
    expect(fpr402.projectBased).toBe(true);
  });

  test("keeps existing taught-course vocabulary for ordinary courses", () => {
    const taught = courseSpecTerminologyForCode("DSS302");

    expect(taught.projectBased).toBe(false);
    expect(taught.teachingLearning).toBe("Teaching & Learning");
    expect(taught.weeklyPlan).toBe("Weekly Plan");
    expect(taught.topic).toBe("Topic");
  });
});
