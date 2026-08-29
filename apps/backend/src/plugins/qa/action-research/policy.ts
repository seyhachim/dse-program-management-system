import type {
  ResearchAssignmentRole,
  ResearchAssignmentStatus,
  ResearchCycleStatus,
  ResearchInterventionStatus,
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

const INTERVENTION_TRANSITIONS: Record<ResearchInterventionStatus, ResearchInterventionStatus[]> = {
  PLANNED: ["ACTIVE", "CANCELLED"],
  ACTIVE: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
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

export function canManageIntervention(role: ResearchAssignmentRole | null | undefined): boolean {
  return role === "LEAD_RESEARCHER" || role === "CO_RESEARCHER";
}

export function assertCanPlanIntervention(status: ResearchCycleStatus): void {
  if (status !== "BASELINE_LOCKED" && status !== "INTERVENTION_ACTIVE") {
    throw new ActionResearchLifecycleError(
      `Interventions can only be planned after the baseline is locked: ${status}`,
    );
  }
}

export function assertInterventionTransition(
  current: ResearchInterventionStatus,
  next: ResearchInterventionStatus,
): void {
  if (!INTERVENTION_TRANSITIONS[current].includes(next)) {
    throw new ActionResearchLifecycleError(`Invalid intervention transition: ${current} -> ${next}`);
  }
}

export function assertCanLogIntervention(
  cycleStatus: ResearchCycleStatus,
  interventionStatus: ResearchInterventionStatus,
): void {
  if (cycleStatus !== "INTERVENTION_ACTIVE" || interventionStatus !== "ACTIVE") {
    throw new ActionResearchLifecycleError(
      `Fidelity logs require an active intervention in an active intervention cycle: ${cycleStatus}/${interventionStatus}`,
    );
  }
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
