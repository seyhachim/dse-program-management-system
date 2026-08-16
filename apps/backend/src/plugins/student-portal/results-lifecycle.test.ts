import { describe, expect, test } from "bun:test";
import { PortalConflictError } from "./service.ts";
import { assertDraftWritable, publicationReadiness } from "./results-lifecycle.ts";

describe("results lifecycle", () => {
  test("allows draft rows to remain editable", () => {
    expect(() => assertDraftWritable(null)).not.toThrow();
  });

  test("blocks ordinary edits after publication", () => {
    expect(() => assertDraftWritable(new Date("2026-08-16T00:00:00Z"))).toThrow(PortalConflictError);
  });

  test("requires every enrolled student to have a valid draft before publication", () => {
    const readiness = publicationReadiness(
      ["e1", "e2"],
      [{ enrollmentId: "e1", score: 80, maxScore: 100, publishedAt: null }],
    );
    expect(readiness.ready).toBe(false);
    expect(readiness.missingEnrollmentIds).toEqual(["e2"]);
  });

  test("rejects invalid stored marks before publication", () => {
    const readiness = publicationReadiness(
      ["e1"],
      [{ enrollmentId: "e1", score: 101, maxScore: 100, publishedAt: null }],
    );
    expect(readiness.ready).toBe(false);
    expect(readiness.invalidEnrollmentIds).toEqual(["e1"]);
  });

  test("recognizes a complete unpublished assessment as publishable", () => {
    const readiness = publicationReadiness(
      ["e1", "e2"],
      [
        { enrollmentId: "e1", score: 0, maxScore: 100, publishedAt: null },
        { enrollmentId: "e2", score: 100, maxScore: 100, publishedAt: null },
      ],
    );
    expect(readiness).toEqual({
      ready: true,
      missingEnrollmentIds: [],
      invalidEnrollmentIds: [],
      publishedEnrollmentIds: [],
    });
  });
});
