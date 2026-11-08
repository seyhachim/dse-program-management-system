import { describe, expect, test } from "bun:test";
import { hasScoreReleaseNotice, scoreReleaseNotice } from "./score-release-notice.ts";

describe("safe result-release announcement", () => {
  test("announces availability without listing anyone's marks", () => {
    const notice = scoreReleaseNotice("TSA301", "M1", "Midterm");
    expect(notice.title).toBe("TSA301 · Midterm results available");
    expect(notice.body).toContain("student portal");
    expect(notice.body).toContain("final course survey");
    expect(notice.body).toContain("privately");
    expect(notice.pinned).toBe(false);
    expect(notice.body).not.toContain("80/100");
  });

  test("respects the announcement title length limit", () => {
    expect(scoreReleaseNotice("TSA301", "M1", "A".repeat(500)).title.length).toBeLessThanOrEqual(160);
  });

  test("recognizes an already-published notice but not a draft", () => {
    const title = "TSA301 · Midterm results available";
    expect(hasScoreReleaseNotice([{ title, publishedAt: "2026-11-04T01:00:00Z" }], title)).toBe(true);
    expect(hasScoreReleaseNotice([{ title, publishedAt: null }], title)).toBe(false);
    expect(hasScoreReleaseNotice([], title)).toBe(false);
  });
});
