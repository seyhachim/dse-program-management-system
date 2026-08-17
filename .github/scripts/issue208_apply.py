from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one marker, found {count}: {old[:80]!r}")
    p.write_text(text.replace(old, new, 1))

# shared-types export
replace_once(
    "packages/shared-types/src/index.ts",
    'export * from "./course-spec.ts";\n',
    'export * from "./course-spec.ts";\nexport * from "./course-spec-revision.ts";\n',
)

# Prisma relations + immutable request model.
replace_once(
    "apps/backend/prisma/schema.prisma",
    '  courseSpecReviewActions          CourseSpecReviewAction[]         @relation("CourseSpecReviewActor")\n',
    '  courseSpecReviewActions          CourseSpecReviewAction[]         @relation("CourseSpecReviewActor")\n  courseSpecRevisionRequests        CourseSpecRevisionRequest[]       @relation("CourseSpecRevisionRequestedBy")\n',
)
replace_once(
    "apps/backend/prisma/schema.prisma",
    '  courseInfo              CourseSpecCourseInfo?\n',
    '  courseInfo              CourseSpecCourseInfo?\n  revisionRequest         CourseSpecRevisionRequest?\n',
)
model = '''/// Immutable governance record that explains why one CourseSpec academic revision\n/// was created. It is one-to-one with the resulting draft revision and stores the\n/// original impact assessment independently from later edits to that draft.\nmodel CourseSpecRevisionRequest {\n  id                                      String                    @id @default(uuid())\n  courseSpecId                            String                    @unique\n  courseSpec                              CourseSpec                @relation(fields: [courseSpecId], references: [id], onDelete: Restrict)\n  requestedById                           String\n  requestedBy                             User                      @relation("CourseSpecRevisionRequestedBy", fields: [requestedById], references: [id], onDelete: Restrict)\n  triggers                                CourseSpecRevisionTrigger[]\n  evidenceSummary                         String\n  changeSummary                           String\n  proposedRevisionType                    CourseSpecRevisionType\n  recommendedRevisionType                 CourseSpecRevisionType\n  overrideJustification                   String                    @default("")\n  effectiveAcademicTerm                   String\n  impactCourseCodeOrTitle                 Boolean                   @default(false)\n  impactCreditsOrSlt                      Boolean                   @default(false)\n  impactPrerequisites                     Boolean                   @default(false)\n  impactMaterialCloChanges                Boolean                   @default(false)\n  impactBloomOrCapLevels                  Boolean                   @default(false)\n  impactCloPloAlignment                   Boolean                   @default(false)\n  impactAssessmentStructureOrWeighting    Boolean                   @default(false)\n  impactCurriculumOrRegulatoryAlignment   Boolean                   @default(false)\n  createdAt                               DateTime                  @default(now())\n\n  @@index([requestedById, createdAt])\n}\n\n'''
replace_once(
    "apps/backend/prisma/schema.prisma",
    '/// Immutable workflow events for Course Specification submission/review actions.\n',
    model + '/// Immutable workflow events for Course Specification submission/review actions.\n',
)

# Migration must freeze all collected request fields and work even when local DB lacks Supabase roles.
replace_once(
    "apps/backend/prisma/migrations/20260817102000_add_course_spec_revision_requests/migration.sql",
    '  "requestedById" TEXT NOT NULL,\n  "evidenceSummary" TEXT NOT NULL,\n',
    '  "requestedById" TEXT NOT NULL,\n  "triggers" "CourseSpecRevisionTrigger"[] NOT NULL,\n  "evidenceSummary" TEXT NOT NULL,\n  "changeSummary" TEXT NOT NULL,\n',
)
replace_once(
    "apps/backend/prisma/migrations/20260817102000_add_course_spec_revision_requests/migration.sql",
    '''REVOKE ALL ON TABLE "CourseSpecRevisionRequest" FROM PUBLIC;\nREVOKE ALL ON TABLE "CourseSpecRevisionRequest" FROM anon;\nREVOKE ALL ON TABLE "CourseSpecRevisionRequest" FROM authenticated;\nREVOKE ALL ON TABLE "CourseSpecRevisionRequest" FROM service_role;\n\nREVOKE ALL ON FUNCTION "prevent_course_spec_revision_request_mutation"() FROM PUBLIC;\nREVOKE ALL ON FUNCTION "prevent_course_spec_revision_request_mutation"() FROM anon;\nREVOKE ALL ON FUNCTION "prevent_course_spec_revision_request_mutation"() FROM authenticated;\nREVOKE ALL ON FUNCTION "prevent_course_spec_revision_request_mutation"() FROM service_role;\n''',
    '''REVOKE ALL PRIVILEGES ON TABLE "CourseSpecRevisionRequest" FROM PUBLIC;\nREVOKE ALL PRIVILEGES ON FUNCTION "prevent_course_spec_revision_request_mutation"() FROM PUBLIC;\n\nDO $$\nDECLARE\n  api_role text;\nBEGIN\n  FOR api_role IN\n    SELECT rolname FROM pg_roles\n    WHERE rolname = ANY (ARRAY['anon', 'authenticated', 'service_role'])\n  LOOP\n    EXECUTE format(\n      'REVOKE ALL PRIVILEGES ON TABLE %I.%I FROM %I',\n      'public', 'CourseSpecRevisionRequest', api_role\n    );\n    EXECUTE format(\n      'REVOKE ALL PRIVILEGES ON FUNCTION %I.%I() FROM %I',\n      'public', 'prevent_course_spec_revision_request_mutation', api_role\n    );\n  END LOOP;\nEND\n$$;\n''',
)

