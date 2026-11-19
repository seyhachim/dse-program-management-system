import { Router } from "express";
import { StudentProjectDirectoryQuery } from "@dse-pms/shared-types";
import { requireAuth } from "../../core/auth/middleware.ts";
import { PortalAccessError } from "./service.ts";
import { studentPortfolioDirectoryService } from "./portfolio-directory.ts";

/** Separate staff-only boundary; student portfolio self-service permissions do not apply. */
export function createStudentPortfolioDirectoryRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get("/", async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    const parsed = StudentProjectDirectoryQuery.safeParse(req.query);
    if (!parsed.success) {
      return void res.status(400).json({ error: "Invalid directory filters", details: parsed.error.flatten() });
    }
    try {
      res.json(await studentPortfolioDirectoryService.list(req.user!, parsed.data));
    } catch (error) {
      if (error instanceof PortalAccessError) {
        return void res.status(403).json({ error: error.message });
      }
      console.error("Student projects directory failed", error);
      return void res.status(500).json({ error: "Could not load the student projects directory" });
    }
  });
  return router;
}
