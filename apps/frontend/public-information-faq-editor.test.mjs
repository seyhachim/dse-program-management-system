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
    const normalizedSource = source.replace(/\s+/g, " ");

    expect(normalizedSource).toContain("Important / Show in Telegram");
    expect(normalizedSource).toContain(
      "Published + Important appears as a Telegram menu choice.",
    );
    expect(normalizedSource).toContain(
      "Published without Important stays searchable in Ask DSE but is hidden from visible Telegram question lists.",
    );
    expect(normalizedSource).toContain("Draft / Unpublished is never public.");
    expect(normalizedSource).not.toContain("Feature this FAQ");
  });
});
