import { describe, expect, test } from "bun:test";
import { shouldApplyEditorHtml } from "./rich-text-editor-state";

describe("rich text editor HTML synchronization", () => {
  test("does not rewrite a focused editor for its own canonicalized parent echo", () => {
    expect(
      shouldApplyEditorHtml({
        currentHtml: "<div>Hello</div>",
        nextHtml: "<p>Hello</p>",
        lastEmittedHtml: "<p>Hello</p>",
        isFocused: true,
      }),
    ).toBe(false);
  });

  test("applies a genuine external value change while focused", () => {
    expect(
      shouldApplyEditorHtml({
        currentHtml: "<div>Hello</div>",
        nextHtml: "<p>Server update</p>",
        lastEmittedHtml: "<p>Hello</p>",
        isFocused: true,
      }),
    ).toBe(true);
  });

  test("allows canonical DOM normalization after focus leaves the editor", () => {
    expect(
      shouldApplyEditorHtml({
        currentHtml: "<div>Hello</div>",
        nextHtml: "<p>Hello</p>",
        lastEmittedHtml: "<p>Hello</p>",
        isFocused: false,
      }),
    ).toBe(true);
  });

  test("skips redundant writes when DOM already matches", () => {
    expect(
      shouldApplyEditorHtml({
        currentHtml: "<p>Hello</p>",
        nextHtml: "<p>Hello</p>",
        lastEmittedHtml: "",
        isFocused: true,
      }),
    ).toBe(false);
  });
});
