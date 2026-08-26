import { describe, expect, test } from "bun:test";
import {
  EMPTY_DSE_DOCUMENT,
  QaSarBookNarrativeSectionViewSchema,
  SaveQaSarBookSectionSchema,
  findQaSarBookStaticSection,
  serializeDocumentContent,
} from "./index.ts";

describe("SAR book authoring contracts", () => {
  const content = serializeDocumentContent(EMPTY_DSE_DOCUMENT);

  test("accepts shared DSE document content for editable book sections", () => {
    expect(SaveQaSarBookSectionSchema.parse({ programmeId: "dse", content })).toEqual({
      programmeId: "dse",
      content,
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
        updatedByName: null,
        updatedAt: null,
      }),
    ).toBeTruthy();
  });

  test("rejects untrusted plain strings as rich content", () => {
    expect(() => SaveQaSarBookSectionSchema.parse({ programmeId: "dse", content: "plain text" })).toThrow();
  });

  test("resolves only canonical static book section keys", () => {
    expect(findQaSarBookStaticSection("part1.executive-summary")?.title).toBe("Executive Summary");
    expect(findQaSarBookStaticSection("part4.supporting-documents")?.source).toBe("structured");
    expect(findQaSarBookStaticSection("part2.1.1")).toBeNull();
  });
});
