import type { QaSarDocumentModelView } from "@dse-pms/shared-types";

export const SAR_DOCUMENT_STYLE = {
  pageMarginTwips: 900,
  titleSize: 30,
  programmeSize: 28,
  cycleSize: 22,
} as const;

export type SarLayoutBlock =
  | { id: string; type: "heading"; text: string; level: number }
  | { id: string; type: "bullet" | "paragraph"; text: string }
  | { id: string; type: "evidenceReference"; text: string; evidenceId: string; evidenceNumber: string; label: string }
  | { id: string; type: "pmsData"; text: string; label: string };

export type SarLayoutSection = {
  requirementCode: string;
  requirementTitle: string;
  status: QaSarDocumentModelView["criteria"][number]["sections"][number]["status"];
  statusLabel: string;
  submissionVersion: number | null;
  submissionLabel: string | null;
  missingMessage: string | null;
  blocks: SarLayoutBlock[];
};

export type SarDocumentLayout = {
  title: string;
  programmeName: string;
  programmeCode: string;
  cycleTitle: string;
  mode: QaSarDocumentModelView["mode"];
  modeLabel: string;
  criteria: Array<{
    code: string;
    title: string;
    sections: SarLayoutSection[];
  }>;
  evidenceRows: Array<{
    evidenceId: string;
    number: string;
    title: string;
    reportingPeriod: string;
    requirementCodes: string;
    source: string;
    referenceCode: string | null;
    externalUrl: string | null;
  }>;
};

export function buildSarEvidenceNumberMap(model: QaSarDocumentModelView): Map<string, string> {
  return new Map(
    model.evidenceRegister.map((item, index) => [
      item.evidenceId,
      `E${String(index + 1).padStart(3, "0")}`,
    ]),
  );
}

function statusLabel(status: SarLayoutSection["status"]): string {
  const labels: Record<SarLayoutSection["status"], string> = {
    approved: "Approved",
    missing: "Missing",
    draft: "Draft",
    underReview: "Under review",
    changesRequested: "Changes requested",
  };
  return labels[status];
}

export function buildSarDocumentLayout(model: QaSarDocumentModelView): SarDocumentLayout {
  const evidenceNumbers = buildSarEvidenceNumberMap(model);

  return {
    title: "SELF-ASSESSMENT REPORT",
    programmeName: model.programmeName,
    programmeCode: model.programmeCode,
    cycleTitle: model.cycleTitle,
    mode: model.mode,
    modeLabel: model.mode === "working" ? "WORKING DRAFT" : "OFFICIAL SAR",
    criteria: model.criteria.map((criterion) => ({
      code: criterion.code,
      title: criterion.title,
      sections: criterion.sections.map((section) => ({
        requirementCode: section.requirementCode,
        requirementTitle: section.requirementTitle,
        status: section.status,
        statusLabel: statusLabel(section.status),
        submissionVersion: section.submissionVersion,
        submissionLabel: section.submissionVersion
          ? `Approved submission v${section.submissionVersion}`
          : null,
        missingMessage: section.content
          ? null
          : model.mode === "official"
            ? "No approved submission; excluded from official SAR"
            : "SAR writing has not started",
        blocks: section.content?.blocks.map((block): SarLayoutBlock => {
          if (block.type === "heading") {
            return { id: block.id, type: "heading", text: block.text, level: block.level };
          }
          if (block.type === "bullet") {
            return { id: block.id, type: "bullet", text: block.text };
          }
          if (block.type === "evidenceReference") {
            const evidenceNumber = evidenceNumbers.get(block.evidenceId) ?? "Evidence";
            return {
              id: block.id,
              type: "evidenceReference",
              text: `[${evidenceNumber}] ${block.label}`,
              evidenceId: block.evidenceId,
              evidenceNumber,
              label: block.label,
            };
          }
          if (block.type === "pmsData") {
            return {
              id: block.id,
              type: "pmsData",
              text: `[PMS data] ${block.label}`,
              label: block.label,
            };
          }
          return { id: block.id, type: "paragraph", text: block.text };
        }) ?? [],
      })),
    })),
    evidenceRows: model.evidenceRegister.map((item) => ({
      evidenceId: item.evidenceId,
      number: evidenceNumbers.get(item.evidenceId) ?? "Evidence",
      title: item.title,
      reportingPeriod: item.reportingPeriod || "—",
      requirementCodes: item.requirementCodes.join(", "),
      source: item.referenceCode
        ? `${item.referenceCode}${item.externalUrl ? ` · ${item.externalUrl}` : ""}`
        : item.sourceRef || item.sourceUrl || "—",
      referenceCode: item.referenceCode ?? null,
      externalUrl: item.externalUrl ?? null,
    })),
  };
}