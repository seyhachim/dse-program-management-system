import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const specClientSource = readFileSync(
  new URL("./spec-client.tsx", import.meta.url),
  "utf8",
);
const reviewSubmitSource = readFileSync(
  new URL("./review-submit-section.tsx", import.meta.url),
  "utf8",
);

describe("Course Specification phone-safe review and submission layout", () => {
  test("uses a touch-safe mobile section picker while preserving desktop tabs", () => {
    expect(specClientSource).toContain("Course Specification section");
    expect(specClientSource).toContain("items={TAB_ITEMS}");
    expect(specClientSource).toContain("data-[size=default]:h-11");
    expect(specClientSource).toContain("shadow-sm md:hidden");
    expect(specClientSource).toContain("shadow-sm md:block");
    expect(specClientSource).toContain("<TabsList");
  });

  test("shows all workflow stages on phones without the desktop wide rail", () => {
    expect(reviewSubmitSource).toContain('className="mt-5 md:hidden"');
    expect(reviewSubmitSource).toContain('aria-current={active ? "step" : undefined}');
    expect(reviewSubmitSource).toContain(
      'className="mt-5 hidden overflow-x-auto pb-1 md:block"',
    );
    expect(reviewSubmitSource).toContain('className="flex min-w-[780px]"');
    expect(reviewSubmitSource).toContain("Step {currentIndex + 1} of {FLOW.length}");
  });

  test("stacks review actions on phones and keeps primary actions touch-safe", () => {
    expect(reviewSubmitSource).toContain(
      'className="grid w-full gap-2 sm:flex sm:w-auto sm:shrink-0 sm:items-center"',
    );
    expect(reviewSubmitSource).toContain("Submit for Review");
    expect(reviewSubmitSource).toContain("Resubmit for Review");
    expect(reviewSubmitSource).toContain("Continue Editing");
    expect(reviewSubmitSource).toContain("h-11 w-full sm:h-9 sm:w-auto");
  });
});
