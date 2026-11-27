import { describe, expect, test } from "bun:test";
import type { AnnualSummary, AnnualLecturer, AnnualTeaching } from "@dse-pms/shared-types";
import { historicalAnnualSourceSchema, reconcileHistoricalAnnual, type HistoricalAnnualSource, type HistoricalOffering, type HistoricalPortfolioItem } from "./annual-reconciliation.ts";

const year = { id: "year-a", label: "2025–2026", startYear: 2025, endYear: 2026 };
const window = { startDate: "2025-09-01", endDate: "2026-08-31", evidenceUrl: "https://example.invalid/calendar", reviewedAt: "2026-11-25T00:00:00Z" };
const teaching: AnnualTeaching = { offeringId: "o1", courseCode: "TSA301", courseTitle: "Example",
  term: "2025-2026", sectionCode: "M1", role: "Primary Lecturer", deliveredSessions: 0,
  deliveredSessionIds: [], reviewId: null, verdict: null, evidenceUrl: "", confirmed: false, discrepancy: false };
const person: AnnualLecturer = { lecturerId: "l1", name: "Synthetic", employmentType: null, qualification: null,
  staffSnapshotStatus: "missing", staffReviewEventId: null, classification: "unconfirmed",
  submissionStatus: "unreported", teaching: [teaching], evidence: [], verifiedActivityCount: 0 };
const summary: AnnualSummary = { schemaVersion: "annual-lecturer-v1", academicYear: year,
  generatedAt: "2026-11-25T00:00:00Z", reportingWindow: window, staff: [person],
  statistics: { totalInRegistry: 1, activeTeaching: 0, otherContributors: 0, unconfirmed: 1,
    unreported: 1, distinctPublications: 0, verifiedCpdActivities: 0, evidenceGaps: 1,
    staffSnapshotsMissing: 0, unattributedEvidence: 0 }, releaseVersion: null, notes: [] };
const input: HistoricalAnnualSource = { schemaVersion: 1, programmeId: "dse", academicYearId: year.id,
  academicYearLabel: year.label, staff: [{ row: "HR:2", lecturerId: "l1", employmentType: "part_time",
    qualification: "Master", evidenceUrl: "https://example.invalid/hr" }],
  teaching: [{ row: "Assignments:2", lecturerId: "l1", offeringId: "o1", verdict: "confirmed",
    evidenceUrl: "https://example.invalid/assignment" }] };
const offerings: HistoricalOffering[] = [{ id: "o1", term: "2025-2026", calendarYearId: year.id,
  startDate: null, endDate: null }];
const evidence = (id: string, overrides: Partial<HistoricalPortfolioItem> = {}): HistoricalPortfolioItem =>
  ({ id, lecturerId: "l1", startDate: "2026-02-01", endDate: null, verificationStatus: "Verified", ...overrides });

