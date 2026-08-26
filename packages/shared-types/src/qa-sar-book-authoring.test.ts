import { describe, expect, test } from "bun:test";
import {
  EMPTY_DSE_DOCUMENT,
  QaSarBookNarrativeSectionViewSchema,
  QaSarBookSectionAssignmentViewSchema,
  QaSarBookSectionRevisionViewSchema,
  SaveQaSarBookSectionSchema,
  UpsertQaSarBookSectionAssignmentSchema,
  findQaSarBookStaticSection,
  serializeDocumentContent,
} from "./index.ts";

describe("SAR book authoring contracts", () => {
  const content = serializeDocumentContent(EMPTY_DSE_DOCUMENT);
  const revisionId = "11111111-1111-4111-8111-111111111111";
  const assignmentId = "22222222-2222-4222-8222-222222222222";
  const assigneeId = "33333333-3333-4333-8333-333333333333";
  const assignerId = "44444444-4444-4444-8444-444444444444";

  test("accepts shared DSE document content with an optimistic base revision", () => {
    expect(
      SaveQaSarBookSectionSchema.parse({
        programmeId: "dse",
        content,
        baseRevisionId: revisionId,
      }),
    ).toEqual({
      programmeId: "dse",
      content,
      baseRevisionId: revisionId,
    });

    expect(
      SaveQaSarBookSectionSchema.parse({ programmeId: "dse", content, baseRevisionId: null }),
    ).toEqual({ programmeId: "dse", content, baseRevisionId: null });
  });

  test("keeps the optional base revision backward compatible", () => {
    expect(SaveQaSarBookSectionSchema.parse({ programmeId: "dse", content })).toEqual({
      programmeId: "dse",
      content,
    });
  });

  test("validates revision and assignment metadata on a narrative section", () => {
    const assignment = QaSarBookSectionAssignmentViewSchema.parse({
      id: assignmentId,
      programmeId: "dse",
      cycleId: "cycle-1",
      sectionKey: "part1.executive-summary",
      sectionTitle: "Executive Summary",
      assignee: {
        id: assigneeId,
        name: "Contributor A",
        email: "contributor@example.com",
      },
      assignedBy: { id: assignerId, name: "Coordinator" },
      assignedAt: "2026-08-26T08:00:00.000Z",
      endedAt: null,
    });

    expect(
      QaSarBookNarrativeSectionViewSchema.parse({
        cycleId: "cycle-1",
        sectionKey: "part1.executive-summary",
        title: "Executive Summary",
        source: "bookNarrative",
        content,
        plainText: "",
        editable: true,
        updatedByName: "Contributor A",
        updatedAt: "2026-08-26T08:01:00.000Z",
        revisionId,
        revisionNumber: 2,
        assignment,
        recentRevisions: [
          {
            id: revisionId,
            revisionNumber: 2,
            createdBy: { id: assigneeId, name: "Contributor A" },
            createdAt: "2026-08-26T08:01:00.000Z",
          },
        ],
      }),
    ).toBeTruthy();
  });

  test("validates full historical revision content", () => {
    expect(
      QaSarBookSectionRevisionViewSchema.parse({
        id: revisionId,
        programmeId: "dse",
        cycleId: "cycle-1",
        sectionKey: "part1.executive-summary",
        sectionTitle: "Executive Summary",
        revisionNumber: 1,
        content,
        plainText: "",
        createdBy: null,
        createdAt: "2026-08-26T08:00:00.000Z",
      }),
    ).toBeTruthy();
  });

  test("validates distributed section assignment input", () => {
    expect(
      UpsertQaSarBookSectionAssignmentSchema.parse({
        programmeId: "dse",
        assigneeId,
      }),
    ).toEqual({ programmeId: "dse", assigneeId });
  });

  test("rejects untrusted plain strings and malformed revision identifiers", () => {
    expect(() =>
      SaveQaSarBookSectionSchema.parse({ programmeId: "dse", content: "plain text" }),
    ).toThrow();
    expect(() =>
      SaveQaSarBookSectionSchema.parse({
        programmeId: "dse",
        content,
        baseRevisionId: "not-a-revision",
      }),
    ).toThrow();
  });

  test("resolves only canonical static book section keys", () => {
    expect(findQaSarBookStaticSection("part1.executive-summary")?.title).toBe(
      "Executive Summary",
    );
    expect(findQaSarBookStaticSection("part4.supporting-documents")?.source).toBe(
      "structured",
    );
    expect(findQaSarBookStaticSection("part2.1.1")).toBeNull();
  });
});
