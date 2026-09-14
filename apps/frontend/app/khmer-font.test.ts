import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const globalsSource = readFileSync(new URL("./globals.css", import.meta.url), "utf8");

describe("Khmer typography", () => {
  test("loads Kantumruy Pro with swap behavior", () => {
    expect(globalsSource).toContain(
      '@import url("https://fonts.googleapis.com/css2?family=Kantumruy+Pro:wght@100..700&display=swap");',
    );
  });

  test("uses Kantumruy Pro only for Khmer language content with the existing UI font as fallback", () => {
    expect(globalsSource).toContain(
      '--font-khmer: "Kantumruy Pro", var(--font-sans);',
    );
    expect(globalsSource).toContain(":lang(km) {");
    expect(globalsSource).toContain("font-family: var(--font-khmer);");
    expect(globalsSource).toContain("font-family: var(--font-sans);");
  });
});
