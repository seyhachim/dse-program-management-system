import { describe, expect, test } from "bun:test";
import type { PublicProgrammeFaq } from "@dse-pms/shared-types";
import {
  chooseAskDseResult,
  normalizePublicSearchText,
} from "./public-programme-search-service.ts";
import { translatedOrEnglish } from "./public-programme-read-service.ts";

const khmerFaq: PublicProgrammeFaq & { keywords?: string[] } = {
  slug: "admission-requirements",
  category: "Admission",
  question: "តើលក្ខខណ្ឌចូលរៀនមានអ្វីខ្លះ?",
  answer: "បេក្ខជនត្រូវបំពេញលក្ខខណ្ឌចូលរៀនរបស់កម្មវិធី DSE។",
  shortAnswer: "សូមពិនិត្យលក្ខខណ្ឌចូលរៀន DSE។",
  keywords: ["ចូលរៀន", "លក្ខខណ្ឌ", "បេក្ខជន"],
  isFeatured: true,
  sourceLabel: null,
  sourceUrl: null,
};

const khmerApplicationFaq: PublicProgrammeFaq & { keywords?: string[] } = {
  slug: "how-to-apply",
  category: "Admission",
  question: "តើខ្ញុំអាចដាក់ពាក្យចូលរៀន DSE បានដោយរបៀបណា?",
  answer: "បេក្ខជនអាចដាក់ពាក្យចូលរៀនតាមដំណើរការដែលកម្មវិធី DSE បានផ្សព្វផ្សាយ។",
  shortAnswer: "សូមអនុវត្តតាមដំណើរការដាក់ពាក្យ DSE។",
  keywords: ["ចូលរៀន", "បេក្ខជន", "ដាក់ពាក្យ"],
  isFeatured: true,
  sourceLabel: null,
  sourceUrl: null,
};

describe("bilingual public programme content", () => {
  test("keeps Khmer letters during deterministic normalization", () => {
    expect(normalizePublicSearchText("តើ ចូលរៀន DSE ដូចម្តេច?")).toContain(
      "ចូលរៀន",
    );
  });

  test("returns a strong Khmer Ask DSE answer", () => {
    const result = chooseAskDseResult("តើលក្ខខណ្ឌចូលរៀនមានអ្វីខ្លះ?", [
      khmerFaq,
    ]);
    expect(result.kind).toBe("answer");
  });

  test("returns Khmer suggestions when multiple published FAQs are similarly relevant", () => {
    const result = chooseAskDseResult("បេក្ខជន ចូលរៀន", [
      khmerFaq,
      khmerApplicationFaq,
    ]);
    expect(result.kind).toBe("suggestions");
    if (result.kind === "suggestions") {
      expect(result.suggestions).toHaveLength(2);
    }
  });

  test("uses Khmer keywords for a deterministic match", () => {
    const result = chooseAskDseResult("បេក្ខជន ចូលរៀន", [khmerFaq]);
    expect(result.kind).not.toBe("none");
  });

  test("returns none for unrelated Khmer text", () => {
    expect(chooseAskDseResult("អាកាសធាតុថ្ងៃនេះ", [khmerFaq]).kind).toBe(
      "none",
    );
  });

  test("falls back to English when Khmer translation is missing", () => {
    expect(translatedOrEnglish(null, "English fallback", "km")).toBe(
      "English fallback",
    );
    expect(translatedOrEnglish("  ខ្មែរ  ", "English fallback", "km")).toBe(
      "ខ្មែរ",
    );
    expect(translatedOrEnglish("ខ្មែរ", "English fallback", "en")).toBe(
      "English fallback",
    );
  });
});
