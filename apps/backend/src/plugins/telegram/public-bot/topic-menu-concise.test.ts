import { describe, expect, test } from "bun:test";
import { MENUS } from "./menu-config.ts";

describe("public Telegram topic menus", () => {
  test("topic menus provide explicit question/action buttons", () => {
    for (const route of [
      "about",
      "admission",
      "curriculum",
      "careers",
      "fees",
      "scholarships",
      "studentLife",
      "facilities",
      "lecturers",
    ] as const) {
      expect(MENUS[route].rows.flat().length).toBeGreaterThan(0);
    }
  });
});