# Existing revision service remains the only deep-cloning path; metadata joins its transaction.
replace_once(
    "apps/backend/src/plugins/courses/revision-service.ts",
    '''export type CreateCourseSpecRevisionInput = {\n  courseId: string;\n  revisionType: RevisionKind;\n  triggers: CourseSpecRevisionTrigger[];\n  reason: string;\n  changeSummary: string;\n  initiatedById: string;\n};\n''',
    '''export type CreateCourseSpecRevisionInput = {\n  courseId: string;\n  revisionType: RevisionKind;\n  triggers: CourseSpecRevisionTrigger[];\n  reason: string;\n  changeSummary: string;\n  initiatedById: string;\n  revisionRequest?: {\n    requestedById: string;\n    triggers: CourseSpecRevisionTrigger[];\n    evidenceSummary: string;\n    changeSummary: string;\n    proposedRevisionType: RevisionKind;\n    recommendedRevisionType: RevisionKind;\n    overrideJustification: string;\n    effectiveAcademicTerm: string;\n    impactCourseCodeOrTitle: boolean;\n    impactCreditsOrSlt: boolean;\n    impactPrerequisites: boolean;\n    impactMaterialCloChanges: boolean;\n    impactBloomOrCapLevels: boolean;\n    impactCloPloAlignment: boolean;\n    impactAssessmentStructureOrWeighting: boolean;\n    impactCurriculumOrRegulatoryAlignment: boolean;\n  };\n};\n''',
)
replace_once(
    "apps/backend/src/plugins/courses/revision-service.ts",
    '      await cloneNormalizedContent(tx, source, target.id);\n\n      return {\n',
    '''      await cloneNormalizedContent(tx, source, target.id);\n\n      if (input.revisionRequest) {\n        await tx.courseSpecRevisionRequest.create({\n          data: {\n            courseSpecId: target.id,\n            ...input.revisionRequest,\n          },\n        });\n      }\n\n      return {\n''',
)

# Wrapper passes/reads the immutable copies rather than draft fields.
replace_once(
    "apps/backend/src/plugins/courses/revision-request-service.ts",
    '''      revisionRequest: {\n        requestedById,\n        evidenceSummary: input.evidenceSummary,\n''',
    '''      revisionRequest: {\n        requestedById,\n        triggers: input.triggers as CourseSpecRevisionTrigger[],\n        evidenceSummary: input.evidenceSummary,\n        changeSummary: input.changeSummary,\n''',
)
replace_once(
    "apps/backend/src/plugins/courses/revision-request-service.ts",
    '''        triggers: result.revisionTriggers,\n        evidenceSummary: request.evidenceSummary,\n        changeSummary: result.changeSummary,\n''',
    '''        triggers: request.triggers,\n        evidenceSummary: request.evidenceSummary,\n        changeSummary: request.changeSummary,\n''',
)

