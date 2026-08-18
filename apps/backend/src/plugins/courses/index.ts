import { Router } from "express";
import { coursesManifest } from "@dse-pms/shared-types";
import type { BackendPlugin } from "../../core/plugins/registry.ts";
import { createCourseRouter } from "./router.ts";
import { createCourseSpecPeriodicReviewRouter } from "./periodic-review-router.ts";
import { courseService, type CourseService } from "./service.ts";

const router = Router();
router.use(createCourseRouter());
router.use(createCourseSpecPeriodicReviewRouter());

export const coursesPlugin: BackendPlugin<CourseService> = {
  manifest: coursesManifest,
  router,
  service: courseService,
};
