import { Router, type Request, type Response } from "express";
import { ZodError } from "zod";
import { requireAuth } from "../../core/auth/middleware.ts";
import { prisma } from "../../core/db/prisma.ts";
import { createExamVariantManagementService, ExamVariantAccessError, ExamVariantConflictError } from "../../core/academic/exam-variant-management.ts";
import type { AuthUser } from "../../core/auth/token.ts";

type Env = Pick<NodeJS.ProcessEnv, "NODE_ENV"|"DATABASE_URL"|"EXAM_VARIANT_WORKSPACE_ENABLED"|"EXAM_VARIANT_PROPOSAL_KEY">;
/** Explicitly non-production, loopback disposable database only. This is not
 * a production feature flag; Phase 3 must implement the release interlock. */
export function examWorkspacePilotKey(env: Env): Buffer | null {
  if (env.EXAM_VARIANT_WORKSPACE_ENABLED !== "true" || !["development","test"].includes(env.NODE_ENV ?? "")) return null;
  try {
    const url = new URL(env.DATABASE_URL ?? "");
    if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") return null;
    if (!["localhost","127.0.0.1"].includes(url.hostname) || !["/dse_ci","/dse_exam_uat"].includes(url.pathname)) return null;
    const raw = env.EXAM_VARIANT_PROPOSAL_KEY ?? "";
    if (!/^[a-fA-F0-9]{64}$/.test(raw)) return null;
    return Buffer.from(raw, "hex");
  } catch { return null; }
}
function safeError(error: unknown, res: Response) {
  if (error instanceof ZodError) { res.status(400).json({error:"Invalid examination workspace request"}); return; }
  if (error instanceof ExamVariantAccessError) { res.status(403).json({error:"Exam scope or permission unavailable"}); return; }
  if (error instanceof ExamVariantConflictError) { res.status(409).json({error:error.message}); return; }
  const e = error as { code?: string; meta?: { code?: string } } | null;
  if (e?.code === "P2034" || (e?.code === "P2010" && ["23503","23505","23514","40001","40P01","P0001"].includes(e.meta?.code ?? ""))) {
    res.status(409).json({error:"Academic integrity conflict; reload before retrying"}); return;
  }
  // Never log request bodies, signed proposals, private metadata or raw DB errors.
  res.status(500).json({error:"Examination workspace unavailable"});
}
export function createExamVariantWorkspaceRouter(env: Env = process.env): Router {
  const router = Router();
  const key = examWorkspacePilotKey(env);
  const service = key ? createExamVariantManagementService(prisma, key) : null;
  // Restrict middleware to this namespace only; disabled routes never query DB.
  router.use("/exam-variants", (_req, res, next) => {
    res.setHeader("Cache-Control","private, no-store");
    if (!service) { res.status(404).json({error:"Examination workspace disabled"}); return; }
    next();
  });
  router.use("/exam-variants", requireAuth);
  function endpoint(operation: (actor: AuthUser, data: unknown) => Promise<unknown>) {
    return async (req: Request, res: Response) => {
      try { res.json(await operation(req.user!, req.body)); }
      catch (error) { safeError(error,res); }
    };
  }
  if (service) {
    router.post("/exam-variants/workspace", endpoint(service.workspace));
    router.post("/exam-variants/submit", endpoint(service.submit));
    router.post("/exam-variants/decide", endpoint(service.decide));
    router.post("/exam-variants/permit", endpoint(service.permitOffering));
    router.post("/exam-variants/assign", endpoint(service.assignBulk));
    router.post("/exam-variants/history", endpoint(service.history));
    router.post("/exam-variants/resolve", endpoint(service.resolve));
  }
  return router;
}