describe("historical annual reconciliation (#1298)", () => {
  test("valid historical source yields candidates only, no input mutation or source URLs in output", () => {
    const before = JSON.stringify({ input, summary, offerings });
    const report = reconcileHistoricalAnnual(historicalAnnualSourceSchema.parse(input), summary, offerings, []);
    expect(report.mode).toBe("dry-run");
    expect(report.staff[0]?.decision).toBe("candidate_for_review");
    expect(report.teaching[0]?.decision).toBe("candidate_for_review");
    expect(report.gaps[0]?.submissionStatus).toBe("unreported");
    expect(report.gaps[0]?.unresolvedOfferingIds).toEqual(["o1"]);
    expect(JSON.stringify({ input, summary, offerings })).toBe(before);
    expect(JSON.stringify(report)).not.toContain("https://");
  });

  test("duplicates are all blocked, including repeated source references across categories", () => {
    const report = reconcileHistoricalAnnual({ ...input, staff: [...input.staff, { ...input.staff[0]!, row: "HR:3" }],
      teaching: [...input.teaching, { ...input.teaching[0]!, row: "HR:3" }] }, summary, offerings, []);
    expect(report.staff.map(r => r.decision)).toEqual(["duplicate", "duplicate"]);
    expect(report.teaching.map(r => r.decision)).toEqual(["duplicate", "duplicate"]);
  });

  test("verified staff snapshots are never overwritten; existing reviews and delivery are respected", () => {
    const verified = { ...person, staffSnapshotStatus: "verified" as const, employmentType: "full_time",
      qualification: "PhD", teaching: [{ ...teaching, deliveredSessions: 1, confirmed: true }] };
    const existing = { ...summary, staff: [verified] };
    const report = reconcileHistoricalAnnual(input, existing, offerings, []);
    expect(report.staff[0]?.decision).toBe("conflict");
    expect(report.teaching[0]?.decision).toBe("already_recorded");
    const negative = reconcileHistoricalAnnual({ ...input, teaching: [{ ...input.teaching[0]!, verdict: "not_delivered" }] }, existing, offerings, []);
    expect(negative.teaching[0]?.decision).toBe("conflict");
    const matching = reconcileHistoricalAnnual({ ...input, staff: [{ ...input.staff[0]!, employmentType: "full_time", qualification: "PhD" }] }, existing, offerings, []);
    expect(matching.staff[0]?.decision).toBe("already_recorded");
  });

  test("missing window, mismatched year, unmatched identities and assignments fail closed", () => {
    const missing = reconcileHistoricalAnnual(input, { ...summary, reportingWindow: null }, offerings, [evidence("p1")]);
    expect(missing.staff[0]?.decision).toBe("window_missing");
    expect(missing.teaching[0]?.decision).toBe("window_missing");
    expect(missing.evidence[0]?.decision).toBe("period_unconfigured");
    expect(() => reconcileHistoricalAnnual({ ...input, academicYearLabel: "2026–2027" }, summary, offerings, [])).toThrow();
    const mismatch = reconcileHistoricalAnnual(input, summary, [{ ...offerings[0]!, calendarYearId: "other-year" }], []);
    expect(mismatch.teaching[0]?.decision).toBe("conflict");
    const unmatched = reconcileHistoricalAnnual({ ...input, staff: [{ ...input.staff[0]!, lecturerId: "unknown" }] }, summary, [], []);
    expect(unmatched.staff[0]?.decision).toBe("unmatched");
    expect(unmatched.teaching[0]?.decision).toBe("unmatched");
  });

  test("legacy year ambiguity remains inventory, never a confirmed assignment", () => {
    const legacy = [
      { id: "label", term: "2025-2026 S1", calendarYearId: null, startDate: null, endDate: null },
      { id: "overlap", term: "Semester 1", calendarYearId: null, startDate: "2025-10-01", endDate: "2026-02-01" },
      { id: "unknown", term: "Semester 1", calendarYearId: null, startDate: null, endDate: null },
    ];
    const report = reconcileHistoricalAnnual(input, summary, legacy, []);
    expect(report.legacyOfferings.map(o => o.status)).toEqual(["legacy_label_match_review", "ambiguous_overlapping_dates", "unbound_year_unresolved"]);
    expect(report.teaching[0]?.decision).toBe("unmatched");
  });

  test("portfolio attribution excludes rejected, undated, out-of-period and foreign items", () => {
    const report = reconcileHistoricalAnnual(input, summary, offerings, [
      evidence("verified"), evidence("pending", { verificationStatus: "SelfDeclared" }),
      evidence("rejected", { verificationStatus: "Rejected" }), evidence("undated", { startDate: null }),
      evidence("old", { startDate: "2024-01-01" }), evidence("foreign", { lecturerId: "l2" }),
    ]);
    expect(report.evidence.map(e => [e.itemId, e.decision])).toEqual([
      ["verified", "candidate_for_owner_link"], ["pending", "needs_evidence_review"],
      ["rejected", "excluded_rejected"], ["undated", "undated"], ["old", "out_of_period"],
    ]);
  });

  test("strict source schema rejects other programme, commit options and unsafe evidence URL", () => {
    expect(historicalAnnualSourceSchema.safeParse({ ...input, programmeId: "other" }).success).toBe(false);
    expect(historicalAnnualSourceSchema.safeParse({ ...input, commit: true }).success).toBe(false);
    expect(historicalAnnualSourceSchema.safeParse({ ...input, staff: [{ ...input.staff[0]!, evidenceUrl: "file:///private" }] }).success).toBe(false);
  });
});
