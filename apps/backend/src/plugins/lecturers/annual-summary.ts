import type {
  AnnualEvidence, AnnualLecturer, AnnualSummary, AnnualTeaching, AnnualYear,
} from "@dse-pms/shared-types";

export type AnnualStaffInput = {
  lecturerId: string; name: string; employmentType: string | null;
  qualification: string | null; submitted: boolean;
  teaching: AnnualTeaching[]; evidence: AnnualEvidence[];
};

const CONTRIBUTING = new Set(["research_project", "publication", "supervision", "academic_service"]);
const norm = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");

export function publicationIdentity(item: AnnualEvidence): string {
  if (norm(item.identifier)) return "id:" + norm(item.identifier).replace(/^https?:\/\/(dx\.)?doi\.org\//, "");
  if (norm(item.url)) return "url:" + norm(item.url).replace(/\/$/, "");
  return "title:" + norm(item.title) + "|" + norm(item.organization);
}

/**
 * One row per person per academic year. Records are not aggregated from current
 * employment alone; missing submissions stay 'unreported', never zero.
 */
export function summarizeAnnualLecturers(
  year: AnnualYear, staff: AnnualStaffInput[], generatedAt: string,
): AnnualSummary {
  const publicationIds = new Set<string>();
  const cpdIds = new Set<string>();
  const result: AnnualLecturer[] = staff.map((person) => {
    const teaching = person.teaching.map(row => ({
      ...row,
      confirmed: row.verdict === "confirmed" || row.deliveredSessions > 0,
      discrepancy: row.verdict === "not_delivered" && row.deliveredSessions > 0,
    }));
    const evidence = person.evidence;
    const verified = evidence.filter(item => item.verificationStatus === "verified");
    for (const item of verified) {
      if (item.kind === "publication") publicationIds.add(publicationIdentity(item));
      if (item.kind === "professional_development") cpdIds.add(item.id);
    }
    const classification = teaching.some(row => row.confirmed)
      ? "teaching_active" as const
      : verified.some(item => CONTRIBUTING.has(item.kind))
        ? "other_contributor" as const : "unconfirmed" as const;
    return {
      lecturerId: person.lecturerId,
      name: person.name,
      employmentType: person.employmentType,
      qualification: person.qualification,
      submissionStatus: person.submitted ? "submitted" as const : "unreported" as const,
      teaching,
      evidence,
      classification,
      verifiedActivityCount: verified.length,
    };
  });
  return {
    schemaVersion: "annual-lecturer-v1",
    academicYear: year,
    generatedAt,
    staff: result,
    statistics: {
      totalInRegistry: result.length,
      activeTeaching: result.filter(r => r.classification === "teaching_active").length,
      otherContributors: result.filter(r => r.classification === "other_contributor").length,
      unconfirmed: result.filter(r => r.classification === "unconfirmed").length,
      unreported: result.filter(r => r.submissionStatus === "unreported").length,
      distinctPublications: publicationIds.size,
      verifiedCpdActivities: cpdIds.size,
      evidenceGaps: result.filter(r => r.submissionStatus === "unreported" ||
        r.teaching.some(t => t.discrepancy) ||
        r.teaching.some(t => !t.confirmed && t.verdict === null)).length,
    },
    releaseVersion: null,
    notes: [
      "Only confirmed delivery counts as active teaching, not assignments alone.",
      "Verified programme-related research, publication, supervision or service without teaching is reported separately.",
      "Unreported lecturer activities are missing information, not zero achievements.",
      "Annual employment classification is a current profile value until a historical HR snapshot is validated.",
      "Counts use distinct lecturer IDs and publication identities; no headcount/FTE ratio is inferred.",
    ],
  };
}
