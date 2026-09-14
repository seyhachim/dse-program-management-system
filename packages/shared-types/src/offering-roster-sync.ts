import { z } from "zod";

export const CanonicalRosterSyncInput = z.object({
  sectionId: z.string().uuid("Select a valid cohort section"),
  term: z.string().trim().min(1, "Term is required").max(100),
  programmeYear: z.coerce.number().int().min(1).max(4),
}).strict();
export type CanonicalRosterSyncInput = z.infer<typeof CanonicalRosterSyncInput>;

export const CanonicalRosterSyncApplyInput = CanonicalRosterSyncInput.extend({
  offeringIds: z.array(z.string().uuid()).min(1, "Select at least one course offering to synchronize"),
}).strict();
export type CanonicalRosterSyncApplyInput = z.infer<typeof CanonicalRosterSyncApplyInput>;

export interface CanonicalSectionRosterStudentRef {
  id: string;
  name: string;
  studentId: string | null;
}

export interface CanonicalSectionRosterRef {
  sectionId: string;
  cohortId: string;
  programmeId: string;
  code: string;
  name: string;
  active: boolean;
  students: CanonicalSectionRosterStudentRef[];
}

/** Narrow cross-plugin read contract implemented by the Students plugin. */
export interface StudentsSectionRosterContract {
  getSectionRoster(sectionId: string): Promise<CanonicalSectionRosterRef | null>;
}

export type OfferingRosterSyncState = "synced" | "needs_sync" | "blocked" | "historical";

export interface OfferingRosterSyncItem {
  offeringId: string;
  course: { id: string; code: string; title: string };
  status: "Planned" | "Active" | "Completed";
  term: string;
  programmeYear: number | null;
  sectionCode: string;
  capacity: number;
  currentCount: number;
  canonicalCount: number;
  missingStudents: CanonicalSectionRosterStudentRef[];
  unexpectedExtraStudents: CanonicalSectionRosterStudentRef[];
  state: OfferingRosterSyncState;
  blockedReason: string | null;
}

export interface CanonicalRosterSyncPreview {
  sourceSection: {
    sectionId: string;
    cohortId: string;
    programmeId: string;
    code: string;
    name: string;
    active: boolean;
    studentCount: number;
  };
  term: string;
  programmeYear: number;
  offerings: OfferingRosterSyncItem[];
  canApply: boolean;
  missingEnrollmentCount: number;
  blockedOfferingCount: number;
  historicalOfferingCount: number;
}

export interface CanonicalRosterSyncApplyResult extends CanonicalRosterSyncPreview {
  selectedOfferingIds: string[];
  createdEnrollmentCount: number;
}