# Courses router: validate shared contract, then enforce dedicated programme governance scope.
replace_once(
    "apps/backend/src/plugins/courses/router.ts",
    '''  CreateCourseInput,\n  ListCoursesQuery,\n''',
    '''  CreateCourseInput,\n  CreateCourseSpecRevisionRequestSchema,\n  ListCoursesQuery,\n''',
)
replace_once(
    "apps/backend/src/plugins/courses/router.ts",
    'import { CourseSpecLockedError } from "./spec-lock.ts";\n',
    '''import { CourseSpecLockedError } from "./spec-lock.ts";\nimport { canCreateCourseSpecRevision } from "./revision-authorization.ts";\nimport { courseSpecRevisionRequestService } from "./revision-request-service.ts";\n''',
)
route = '''\n  router.post(\n    "/:id/spec/revisions",\n    requirePermission("courses:review"),\n    async (req, res) => {\n      const courseId = getRequiredParam(req, res, "id");\n      if (!courseId) return;\n      const requestedById = getRequiredUserId(req, res);\n      if (!requestedById) return;\n\n      const course = await courseService.getById(courseId);\n      if (!course) {\n        res.status(404).json({ error: "Course not found" });\n        return;\n      }\n      if (!canCreateCourseSpecRevision(req.user!, course.programmeId)) {\n        res.status(403).json({\n          error: "Only programme academic leadership may create a course specification revision",\n        });\n        return;\n      }\n\n      const parsed = CreateCourseSpecRevisionRequestSchema.safeParse(req.body);\n      if (!parsed.success) {\n        res.status(400).json({\n          error: "Invalid revision request",\n          details: parsed.error.flatten(),\n        });\n        return;\n      }\n\n      try {\n        res.status(201).json(\n          await courseSpecRevisionRequestService.create(\n            courseId,\n            requestedById,\n            parsed.data,\n          ),\n        );\n      } catch (err) {\n        const code = (err as { code?: string }).code;\n        const status =\n          code === "COURSE_NOT_FOUND" ? 404 :\n          code === "INVALID_OVERRIDE" ? 400 :\n          code === "SOURCE_NOT_APPROVED" || code === "OPEN_REVISION_EXISTS" ? 409 : 409;\n        res.status(status).json({\n          error: err instanceof Error ? err.message : "Could not create course specification revision",\n        });\n      }\n    },\n  );\n\n'''
replace_once(
    "apps/backend/src/plugins/courses/router.ts",
    '  router.get("/:id", requirePermission("courses:read"), async (req, res) => {\n',
    route + '  router.get("/:id", requirePermission("courses:read"), async (req, res) => {\n',
)

# DB security inventory.
replace_once(
    "apps/backend/scripts/verify-db-security.ts",
    '  "CourseSpecCourseInfo",\n',
    '  "CourseSpecCourseInfo",\n  "CourseSpecRevisionRequest",\n',
)

# CourseSpec workspace entrypoint for approved versions.
replace_once(
    "apps/frontend/app/(shell)/courses/[id]/spec/review-submit-section.tsx",
    'import { useMemo, useState } from "react";\n',
    'import Link from "next/link";\nimport { useMemo, useState } from "react";\n',
)
replace_once(
    "apps/frontend/app/(shell)/courses/[id]/spec/review-submit-section.tsx",
    '''        <Button variant="outline" onClick={onPreview}>\n          <Eye className="mr-2 h-4 w-4" />\n          Preview Document\n        </Button>\n''',
    '''        <div className="flex gap-2">\n          {canReview && review.status === "approved" ? (\n            <Button\n              variant="outline"\n              nativeButton={false}\n              render={<Link href={`/courses/${course.id}/spec/revision`} />}\n            >\n              Create Revision\n            </Button>\n          ) : null}\n          <Button variant="outline" onClick={onPreview}>\n            <Eye className="mr-2 h-4 w-4" />\n            Preview Document\n          </Button>\n        </div>\n''',
)

# Base UI link semantics in the dedicated revision page.
p = Path("apps/frontend/app/(shell)/courses/[id]/spec/revision/revision-request-client.tsx")
text = p.read_text()
text = text.replace('variant="outline" render={<Link', 'variant="outline" nativeButton={false} render={<Link')
p.write_text(text)

# Dedicated DB regression runs on fresh PostgreSQL before DB-security verification.
replace_once(
    ".github/workflows/ci.yml",
    '''      - name: Verify CourseSpec Course Information snapshot stability\n        run: bun test apps/backend/src/plugins/courses/course-info-snapshot-db.test.ts\n        env:\n          COURSE_INFO_SNAPSHOT_DB_TESTS: "1"\n\n''',
    '''      - name: Verify CourseSpec Course Information snapshot stability\n        run: bun test apps/backend/src/plugins/courses/course-info-snapshot-db.test.ts\n        env:\n          COURSE_INFO_SNAPSHOT_DB_TESTS: "1"\n\n      - name: Verify immutable CourseSpec revision request metadata\n        run: bun test apps/backend/src/plugins/courses/revision-request-db.test.ts\n        env:\n          COURSE_SPEC_REVISION_REQUEST_DB_TESTS: "1"\n\n''',
)

# The workflow/script are temporary patch transport, not product changes.
Path(".github/scripts/issue208_apply.py").unlink()
Path(".github/workflows/issue208-apply.yml").unlink()
