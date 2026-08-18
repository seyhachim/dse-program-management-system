import { QA_PILOT_REQUIREMENT_CODES } from "./qa-knowledge.ts";

export const QA_PILOT_SCENARIO_VERSION = "aun-qa-evidence-gap-pilot-v1";
export const QA_PILOT_SCENARIOS_PER_REQUIREMENT = 2;
export const QA_PILOT_EXPECTED_SCENARIO_COUNT =
  QA_PILOT_REQUIREMENT_CODES.length * QA_PILOT_SCENARIOS_PER_REQUIREMENT;

export interface QaPilotInitializeResult {
  version: string;
  created: number;
  existing: number;
  total: number;
}

export interface QaPilotRequirementStatus {
  requirementCode: string;
  scenarioCount: number;
  goldAnnotatedCount: number;
  deterministicRunCount: number;
  llmRunCount: number;
}

export interface QaPilotStatusView {
  version: string;
  expectedScenarioCount: number;
  scenarioCount: number;
  goldAnnotatedCount: number;
  pendingGoldCount: number;
  deterministicRunCount: number;
  llmRunCount: number;
  humanRatingCount: number;
  allRequirementsCovered: boolean;
  allGoldAnnotated: boolean;
  readyForComparison: boolean;
  requirements: QaPilotRequirementStatus[];
}
