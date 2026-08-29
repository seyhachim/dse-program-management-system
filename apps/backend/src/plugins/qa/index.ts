import { Router } from "express";
import { qaManifest } from "@dse-pms/shared-types";
import type { BackendPlugin } from "../../core/plugins/registry.ts";
import { createQaActionRouter } from "./actions/router.ts";
import { createActionResearchRouter } from "./action-research/router.ts";
import { createActionResearchInterventionRouter } from "./action-research/intervention-router.ts";
import { createQaLlmRouter } from "./analysis/llm-router.ts";
import { createQaAssignmentsRouter } from "./assignments/router.ts";
import { createQaEvidenceLibraryRouter } from "./evidence/router.ts";
import { createQaEvidenceSharingRouter } from "./evidence-sharing/router.ts";
import { createQaExternalEvidenceRouter } from "./evidence-sharing/public-router.ts";
import { createQaEvaluationRouter } from "./evaluation/router.ts";
import { createQaPilotRouter } from "./evaluation/pilot-router.ts";
import { createQaReviewRouter } from "./reviews/router.ts";
import { createQaRouter } from "./router.ts";
import { createQaSarBookEvidenceRouter } from "./sar-book/evidence-register-router.ts";
import { createQaSarBookPart2Router } from "./sar-book/part2-router.ts";
import { createQaSarBookPart3Router } from "./sar-book/part3-router.ts";
import { createQaSarBookReviewRouter } from "./sar-book/review-router.ts";
import { createQaSarBookRouter } from "./sar-book/router.ts";
import { createQaSarSourceContextRouter } from "./sar-book/source-context-router.ts";
import { createQaSarDocumentRouter } from "./sar-document/router.ts";
import { createQaSarProgressRouter } from "./sar-review/progress-router.ts";
import { createQaSarReviewRouter } from "./sar-review/router.ts";
import { createQaSarRouter } from "./sar/router.ts";
import { qaService, type QaService } from "./service.ts";
import { createQaWorkspaceRouter } from "./workspace/router.ts";

const router = Router();
// Public token resolver must remain outside routers that apply requireAuth.
router.use(createQaExternalEvidenceRouter());
router.use(createQaRouter());
router.use(createActionResearchRouter());
router.use(createActionResearchInterventionRouter());
router.use(createQaAssignmentsRouter());
router.use(createQaEvidenceLibraryRouter());
router.use(createQaEvidenceSharingRouter());
router.use(createQaWorkspaceRouter());
router.use(createQaSarRouter());
router.use(createQaSarBookRouter());
router.use(createQaSarBookEvidenceRouter());
router.use(createQaSarBookPart2Router());
router.use(createQaSarBookPart3Router());
router.use(createQaSarBookReviewRouter());
router.use(createQaSarSourceContextRouter());
router.use(createQaSarDocumentRouter());
router.use(createQaSarReviewRouter());
router.use(createQaSarProgressRouter());
router.use(createQaLlmRouter());
router.use(createQaReviewRouter());
router.use(createQaActionRouter());
router.use(createQaEvaluationRouter());
router.use(createQaPilotRouter());

export const qaPlugin: BackendPlugin<QaService> = {
  manifest: qaManifest,
  router,
  service: qaService,
};
