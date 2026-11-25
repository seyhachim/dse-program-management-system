import { z } from "zod";
import type { AnnualSummary, AnnualEvidenceAttribution } from "@dse-pms/shared-types";
import { annualEvidenceAttribution } from "./annual-attribution.ts";

const id = z.string().trim().min(1).max(128);
const source = z.object({
  row: z.string().trim().min(1).max(200),
  evidenceUrl: z.string().url().refine(v => /^https?:\/\//i.test(v)),
}).strict();

export const historicalAnnualSourceSchema = z.object({
  schemaVersion: z.literal(1),
  programmeId: z.literal("dse"),
  academicYearId: id,
  academicYearLabel: z.string().trim().min(1).max(100),
  staff: z.array(source.extend({
    lecturerId: id,
    employmentType: z.enum(["full_time", "part_time", "other"]),
    qualification: z.string().trim().min(1).max(500),
  }).strict()).max(5000),
  teaching: z.array(source.extend({
    lecturerId: id,
    offeringId: id,
    verdict: z.enum(["confirmed", "not_delivered"]),
  }).strict()).max(10000),
}).strict();

export type HistoricalAnnualSource = z.infer<typeof historicalAnnualSourceSchema>;
export type HistoricalOffering = {
  id: string; term: string; calendarYearId: string | null;
  startDate: string | null; endDate: string | null;
};
export type HistoricalPortfolioItem = {
  id: string; lecturerId: string; startDate: string | null; endDate: string | null;
  verificationStatus: "SelfDeclared" | "Verified" | "Rejected";
};
type Decision = "candidate_for_review" | "already_recorded" | "conflict" | "duplicate" | "unmatched" | "window_missing";
type SourceResult = { row: string; lecturerId: string; offeringId?: string; decision: Decision; reason: string };
const normalize = (value: string) => value.replace(/[–—]/g, "-").trim();
const duplicateKeys = <T>(rows: readonly T[], key: (row: T) => string) => {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(key(row), (counts.get(key(row)) ?? 0) + 1);
  return new Set([...counts].filter(([, count]) => count > 1).map(([k]) => k));
};
const pair = (lecturerId: string, offeringId: string) => JSON.stringify([lecturerId, offeringId]);

/** Pure, non-mutating reconciliation. Results are review candidates, not approvals. */
export function reconcileHistoricalAnnual(
  input: HistoricalAnnualSource,
  summary: AnnualSummary,
  offerings: readonly HistoricalOffering[],
  portfolio: readonly HistoricalPortfolioItem[],
) {
  if (input.academicYearId !== summary.academicYear.id || input.academicYearLabel !== summary.academicYear.label) {
    throw new Error("Historical source does not match the selected academic year");
  }
  const staffById = new Map(summary.staff.map(person => [person.lecturerId, person]));
  const offeringById = new Map(offerings.map(offering => [offering.id, offering]));
  const staffDuplicates = duplicateKeys(input.staff, row => row.lecturerId);
  const teachingDuplicates = duplicateKeys(input.teaching, row => pair(row.lecturerId, row.offeringId));
  const sourceDuplicates = duplicateKeys([...input.staff, ...input.teaching], row => row.row);
  const window = summary.reportingWindow;
  const staff: SourceResult[] = input.staff.map(row => {
    const result = (decision: Decision, reason: string): SourceResult =>
      ({ row: row.row, lecturerId: row.lecturerId, decision, reason });
    if (staffDuplicates.has(row.lecturerId) || sourceDuplicates.has(row.row)) return result("duplicate", "Repeated lecturer or source row; reconcile manually");
    const person = staffById.get(row.lecturerId);
    if (!person) return result("unmatched", "No lecturer in the selected annual projection; confirm identity and programme");
    if (person.staffSnapshotStatus === "verified") {
      return person.employmentType === row.employmentType && person.qualification === row.qualification
        ? result("already_recorded", "Existing annual staff snapshot agrees")
        : result("conflict", "Existing annual staff snapshot differs; never overwrite");
    }
    if (!window) return result("window_missing", "Configure official reporting dates first");
    return result("candidate_for_review", "Historical HR claim needs independent coordinator verification");
  });
  const teaching: SourceResult[] = input.teaching.map(row => {
    const result = (decision: Decision, reason: string): SourceResult =>
      ({ row: row.row, lecturerId: row.lecturerId, offeringId: row.offeringId, decision, reason });
    if (teachingDuplicates.has(pair(row.lecturerId, row.offeringId)) || sourceDuplicates.has(row.row)) return result("duplicate", "Repeated lecturer/offering or source row; reconcile manually");
    const person = staffById.get(row.lecturerId);
    const offering = offeringById.get(row.offeringId);
    if (!person || !offering) return result("unmatched", "No matching DSE lecturer or offering; verify source identifiers");
    const record = person.teaching.find(t => t.offeringId === row.offeringId);
    if (!record) return result("conflict", "No matching annual assignment/delivery; confirm year and source assignment");
    if (offering.calendarYearId && offering.calendarYearId !== summary.academicYear.id) return result("conflict", "Offering has a different canonical academic year");
    if (record.discrepancy || (row.verdict === "not_delivered" && record.deliveredSessions > 0)) return result("conflict", "Recorded delivery contradicts claim or review; resolve canonical evidence");
    if (record.verdict !== null) return record.verdict === row.verdict
      ? result("already_recorded", "Existing annual teaching review agrees")
      : result("conflict", "Existing teaching review differs; never overwrite");
    if (row.verdict === "confirmed" && record.deliveredSessions > 0) return result("already_recorded", "Authoritative delivery already recorded");
    if (!window) return result("window_missing", "Configure official reporting dates first");
    return result("candidate_for_review", "Source claim requires independent verification; assignment alone is not delivery");
  });
  // An unbound term without explicit year is a review inventory, not a claim that
  // the offering belongs to this year. Date overlap is only a hint.
  const legacyOfferings = offerings.filter(o => o.calendarYearId === null).map(o => {
    const explicitLabel = normalize(o.term).includes(normalize(summary.academicYear.label));
    const overlaps = Boolean(window && o.startDate && o.endDate &&
      o.startDate <= window.endDate && o.endDate >= window.startDate);
    return { offeringId: o.id, explicitLabel, overlaps, status: explicitLabel
      ? "legacy_label_match_review" : overlaps ? "ambiguous_overlapping_dates" : "unbound_year_unresolved" };
  });
  const evidence = portfolio.filter(item => staffById.has(item.lecturerId)).flatMap(item => {
    const person = staffById.get(item.lecturerId)!;
    if (person.evidence.some(e => e.id === item.id)) return [];
    const attribution: AnnualEvidenceAttribution = annualEvidenceAttribution(window, item.startDate, item.endDate);
    const decision = item.verificationStatus === "Rejected" ? "excluded_rejected"
      : attribution !== "in_period" ? attribution
      : item.verificationStatus === "Verified" ? "candidate_for_owner_link" : "needs_evidence_review";
    return [{ lecturerId: item.lecturerId, itemId: item.id, attribution, decision }];
  });
  const gaps = summary.staff.map(person => ({
    lecturerId: person.lecturerId,
    submissionStatus: person.submissionStatus,
    missingStaffSnapshot: person.staffSnapshotStatus === "missing",
    unresolvedOfferingIds: person.teaching.filter(t => t.discrepancy || (!t.confirmed && t.verdict === null)).map(t => t.offeringId),
  }));
  return {
    schemaVersion: 1 as const, mode: "dry-run" as const, programmeId: "dse" as const,
    academicYearId: summary.academicYear.id, academicYearLabel: summary.academicYear.label,
    windowConfigured: Boolean(window), sourceCounts: { staff: input.staff.length, teaching: input.teaching.length },
    staff, teaching, legacyOfferings, evidence, gaps,
    notes: ["No changes applied. Candidates are not verification or approval.",
      "Missing submissions are not zero achievements. No identity or year is inferred from names or current employment.",
      "Use existing authorized review workflows and owner evidence links after independent source review."],
  };
}
