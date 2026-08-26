import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import * as React from "react";
import { FormFieldLabel } from "../src/components/form-field-label.tsx";

describe("FormFieldLabel", () => {
  test("shows the required marker only when requested", () => {
    const required = renderToStaticMarkup(React.createElement(FormFieldLabel, { required: true }, "Name"));
    const optional = renderToStaticMarkup(React.createElement(FormFieldLabel, null, "Name"));

    expect(required).toContain("Name");
    expect(required).toContain("*");
    expect(required).toContain("text-error");
    expect(optional).not.toContain("*");
  });

  test("can label explicitly optional fields", () => {
    const html = renderToStaticMarkup(React.createElement(FormFieldLabel, { optional: true }, "Room"));
    expect(html).toContain("(Optional)");
  });
});
