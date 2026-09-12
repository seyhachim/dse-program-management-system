import { describe, expect, test } from "bun:test";
import {
  canonicalStudentDisplayName,
  normalizeLatinNamePart,
  normalizeStudentProfileNameFields,
} from "./name.ts";

describe("student name normalization", () => {
  test("normalizes uniformly-cased Latin tokens", () => {
    expect(normalizeLatinNamePart("  CHEAT   KIMLY ")).toBe("Cheat Kimly");
    expect(normalizeLatinNamePart("chhoun oudOM")).toBe("Chhoun oudOM");
    expect(normalizeLatinNamePart("o'NEIL")).toBe("O'Neil");
  });

  test("preserves intentional mixed-case spellings", () => {
    expect(normalizeLatinNamePart("MengHeang")).toBe("MengHeang");
    expect(normalizeLatinNamePart("LeangSeang")).toBe("LeangSeang");
  });

  test("derives FamilyName GivenName only when both Latin parts exist", () => {
    expect(
      canonicalStudentDisplayName(
        { latinFamilyName: "CHEAT", latinGivenName: "KIMLY" },
        "source fallback",
      ),
    ).toBe("Cheat Kimly");
    expect(
      canonicalStudentDisplayName(
        { latinFamilyName: "Seng", latinGivenName: null },
        "  Existing   Student  ",
      ),
    ).toBe("Existing Student");
  });

  test("does not transform Khmer profile fields", () => {
    const profile = normalizeStudentProfileNameFields({
      khmerFamilyName: "ជាតិ",
      khmerGivenName: "គឹមលី",
      latinFamilyName: "CHEAT",
      latinGivenName: "KIMLY",
    });
    expect(profile).toEqual({
      khmerFamilyName: "ជាតិ",
      khmerGivenName: "គឹមលី",
      latinFamilyName: "Cheat",
      latinGivenName: "Kimly",
    });
  });
});
