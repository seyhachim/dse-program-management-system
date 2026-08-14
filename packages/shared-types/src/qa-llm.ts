import { z } from "zod";
import { QaEvidenceAnalysisStateSchema } from "./qa-analysis.ts";

export const QA_LLM_PROMPT_VERSION = "qa-evidence-match-v1";

export const QaLlmEvidenceMatchOutputSchema = z
  .object({
    state: QaEvidenceAnalysisStateSchema,
    explanation: z.string().trim().min(20).max(8000),
    confidence: z.number().min(0).max(1).nullable(),
    uncertaintyNote: z.string().trim().max(4000),
    usedCandidateKeys: z.array(z.string().trim().min(1).max(500)).max(200),
  })
  .strict()
  .superRefine((value, ctx) => {
    const keys = new Set<string>();
    for (const [index, key] of value.usedCandidateKeys.entries()) {
      if (keys.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "LLM evidence candidate references must be unique",
          path: ["usedCandidateKeys", index],
        });
      }
      keys.add(key);
    }
    if (value.state === "evidenceIdentified" && value.usedCandidateKeys.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Evidence identified requires at least one referenced candidate",
        path: ["usedCandidateKeys"],
      });
    }
  });

export const RunQaLlmAnalysisSchema = z.object({
  programmeId: z.string().trim().min(1),
});

export type QaLlmEvidenceMatchOutput = z.infer<typeof QaLlmEvidenceMatchOutputSchema>;
export type RunQaLlmAnalysisInput = z.infer<typeof RunQaLlmAnalysisSchema>;
