import { describe, expect, test } from "bun:test";
import { serializeDocumentContent, type QaSarBlock } from "@dse-pms/shared-types";
import { qaSarPlainText } from "./service.ts";

describe("QA SAR rich narrative plain text", () => {
  test("derives trusted plain text while preserving evidence and PMS markers", () => {
    const blocks: QaSarBlock[] = [
      {
        id: "rich-1",
        type: "richText",
        content: serializeDocumentContent({
          type: "doc",
          version: 1,
          content: [
            {
              type: "heading",
              level: 2,
              content: [{ type: "text", text: "Stakeholder feedback" }],
            },
            {
              type: "paragraph",
              align: "justify",
              content: [{ type: "text", text: "The programme analyses survey results annually." }],
            },
          ],
        }),
      },
      { id: "e1", type: "evidenceReference", evidenceId: "evidence-1", label: "Graduate Survey" },
      { id: "p1", type: "pmsData", source: "stakeholderFeedback", label: "Feedback summary" },
    ];

    expect(qaSarPlainText(blocks)).toBe(
      "Stakeholder feedback\nThe programme analyses survey results annually.\n\n[Evidence: Graduate Survey]\n\n[PMS data: Feedback summary]",
    );
  });

  test("keeps legacy text blocks readable", () => {
    const blocks: QaSarBlock[] = [
      { id: "legacy", type: "paragraph", text: "Existing SAR narrative remains readable." },
    ];
    expect(qaSarPlainText(blocks)).toBe("Existing SAR narrative remains readable.");
  });
});
