import type { StudentPortalAccessState } from "@dse-pms/shared-types";

export type PortalAccessPresentation = {
  label: string;
  tone: "success" | "warning" | "info" | "danger" | "neutral";
  description: string;
};

const PRESENTATION: Record<StudentPortalAccessState, PortalAccessPresentation> = {
  "not-invited": {
    label: "Not invited",
    tone: "neutral",
    description: "No Student Portal account or invitation has been linked yet.",
  },
  "invitation-pending": {
    label: "Invitation pending",
    tone: "warning",
    description: "Invitation sent; the student has not activated the account yet.",
  },
  "active-account": {
    label: "Active account",
    tone: "success",
    description: "A linked non-pending Student Portal account exists.",
  },
  "no-email": {
    label: "No email",
    tone: "neutral",
    description: "Add an institutional email before sending Student Portal access.",
  },
  "inactive-student": {
    label: "Inactive student",
    tone: "neutral",
    description: "Inactive students are intentionally skipped by portal invitation delivery.",
  },
  "needs-attention": {
    label: "Needs attention",
    tone: "danger",
    description: "The local Student/User link or linked authentication identity is inconsistent or missing.",
  },
  "status-unavailable": {
    label: "Status unavailable",
    tone: "danger",
    description: "Authentication status could not be verified, so PMS does not guess the account state.",
  },
};

export function portalAccessPresentation(
  status: StudentPortalAccessState,
): PortalAccessPresentation {
  return PRESENTATION[status];
}
