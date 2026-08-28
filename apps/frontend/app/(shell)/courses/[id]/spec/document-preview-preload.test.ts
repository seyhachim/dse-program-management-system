import { describe, expect, test } from "bun:test";

const editablePath = new URL("./spec-client.tsx", import.meta.url);
const readOnlyPath = new URL("./read-only-spec-client.tsx", import.meta.url);

describe("Course Specification Document Preview preload", () => {
  test("eager-mounts Document Preview in editable and read-only workspaces", async () => {
    const [editable, readOnly] = await Promise.all([
      Bun.file(editablePath).text(),
      Bun.file(readOnlyPath).text(),
    ]);

    for (const source of [editable, readOnly]) {
      expect(source).toContain(
        '<TabsContent value="documentPreview" className="mt-4" forceMount>',
      );
      expect(source).toContain("<DocumentPreview document={courseDocument} />");
    }
  });
});
