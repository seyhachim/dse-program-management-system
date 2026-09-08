import { describe, expect, test } from "bun:test";
import {
  MAIN_REPLY_KEYBOARD,
  MENUS,
  ROUTE_CALLBACKS,
  TELEGRAM_CALLBACK_MAX_BYTES,
  buildCourseCallback,
  buildLecturerCallback,
  callbackByteLength,
  getMenuKeyboard,
  getParentRoute,
  parseCallbackData,
  routeForReplyText,
} from "./index.ts";
import type { CallbackButton, RouteKey } from "./menu-types.ts";

function callbackButtons(route: RouteKey): CallbackButton[] {
  return getMenuKeyboard(route)
    .flat()
    .filter((button): button is CallbackButton => button.type === "callback");
}

describe("public Telegram typed menu configuration", () => {
  test("persistent reply keyboard contains only global navigation utilities", () => {
    expect(MAIN_REPLY_KEYBOARD.flat().map((button) => button.text)).toEqual([
      "🏠 Home",
      "❓ Ask DSE",
    ]);
  });

  test("reply labels are unique and resolve deterministically to routes", () => {
    const buttons = MAIN_REPLY_KEYBOARD.flat();
    expect(new Set(buttons.map((button) => button.text)).size).toBe(buttons.length);
    for (const button of buttons) {
      expect(routeForReplyText(button.text)).toBe(button.route);
    }
    expect(routeForReplyText("Unknown reply")).toBeNull();
  });

  test("Home remains the primary top-level content navigation", () => {
    expect(MENUS.home.rows.flat().map((button) => button.text)).toEqual([
      "🚀 Explore DSE",
      "📝 Admission",
      "📚 Study & Curriculum",
      "💼 Careers",
      "💰 Fees & Scholarships",
      "❓ Ask DSE",
      "☰ More",
    ]);
  });

  test("Explore choices route directly to canonical answers without intermediate step menus", () => {
    expect(MENUS.explore.rows.flat().map((button) => button.callbackData)).toEqual([
      "about:what_is_dse",
      "curriculum:overview",
      "careers:jobs",
      "fit:start",
      "admission:how_to_apply",
    ]);
    expect(
      MENUS.explore.rows
        .flat()
        .some((button) => button.callbackData.startsWith("explore:step:")),
    ).toBe(false);
  });

  test("curriculum and careers keep compact mobile menus", () => {
    expect(MENUS.curriculum.rows.length).toBeLessThanOrEqual(5);
    expect(MENUS.careers.rows.length).toBeLessThanOrEqual(5);
    expect(MENUS.curriculum.rows.flat().map((button) => button.text)).toContain(
      "All courses",
    );
    expect(MENUS.careers.rows.flat().map((button) => button.text)).toContain(
      "Career explorer",
    );
  });

  test("Important Dates and Contact render content first with only Back/Home controls", () => {
    expect(getMenuKeyboard("dates").flat().map((button) => button.text)).toEqual([
      "← Back",
      "🏠 Home",
    ]);
    expect(getMenuKeyboard("contact").flat().map((button) => button.text)).toEqual([
      "← Back",
      "🏠 Home",
    ]);
  });

  test("More exposes only the approved shortcuts and keeps Back/Home navigation", () => {
    const labels = getMenuKeyboard("more").flat().map((button) => button.text);

    expect(labels).toEqual([
      "🎓 About DSE",
      "📅 Important Dates",
      "📍 Contact Us",
      "← Back",
      "🏠 Home",
    ]);
    expect(labels).not.toContain("🏫 Student Life");
    expect(labels).not.toContain("🧪 Labs & Facilities");
    expect(labels).not.toContain("👩‍🏫 Lecturers");
  });

  test("every non-home route has a valid logical parent and Home navigation", () => {
    const routes = Object.keys(MENUS) as RouteKey[];
    for (const route of routes) {
      if (route === "home") continue;
      const parent = getParentRoute(route);
      expect(parent).not.toBeNull();
      expect(parent && MENUS[parent]).toBeDefined();

      const navigation = callbackButtons(route);
      expect(navigation.some((button) => button.callbackData === ROUTE_CALLBACKS.home)).toBe(true);
      expect(
        navigation.some((button) => button.callbackData === ROUTE_CALLBACKS[parent!]),
      ).toBe(true);
    }
  });

  test("Home does not add redundant Back or Home navigation buttons", () => {
    const homeLabels = getMenuKeyboard("home").flat().map((button) => button.text);
    expect(homeLabels).not.toContain("← Back");
    expect(homeLabels).not.toContain("🏠 Home");
  });

  test("all configured callbacks parse and stay within Telegram's 64-byte limit", () => {
    const routes = Object.keys(MENUS) as RouteKey[];
    for (const route of routes) {
      for (const button of callbackButtons(route)) {
        expect(callbackByteLength(button.callbackData)).toBeLessThanOrEqual(
          TELEGRAM_CALLBACK_MAX_BYTES,
        );
        expect(parseCallbackData(button.callbackData)).not.toBeNull();
      }
    }
  });

  test("dynamic course callbacks normalize safely and parse as course callbacks", () => {
    const callback = buildCourseCallback(" tsa301 ");
    expect(callback).toBe("course:TSA301");
    expect(parseCallbackData(callback)).toEqual({
      kind: "course",
      code: "TSA301",
      data: "course:TSA301",
    });
  });

  test("dynamic lecturer callbacks normalize slugs and preserve typed action", () => {
    const callback = buildLecturerCallback(" Seyha-Chim ", "research");
    expect(callback).toBe("lecturer:seyha-chim:research");
    expect(parseCallbackData(callback)).toEqual({
      kind: "lecturer",
      slug: "seyha-chim",
      action: "research",
      data: "lecturer:seyha-chim:research",
    });
  });

  test("invalid, malformed, and oversized callbacks fail validation", () => {
    expect(parseCallbackData("unknown:callback")).toBeNull();
    expect(parseCallbackData("course:tsa301")).toBeNull();
    expect(parseCallbackData("lecturer:Seyha:research")).toBeNull();
    expect(parseCallbackData("lecturer:seyha-chim:private")).toBeNull();
    expect(parseCallbackData(`course:${"A".repeat(80)}`)).toBeNull();
    expect(() => buildCourseCallback("bad course code")).toThrow();
    expect(() => buildLecturerCallback("Bad_Slug", "courses")).toThrow();
  });

  test("Explore journey Back navigation follows the logical previous step", () => {
    expect(getParentRoute("explore.step1")).toBe("explore");
    expect(getParentRoute("explore.step2")).toBe("explore.step1");
    expect(getParentRoute("explore.step3")).toBe("explore.step2");
    expect(getParentRoute("explore.step4")).toBe("explore.step3");
    expect(getParentRoute("explore.step5")).toBe("explore.step4");
  });

  test("navigation config contains no programme answer content or external URLs", () => {
    for (const menu of Object.values(MENUS)) {
      expect("description" in menu).toBe(false);
      for (const button of menu.rows.flat()) {
        expect(button.type).toBe("callback");
      }
    }
  });
});
