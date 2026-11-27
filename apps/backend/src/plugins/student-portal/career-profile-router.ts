import { Router } from "express";
import { EMPTY_STUDENT_CAREER_PROFILE, StudentCareerProfileSchema } from "@dse-pms/shared-types";
import { requireAuth } from "../../core/auth/middleware.ts";
import { hasRoleInProgramme } from "../../core/auth/token.ts";
import { DEFAULT_PROGRAMME_ID } from "../../core/programme.ts";
import { prisma } from "../../core/db/prisma.ts";

export function createStudentCareerProfileRouter(): Router {
  const router = Router();
  router.use(requireAuth);
  router.use((_req,res,next) => { res.setHeader("Cache-Control","private, no-store"); next(); });
  router.get("/", async (req,res) => {
    if (!hasRoleInProgramme(req.user!,"student",DEFAULT_PROGRAMME_ID)) return void res.status(403).json({error:"Student access required"});
    try {
      const rows = await prisma.$queryRaw<Array<{ preferences: unknown }>>`
        SELECT p."preferences" FROM "Student" s LEFT JOIN "StudentCareerProfile" p ON p."studentId"=s."id"
        JOIN "StudentCohortMembership" cm ON cm."studentId"=s."id" AND cm."exitedAt" IS NULL
        JOIN "StudentCohort" c ON c."id"=cm."cohortId" AND c."programmeId"=${DEFAULT_PROGRAMME_ID}
        WHERE s."userId"=${req.user!.id} AND s."status"='Active' LIMIT 1
      `;
      if (!rows.length) return void res.status(403).json({error:"Active student record required"});
      const parsed = StudentCareerProfileSchema.safeParse(rows[0]!.preferences ?? EMPTY_STUDENT_CAREER_PROFILE);
      if (!parsed.success) return void res.status(500).json({error:"Career profile could not be loaded"});
      res.json(parsed.data);
    } catch { res.status(500).json({error:"Career profile could not be loaded"}); }
  });
  router.put("/", async (req,res) => {
    if (!hasRoleInProgramme(req.user!,"student",DEFAULT_PROGRAMME_ID)) return void res.status(403).json({error:"Student access required"});
    const parsed = StudentCareerProfileSchema.safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({error:"Invalid career preferences"});
    try {
      const changed = await prisma.$executeRaw`
        INSERT INTO "StudentCareerProfile" ("studentId","preferences")
        SELECT s."id", ${JSON.stringify(parsed.data)}::jsonb FROM "Student" s
        WHERE s."userId"=${req.user!.id} AND s."status"='Active' AND EXISTS (
          SELECT 1 FROM "StudentCohortMembership" cm JOIN "StudentCohort" c ON c."id"=cm."cohortId"
          WHERE cm."studentId"=s."id" AND cm."exitedAt" IS NULL AND c."programmeId"=${DEFAULT_PROGRAMME_ID}
        )
        ON CONFLICT ("studentId") DO UPDATE SET "preferences"=EXCLUDED."preferences","updatedAt"=CURRENT_TIMESTAMP
      `;
      if (changed !== 1) return void res.status(403).json({error:"Active student record required"});
      res.json(parsed.data);
    } catch { res.status(500).json({error:"Career profile could not be saved"}); }
  });
  return router;
}
