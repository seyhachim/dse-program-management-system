import { coursesManifest } from "@dse-pms/shared-types";
import { Router } from "express";
import type { BackendPlugin } from "../../core/plugins/registry.ts";
import { createCoursePeriodicReviewRouter } from "./periodic-review-router.ts";
import { createCourseRouter } from "./router.ts";
import { courseService, type CourseService } from "./service.ts";

const router = Router();
router.use(createCoursePeriodicReviewRouter());
router.use(createCourseRouter());

export const coursesPlugin: BackendPlugin<CourseService> = {
  manifest: coursesManifest,
  router,
  service: courseService,
};
