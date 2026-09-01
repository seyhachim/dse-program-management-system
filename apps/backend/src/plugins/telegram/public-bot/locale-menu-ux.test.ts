import { describe, expect, test } from "bun:test";
import { localizeBotText } from "./locale.ts";

describe("public Telegram compact menu localization", () => {
  test("localizes category headings and the compact menu prompt to Khmer", () => {
    expect(localizeBotText("About DSE\n\nChoose an option below.", "km")).toBe(
      "អំពី DSE\n\nសូមជ្រើសរើសជម្រើសខាងក្រោម។",
    );
    expect(
      localizeBotText("Study & Curriculum\n\nChoose an option below.", "km"),
    ).toBe(
      "ការសិក្សា និងកម្មវិធីសិក្សា\n\nសូមជ្រើសរើសជម្រើសខាងក្រោម។",
    );
  });

  test("localizes compact question-list guidance without changing question content", () => {
    const localized = localizeBotText(
      "Popular Questions\n\n• តើ DSE ជាអ្វី?\n\nType one of these questions directly, or choose a topic below.",
      "km",
    );

    expect(localized).toContain("សំណួរពេញនិយម");
    expect(localized).toContain("• តើ DSE ជាអ្វី?");
    expect(localized).toContain(
      "សូមវាយសំណួរមួយក្នុងចំណោមសំណួរទាំងនេះដោយផ្ទាល់ ឬជ្រើសប្រធានបទខាងក្រោម។",
    );
  });
});
