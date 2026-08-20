import { describe, expect, test } from "bun:test";
import {
  CONSTRUCTIVE_ALIGNMENT_REQUIRED_ERROR,
  isConstructiveAlignmentReady,
} from "./course-spec-alignment-readiness";

const clo = (code: string, status: "active" | "inactive" = "active") => ({
  code,
  status,
});
const week = (...cloCodes: string[]) => ({ cloCodes });
const assessment = (
  status: "active" | "inactive",
  ...cloCodes: string[]
) => ({ status, cloCodes });

describe("Constructive Alignment submission readiness", () => {
  test("requires every active CLO to be taught and actively assessed", () => {
    const clos = [clo("CLO1"), clo("CLO2")];

    expect(
      isConstructiveAlignmentReady(
        clos,
        [week("CLO1", "CLO2")],
        [assessment("active", "CLO1", "CLO2")],
      ),
    ).toBe(true);

    expect(
      isConstructiveAlignmentReady(
        clos,
        [week("CLO1", "CLO2")],
        [assessment("active", "CLO1")],
      ),
    ).toBe(false);

    expect(
      isConstructiveAlignmentReady(
        clos,
        [week("CLO1")],
        [assessment("active", "CLO1", "CLO2")],
      ),
    ).toBe(false);
  });

  test("rejects a CLO with neither teaching nor assessment coverage", () => {
    expect(
      isConstructiveAlignmentReady([clo("CLO1")], [], []),
    ).toBe(false);
  });

  test("ignores inactive CLOs but inactive assessments do not satisfy coverage", () => {
    expect(
      isConstructiveAlignmentReady(
        [clo("CLO1"), clo("CLO2", "inactive")],
        [week("CLO1")],
        [assessment("active", "CLO1")],
      ),
    ).toBe(true);

    expect(
      isConstructiveAlignmentReady(
        [clo("CLO1")],
        [week("CLO1")],
        [assessment("inactive", "CLO1")],
      ),
    ).toBe(false);
  });

  test("requires at least one active CLO", () => {
    expect(isConstructiveAlignmentReady([], [], [])).toBe(false);
    expect(
      isConstructiveAlignmentReady(
        [clo("CLO1", "inactive")],
        [week("CLO1")],
        [assessment("active", "CLO1")],
      ),
    ).toBe(false);
  });

  test("keeps the API validation message stable", () => {
    expect(CONSTRUCTIVE_ALIGNMENT_REQUIRED_ERROR).toBe(
      "Course specification is incomplete: Constructive Alignment requires every active CLO to be taught and assessed before submission",
    );
  });
});
