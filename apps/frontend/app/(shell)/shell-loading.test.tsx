import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ShellLoadingFrame } from "./shell-loading";

describe("ShellLoadingFrame", () => {
  test("renders accessible neutral chrome without protected navigation labels", () => {
    const html = renderToStaticMarkup(<ShellLoadingFrame />);
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Checking your secure DSE-PMS session");
    for (const protectedLabel of ["Students", "Courses", "Offerings", "Lecturers", "AUN-QA"]) {
      expect(html).not.toContain(protectedLabel);
    }
  });
});
