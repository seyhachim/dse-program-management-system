import { Router } from "express";
import {
  QaEvidenceExternalReferenceGoneError,
  QaEvidenceSharingResourceNotFoundError,
  resolveExternalQaEvidence,
} from "./service.ts";

export function createQaExternalEvidenceRouter(): Router {
  const router = Router();

  router.get("/evidence/ref/:token", async (req, res) => {
    const token = req.params.token;
    if (!token) {
      res.status(404).json({ error: "External evidence reference not found" });
      return;
    }
    try {
      res.json(await resolveExternalQaEvidence(token));
    } catch (error) {
      // Do not disclose whether a token was valid but revoked/expired.
      if (
        error instanceof QaEvidenceSharingResourceNotFoundError ||
        error instanceof QaEvidenceExternalReferenceGoneError
      ) {
        res.status(404).json({ error: "External evidence reference not found" });
        return;
      }
      res.status(500).json({ error: "Could not load external evidence" });
    }
  });

  return router;
}
