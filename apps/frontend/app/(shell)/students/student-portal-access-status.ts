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
    description: "Invitation sent and still valid; the student has not activated the account yet.",
  },
  "invitation-expired": {
    label: "Invitation expired",
    tone: "danger",
    description: "The invitation link has expired and can be safely resent.",
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

export type PortalAccessFilter = "all" | StudentPortalAccessState;

const PORTAL_ACCESS_FILTER_ORDER: StudentPortalAccessState[] = [
  "not-invited",
  "invitation-pending",
  "invitation-expired",
  "active-account",
  "no-email",
  "inactive-student",
  "needs-attention",
  "status-unavailable",
];

export const PORTAL_ACCESS_FILTER_OPTIONS: ReadonlyArray<{
  value: PortalAccessFilter;
  label: string;
}> = [
  { value: "all", label: "All portal access" },
  ...PORTAL_ACCESS_FILTER_ORDER.map((status) => ({
    value: status,
    label: PRESENTATION[status].label,
  })),
];

export function matchesPortalAccessFilter(
  status: StudentPortalAccessState | undefined,
  filter: PortalAccessFilter,
): boolean {
  return filter === "all" || status === filter;
}

export function resolvePortalAccessStatus(
  cachedStatus: StudentPortalAccessState | undefined,
  queryFailed: boolean,
): StudentPortalAccessState | undefined {
  return queryFailed ? "status-unavailable" : cachedStatus;
}

export function portalAccessPresentation(
  status: StudentPortalAccessState,
): PortalAccessPresentation {
  return PRESENTATION[status];
}

export function canRepairPortalAccess(
  status: StudentPortalAccessState | undefined,
): boolean {
  return status === "needs-attention";
}
