import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

async function readPublicInformationClient() {
  return readFile(
    join(
      here,
      "app",
      "(shell)",
      "public-information",
      "public-information-client.tsx",
    ),
    "utf8",
  );
}

describe("Public Information FAQ editor UX", () => {
  test("uses a wider responsive FAQ dialog", async () => {
    const source = await readPublicInformationClient();

    expect(source).toContain(
      'className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-6xl overflow-y-auto"',
    );
  });

  test("explains the existing Featured flag as Telegram visibility", async () => {
    const source = await readPublicInformationClient();

    expect(source).toContain("Important / Show in Telegram");
    expect(source).toContain(
      "Published + Important appears as a Telegram menu choice.",
    );
    expect(source).toContain(
      "Published without Important stays searchable in Ask DSE but is hidden from visible Telegram question lists.",
    );
    expect(source).toContain("Draft / Unpublished is never public.");
    expect(source).not.toContain("Feature this FAQ");
  });
});
