import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const modalSource = readFileSync(
  new URL("./week-form-modal.tsx", import.meta.url),
  "utf8",
);

describe("Weekly Plan wizard phone-safe footer", () => {
  test("stacks footer regions on phones and restores the desktop row", () => {
    expect(modalSource).toContain(
      'className="flex flex-col gap-3 border-t border-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"',
    );
    expect(modalSource).toContain(
      'className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:items-center"',
    );
  });

  test("keeps local-draft status from consuming the phone navigation row", () => {
    expect(modalSource).toContain("Draft saved on this device");
    expect(modalSource).toContain("basis-full min-w-0");
    expect(modalSource).toContain("sm:basis-auto");
    expect(modalSource).toContain("break-words");
  });

  test("keeps every wizard action visible and touch-safe", () => {
    expect(modalSource).toContain(">Cancel</Button>");
    expect(modalSource).toContain(">Previous</Button>");
    expect(modalSource).toContain(">Next</Button>");
    expect(modalSource).toContain('"Save Week"');
    expect(modalSource).toContain("h-11 w-full");
    expect(modalSource).toContain("col-span-2");
    expect(modalSource).toContain("sm:col-span-1");
  });
});
