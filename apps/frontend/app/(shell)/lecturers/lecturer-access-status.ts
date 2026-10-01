import type { LecturerAccessState } from "@dse-pms/shared-types";

export type LecturerAccessPresentation = {
  label: string;
  tone: "success" | "warning" | "danger" | "neutral";
  description: string;
};

const PRESENTATION: Record<LecturerAccessState, LecturerAccessPresentation> = {
  "no-access": {
    label: "No access",
    tone: "neutral",
    description: "No Supabase authentication identity is linked yet.",
  },
  "invitation-pending": {
    label: "Invitation pending",
    tone: "warning",
    description: "Invitation sent; the lecturer has not activated the account yet.",
  },
  "active-account": {
    label: "Active account",
    tone: "success",
    description: "A linked non-pending lecturer account exists.",
  },
  "needs-attention": {
    label: "Needs attention",
    tone: "danger",
    description: "The linked authentication identity is missing or inconsistent.",
  },
  "status-unavailable": {
    label: "Status unavailable",
    tone: "danger",
    description: "Authentication status could not be verified, so PMS does not guess the account state.",
  },
};

export function lecturerAccessPresentation(
  status: LecturerAccessState,
): LecturerAccessPresentation {
  return PRESENTATION[status];
}
