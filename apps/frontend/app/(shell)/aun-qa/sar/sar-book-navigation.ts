export function sarBookRequirementHref(requirementCode: string): string {
  return `/aun-qa/sar/${encodeURIComponent(requirementCode)}`;
}

export const SAR_BOOK_MODE_HREFS = {
  content: "/aun-qa/sar",
  evidence: "/aun-qa/evidence",
  review: "/aun-qa/review",
  preview: "/aun-qa/sar-preview",
} as const;
