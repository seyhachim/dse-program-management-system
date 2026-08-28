export function sarBookRequirementHref(requirementCode: string): string {
  return `/aun-qa/sar/${encodeURIComponent(requirementCode)}`;
}

export const SAR_BOOK_MODE_HREFS = {
  content: "/aun-qa/sar",
  evidence: "/aun-qa/sar/evidence",
  review: "/aun-qa/sar/review",
  preview: "/aun-qa/sar-preview",
} as const;
