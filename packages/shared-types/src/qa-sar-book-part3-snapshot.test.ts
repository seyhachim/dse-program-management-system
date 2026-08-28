import { describe, expect, test } from "bun:test";
import { QaSarBookPart3SnapshotSchema } from "./qa-sar-book-part3-snapshot.ts";

const uuid = {
  cycle: "11111111-1111-4111-8111-111111111111",
  criterionRevision: "22222222-2222-4222-8222-222222222222",
  requirementRevision: "33333333-3333-4333-8333-333333333333",
  user: "44444444-4444-4444-8444-444444444444",
};

describe("SAR book Part 3 snapshot", () => {
  test("pins exact human rating revisions without an overall verdict", () => {
    const snapshot = QaSarBookPart3SnapshotSchema.parse({
      programmeId: "dse",
      cycleId: uuid.cycle,
      capturedAt: new Date().toISOString(),
      note: "Human self-assessment only — ratings are not external assessor scores or an accreditation verdict.",
      criteria: [
        {
          criterionId: "criterion-1",
          criterionCode: "1",
          criterionTitle: "Expected Learning Outcomes",
          rating: 5,
          opinion: "Explicit criterion-level opinion entered by the SAR team.",
          evidence: [],
          enteredBy: { id: uuid.user, name: "SAR Reviewer" },
          updatedAt: new Date().toISOString(),
          revisionId: uuid.criterionRevision,
          revisionNumber: 2,
          requirements: [
            {
              requirementId: "requirement-1-1",
              requirementCode: "1.1",
              requirementTitle: "Programme learning outcomes",
              rating: 4,
              justification: "Explicit human judgement retained with exact revision lineage.",
              evidence: [],
              enteredBy: { id: uuid.user, name: "SAR Reviewer" },
              updatedAt: new Date().toISOString(),
              revisionId: uuid.requirementRevision,
              revisionNumber: 3,
            },
          ],
        },
      ],
      associations: [],
      improvementActions: [],
    });

    expect(snapshot.criteria[0]?.revisionId).toBe(uuid.criterionRevision);
    expect(snapshot.criteria[0]?.requirements[0]?.revisionId).toBe(uuid.requirementRevision);
    expect(snapshot.criteria[0]?.requirements[0]?.revisionNumber).toBe(3);
    expect("overallRating" in snapshot).toBe(false);
    expect("accreditationVerdict" in snapshot).toBe(false);
  });
});
