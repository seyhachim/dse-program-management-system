// Temporary branch-only database smoke test; removed before merge.
import {
  QA_STRUCTURED_EVIDENCE_TYPES,
  type QaQualityExpectationView,
} from "@dse-pms/shared-types";
import { qaService } from "../src/plugins/qa/service.ts";
import { getQaEvidenceCandidates } from "../src/plugins/qa/evidence/service.ts";

const supported = new Set<string>(QA_STRUCTURED_EVIDENCE_TYPES);
const knowledge = await qaService.getKnowledge();
let checked = 0;

for (const expectation of knowledge.expectations as QaQualityExpectationView[]) {
  for (const evidence of expectation.expectedEvidence) {
    if (!supported.has(evidence.evidenceType)) continue;
    const result = await getQaEvidenceCandidates("dse", evidence.id);
    if (result.status !== "supported") {
      throw new Error(`${evidence.evidenceType} unexpectedly returned ${result.status}`);
    }
    checked += 1;
    console.log(`${evidence.evidenceType}: ${result.candidates.length} candidate(s)`);
  }
}

if (checked === 0) throw new Error("No deterministic evidence adapters were exercised");
console.log(`Validated ${checked} deterministic expected-evidence definitions.`);
