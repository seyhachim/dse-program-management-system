import type { AnnualEvidenceAttribution, AnnualReportingWindow } from "@dse-pms/shared-types";

// ISO date-only comparisons avoid timezone-dependent Date parsing.
export function annualEvidenceAttribution(
  window: AnnualReportingWindow | null,
  startDate: string | null,
  endDate: string | null,
): AnnualEvidenceAttribution {
  if (!window) return "period_unconfigured";
  if (!startDate) return "undated";
  const finalDate = endDate ?? startDate;
  if (finalDate < startDate) return "out_of_period";
  return startDate <= window.endDate && finalDate >= window.startDate
    ? "in_period" : "out_of_period";
}
