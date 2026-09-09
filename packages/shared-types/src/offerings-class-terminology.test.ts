import { expect, test } from "bun:test";
import { SectionCodeSchema } from "./offerings.ts";

function firstMessage(value: string): string | undefined {
  const result = SectionCodeSchema.safeParse(value);
  return result.success ? undefined : result.error.issues[0]?.message;
}

test("offering class validation uses Class terminology", () => {
  expect(firstMessage("")).toBe("Class is required");
  expect(firstMessage("ABCDEFGHIJKLM")).toBe("Class must be 12 characters or fewer");
});

test("offering class code remains normalized and backward compatible", () => {
  expect(SectionCodeSchema.parse(" b-2 ")).toBe("B-2");
});
