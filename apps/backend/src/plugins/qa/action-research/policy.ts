import type {
  ResearchAssignmentStatus,
  ResearchCycleStatus,
  ResearchProtocolStatus,
} from "@dse-pms/shared-types";

export class ActionResearchLifecycleError extends Error {}

const ASSIGNMENT_TRANSITIONS: Record<ResearchAssignmentStatus, ResearchAssignmentStatus[]> = {
  ASSIGNED: ["ACCEPTED"],
  ACCEPTED: ["IN_PROGRESS"],
  IN_PROGRESS: ["SUBMITTED"],
  SUBMITTED: ["REVISION_REQUIRED", "COMPLETED"],
  REVISION_REQUIRED: ["IN_PROGRESS", "SUBMITTED"],
  COMPLETED: [],
};

export function assertAssignmentTransition(
  current: ResearchAssignmentStatus,
  next: ResearchAssignmentStatus,
): void {
  if (!ASSIGNMENT_TRANSITIONS[current].includes(next)) {
    throw new ActionResearchLifecycleError(`Invalid assignment transition: ${current} -> ${next}`);
  }
}

export function canEditProtocol(status: ResearchProtocolStatus): boolean {
  return status === "DRAFT" || status === "REVISION_REQUIRED";
}

export function nextActionForCycleStatus(status: ResearchCycleStatus): string {
  switch (status) {
    case "DRAFT":
      return "Prepare the research protocol";
    case "PROTOCOL_REVIEW":
      return "Await protocol review";
    case "REVISION_REQUIRED":
      return "Revise the research protocol";
    case "PROTOCOL_APPROVED":
      return "Lock the baseline";
    case "BASELINE_LOCKED":
      return "Prepare the intervention";
    case "INTERVENTION_ACTIVE":
      return "Record intervention fidelity";
    case "OBSERVATION":
      return "Complete observation evidence";
    case "ANALYSIS":
      return "Complete the analysis";
    case "REFLECTION":
      return "Complete the reflection";
    case "SUBMITTED":
      return "Await cycle review";
    case "APPROVED":
      return "Record programme decision";
    case "COMPLETED":
      return "No action required";
  }
}
