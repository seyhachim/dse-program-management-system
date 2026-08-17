from pathlib import Path


def replace(path: str, old: str, new: str, *, count: int = 1) -> None:
    p = Path(path)
    text = p.read_text()
    actual = text.count(old)
    if actual != count:
        raise SystemExit(f"{path}: expected {count} occurrence(s), found {actual}: {old[:120]!r}")
    p.write_text(text.replace(old, new, count))


def insert_before(path: str, marker: str, content: str) -> None:
    replace(path, marker, content + marker)

# Prisma schema: exact Offering -> CourseSpec version relation.
replace(
    "apps/backend/prisma/schema.prisma",
    '  curriculumPlacements    ProgrammeCurriculumCourse[]       @relation("ProgrammeCurriculumCourseSpecVersion")\n',
    '  curriculumPlacements    ProgrammeCurriculumCourse[]       @relation("ProgrammeCurriculumCourseSpecVersion")\n'
    '  offerings               Offering[]                         @relation("OfferingCourseSpecVersion")\n',
)
replace(
    "apps/backend/prisma/schema.prisma",
    '  courseId       String\n  course         Course         @relation(fields: [courseId], references: [id], onDelete: Cascade)\n',
    '  courseId       String\n  course         Course         @relation(fields: [courseId], references: [id], onDelete: Cascade)\n'
    '  courseSpecId   String?\n  courseSpec     CourseSpec?     @relation("OfferingCourseSpecVersion", fields: [courseSpecId], references: [id], onDelete: Restrict)\n',
)
replace(
    "apps/backend/prisma/schema.prisma",
    '  @@index([lecturerId])\n}\n\nmodel OfferingCoLecturer',
    '  @@index([lecturerId])\n  @@index([courseSpecId])\n}\n\nmodel OfferingCoLecturer',
)

# Shared cross-plugin contract for exact spec versions.
replace(
    "packages/shared-types/src/contracts.ts",
    'export interface LecturerRef {\n',
    'export interface CourseSpecVersionRef {\n'
    '  id: string;\n'
    '  courseId: string;\n'
    '  versionMajor: number;\n'
    '  versionMinor: number;\n'
    '  version: string;\n'
    '  reviewStatus: string;\n'
    '  approvedAt: string | null;\n'
    '  effectiveFrom: string | null;\n'
    '}\n\n'
    'export interface LecturerRef {\n',
)
replace(
    "packages/shared-types/src/contracts.ts",
    'export interface CoursesServiceContract {\n  getById(id: string): Promise<CourseRef | null>;\n  weeklyContactHours(courseId: string): Promise<CourseWeeklyContactHoursRef[]>;\n}\n',
    'export interface CoursesServiceContract {\n'
    '  getById(id: string): Promise<CourseRef | null>;\n'
    '  getCourseSpecVersion(id: string): Promise<CourseSpecVersionRef | null>;\n'
    '  listApprovedSpecVersions(courseId: string): Promise<CourseSpecVersionRef[]>;\n'
    '  weeklyContactHours(courseSpecId: string): Promise<CourseWeeklyContactHoursRef[]>;\n'
    '}\n',
)

# Offering API contract: create must choose a spec; legacy DB field remains nullable.
replace(
    "packages/shared-types/src/offerings.ts",
    'import type { LecturerRef } from "./contracts.ts";',
    'import type { CourseSpecVersionRef, LecturerRef } from "./contracts.ts";',
)
replace(
    "packages/shared-types/src/offerings.ts",
    '  courseId: z.string().uuid("A course is required"),\n',
    '  courseId: z.string().uuid("A course is required"),\n'
    '  courseSpecId: z.string().uuid("An Approved CourseSpec version is required"),\n',
)
replace(
    "packages/shared-types/src/offerings.ts",
    '  course: { id: string; code: string; title: string; programmeId: string } | null;\n',
    '  course: { id: string; code: string; title: string; programmeId: string } | null;\n'
    '  /** Exact approved CourseSpec version used for this delivery. Null only for unresolved legacy rows. */\n'
    '  courseSpec: CourseSpecVersionRef | null;\n',
)

# Courses plugin exposes version refs through its registry contract and API.
replace(
    "apps/backend/src/plugins/courses/service.ts",
    '  type CourseInfoInput,\n',
    '  type CourseInfoInput,\n  type CourseSpecVersionRef,\n',
)
replace(
    "apps/backend/src/plugins/courses/service.ts",
    'const CURRENT_SPEC_ORDER = [\n  { versionMajor: "desc" as const },\n  { versionMinor: "desc" as const },\n];\n',
    'const CURRENT_SPEC_ORDER = [\n  { versionMajor: "desc" as const },\n  { versionMinor: "desc" as const },\n];\n\n'
    'function toCourseSpecVersionRef(spec: {\n'
    '  id: string;\n  courseId: string;\n  versionMajor: number;\n  versionMinor: number;\n'
    '  reviewStatus: string;\n  approvedAt: Date | null;\n  effectiveFrom: Date | null;\n'
    '}): CourseSpecVersionRef {\n'
    '  return {\n'
    '    id: spec.id,\n    courseId: spec.courseId,\n    versionMajor: spec.versionMajor,\n'
    '    versionMinor: spec.versionMinor,\n    version: `${spec.versionMajor}.${spec.versionMinor}`,\n'
    '    reviewStatus: spec.reviewStatus,\n    approvedAt: spec.approvedAt?.toISOString() ?? null,\n'
    '    effectiveFrom: spec.effectiveFrom?.toISOString().slice(0, 10) ?? null,\n'
    '  };\n}\n',
)
replace(
    "apps/backend/src/plugins/courses/service.ts",
    '  // Part of CoursesServiceContract — workload consumers need only scheduled\n  // contact hours, never CourseSpec\'s storage details or self-study time.\n  async weeklyContactHours(courseId: string) {\n    const spec = await prisma.courseSpec.findFirst({\n      where: { courseId },\n      orderBy: CURRENT_SPEC_ORDER,\n',
    '  // Cross-plugin exact-version lookup used by Offerings.\n'
    '  async getCourseSpecVersion(id: string): Promise<CourseSpecVersionRef | null> {\n'
    '    const spec = await prisma.courseSpec.findUnique({\n'
    '      where: { id },\n'
    '      select: { id: true, courseId: true, versionMajor: true, versionMinor: true, reviewStatus: true, approvedAt: true, effectiveFrom: true },\n'
    '    });\n'
    '    return spec ? toCourseSpecVersionRef(spec) : null;\n'
    '  },\n\n'
    '  async listApprovedSpecVersions(courseId: string): Promise<CourseSpecVersionRef[]> {\n'
    '    const specs = await prisma.courseSpec.findMany({\n'
    '      where: { courseId, reviewStatus: "Approved" },\n'
    '      orderBy: CURRENT_SPEC_ORDER,\n'
    '      select: { id: true, courseId: true, versionMajor: true, versionMinor: true, reviewStatus: true, approvedAt: true, effectiveFrom: true },\n'
    '    });\n'
    '    return specs.map(toCourseSpecVersionRef);\n'
    '  },\n\n'
    '  // Part of CoursesServiceContract — workload must use the Offering\'s exact\n'
    '  // bound CourseSpec, never whichever course version is newest today.\n'
    '  async weeklyContactHours(courseSpecId: string) {\n'
    '    const spec = await prisma.courseSpec.findUnique({\n'
    '      where: { id: courseSpecId },\n',
)

# Course endpoint for the Offering form selector.
insert_before(
    "apps/backend/src/plugins/courses/router.ts",
    '  router.get("/:id", requirePermission("courses:read"), async (req, res) => {\n',
    '  router.get(\n'
    '    "/:id/approved-spec-versions",\n'
    '    requirePermission("courses:read"),\n'
    '    async (req, res) => {\n'
    '      const courseId = getRequiredParam(req, res, "id");\n'
    '      if (!courseId) return;\n'
    '      if (!(await ensureCourseAccess(req, res, courseId))) return;\n'
    '      res.json(await courseService.listApprovedSpecVersions(courseId));\n'
    '    },\n'
    '  );\n\n',
)

# Frontend course API.
replace(
    "apps/frontend/lib/courses.ts",
    '  CourseSpecProgress,\n',
    '  CourseSpecProgress,\n  type CourseSpecVersionRef,\n',
)
replace(
    "apps/frontend/lib/courses.ts",
    '  get(id: string): Promise<CourseView> {\n    return api.get<CourseView>(`/api/courses/${id}`);\n  },\n',
    '  get(id: string): Promise<CourseView> {\n    return api.get<CourseView>(`/api/courses/${id}`);\n  },\n'
    '  approvedSpecVersions(id: string): Promise<CourseSpecVersionRef[]> {\n'
    '    return api.get<CourseSpecVersionRef[]>(`/api/courses/${id}/approved-spec-versions`);\n'
    '  },\n',
)

# Offering service: validate via Courses registry, expose exact version, and use exact version for workload.
replace(
    "apps/backend/src/plugins/offerings/service.ts",
    'async function assertLecturersExist(lecturerIds: string[]): Promise<void> {\n',
    'async function assertApprovedCourseSpec(courseId: string, courseSpecId: string): Promise<void> {\n'
    '  const spec = await courses().getCourseSpecVersion(courseSpecId);\n'
    '  if (!spec) throw new ReferenceError("CourseSpec version does not exist");\n'
    '  if (spec.courseId !== courseId) throw new ReferenceError("CourseSpec version belongs to another course");\n'
    '  if (spec.reviewStatus !== "Approved") throw new ReferenceError("Only an Approved CourseSpec version can be assigned to an offering");\n'
    '}\n\n'
    'async function assertLecturersExist(lecturerIds: string[]): Promise<void> {\n',
)
replace(
    "apps/backend/src/plugins/offerings/service.ts",
    '    courseId: string;\n    lecturerId: string | null;\n',
    '    courseId: string;\n    courseSpecId: string | null;\n    lecturerId: string | null;\n',
)
replace(
    "apps/backend/src/plugins/offerings/service.ts",
    '  const [course, enrolledStudents] = await Promise.all([\n    courses().getById(offering.courseId),\n    students().findByIds(offering.enrollments.map((e) => e.studentId)),\n  ]);\n',
    '  const [course, courseSpec, enrolledStudents] = await Promise.all([\n'
    '    courses().getById(offering.courseId),\n'
    '    offering.courseSpecId ? courses().getCourseSpecVersion(offering.courseSpecId) : Promise.resolve(null),\n'
    '    students().findByIds(offering.enrollments.map((e) => e.studentId)),\n'
    '  ]);\n',
)
replace(
    "apps/backend/src/plugins/offerings/service.ts",
    '    course: course\n      ? { id: course.id, code: course.code, title: course.title, programmeId: course.programmeId }\n      : null,\n',
    '    course: course\n      ? { id: course.id, code: course.code, title: course.title, programmeId: course.programmeId }\n      : null,\n'
    '    courseSpec,\n',
)
replace(
    "apps/backend/src/plugins/offerings/service.ts",
    '    if (!(await courses().getById(offeringInput.courseId))) {\n      throw new ReferenceError("Course does not exist");\n    }\n',
    '    if (!(await courses().getById(offeringInput.courseId))) {\n      throw new ReferenceError("Course does not exist");\n    }\n'
    '    await assertApprovedCourseSpec(offeringInput.courseId, offeringInput.courseSpecId);\n',
)
replace(
    "apps/backend/src/plugins/offerings/service.ts",
    '        courseId: offeringInput.courseId,\n        term: offeringInput.term,\n',
    '        courseId: offeringInput.courseId,\n        courseSpecId: offeringInput.courseSpecId,\n        term: offeringInput.term,\n',
)
replace(
    "apps/backend/src/plugins/offerings/service.ts",
    '    if (!existing) throw new ReferenceError("Offering not found");\n    const nextLecturerId = offeringInput.lecturerId !== undefined ? offeringInput.lecturerId : existing.lecturerId;\n',
    '    if (!existing) throw new ReferenceError("Offering not found");\n'
    '    if (offeringInput.courseSpecId !== undefined) {\n'
    '      await assertApprovedCourseSpec(existing.courseId, offeringInput.courseSpecId);\n'
    '      if (existing.courseSpecId && offeringInput.courseSpecId !== existing.courseSpecId) {\n'
    '        const [deadlineCount, resultCount] = await Promise.all([\n'
    '          prisma.offeringAssessmentDeadline.count({ where: { offeringId: id } }),\n'
    '          prisma.assessmentResult.count({ where: { enrollment: { offeringId: id } } }),\n'
    '        ]);\n'
    '        if (existing.status !== "Planned" || deadlineCount > 0 || resultCount > 0) {\n'
    '          throw new ReferenceError("The bound CourseSpec version cannot change after delivery or academic data exists");\n'
    '        }\n'
    '      }\n'
    '    }\n'
    '    const nextLecturerId = offeringInput.lecturerId !== undefined ? offeringInput.lecturerId : existing.lecturerId;\n',
)
replace(
    "apps/backend/src/plugins/offerings/service.ts",
    '          ...(offeringInput.term !== undefined ? { term: offeringInput.term } : {}),\n',
    '          ...(offeringInput.courseSpecId !== undefined ? { courseSpecId: offeringInput.courseSpecId } : {}),\n'
    '          ...(offeringInput.term !== undefined ? { term: offeringInput.term } : {}),\n',
)
replace(
    "apps/backend/src/plugins/offerings/service.ts",
    '        id: true,\n        courseId: true,\n        lecturerId: true,\n',
    '        id: true,\n        courseId: true,\n        courseSpecId: true,\n        lecturerId: true,\n',
)
replace(
    "apps/backend/src/plugins/offerings/service.ts",
    '    const courseData = (courseId: string) => {\n      let cached = courseCache.get(courseId);\n      if (!cached) {\n        cached = Promise.all([\n          courses().getById(courseId),\n          courses().weeklyContactHours(courseId),\n        ]).then(([course, weeks]) => ({ course, weeks }));\n        courseCache.set(courseId, cached);\n      }\n      return cached;\n    };\n',
    '    const courseData = (courseId: string, courseSpecId: string | null) => {\n'
    '      const key = `${courseId}:${courseSpecId ?? "unbound"}`;\n'
    '      let cached = courseCache.get(key);\n'
    '      if (!cached) {\n'
    '        cached = Promise.all([\n'
    '          courses().getById(courseId),\n'
    '          courseSpecId ? courses().weeklyContactHours(courseSpecId) : Promise.resolve([]),\n'
    '        ]).then(([course, weeks]) => ({ course, weeks }));\n'
    '        courseCache.set(key, cached);\n'
    '      }\n'
    '      return cached;\n'
    '    };\n',
)
replace(
    "apps/backend/src/plugins/offerings/service.ts",
    '          const { course, weeks } = await courseData(assignment.courseId);\n',
    '          const { course, weeks } = await courseData(assignment.courseId, assignment.courseSpecId);\n',
)

# Student portal: every lecturer/student read and result write follows Offering.courseSpec.
replace(
    "apps/backend/src/plugins/student-portal/service.ts",
    '      course: {\n        include: {\n          specs: {\n            where: { reviewStatus: "Approved" },\n            orderBy: [{ versionMajor: "desc" }, { versionMinor: "desc" }],\n            take: 1,\n            include: {\n              clos: { orderBy: { order: "asc" as const } },\n              weeks: { orderBy: { order: "asc" as const } },\n              assessmentItems: {\n                orderBy: { order: "asc" as const },\n                include: {\n                  criterionCloMappings: true,\n                  rubric: {\n                    include: { levelRows: { orderBy: { order: "asc" } }, criterionRows: { orderBy: { order: "asc" } } },\n                  },\n                },\n              },\n              resources: { orderBy: { order: "asc" as const } },\n            },\n          },\n        },\n      },\n',
    '      course: true,\n'
    '      courseSpec: {\n'
    '        include: {\n'
    '          clos: { orderBy: { order: "asc" as const } },\n'
    '          weeks: { orderBy: { order: "asc" as const } },\n'
    '          assessmentItems: {\n'
    '            orderBy: { order: "asc" as const },\n'
    '            include: {\n'
    '              criterionCloMappings: true,\n'
    '              rubric: {\n'
    '                include: { levelRows: { orderBy: { order: "asc" } }, criterionRows: { orderBy: { order: "asc" } } },\n'
    '              },\n'
    '            },\n'
    '          },\n'
    '          resources: { orderBy: { order: "asc" as const } },\n'
    '        },\n'
    '      },\n',
)
replace(
    "apps/backend/src/plugins/student-portal/service.ts",
    'function approvedSpec(row: EnrollmentRow) {\n  return row.offering.course.specs[0] ?? null;\n}\n',
    'function approvedSpec(row: EnrollmentRow) {\n  return row.offering.courseSpec ?? null;\n}\n',
)
replace(
    "apps/backend/src/plugins/student-portal/service.ts",
    '  const resultByAssessment = new Map(\n    row.results.map((result) => [result.assessmentItemId, result]),\n  );\n',
    '  const resultByAssessment = new Map(\n'
    '    row.results\n'
    '      .filter((result) => result.courseSpecId === spec?.id)\n'
    '      .map((result) => [result.assessmentItemId, result]),\n'
    '  );\n',
)
replace(
    "apps/backend/src/plugins/student-portal/service.ts",
    '      course: {\n        select: {\n          specs: {\n            where: { reviewStatus: "Approved" },\n            orderBy: [{ versionMajor: "desc" }, { versionMinor: "desc" }],\n            take: 1,\n            select: {\n              id: true,\n              assessmentItems: { select: { id: true } },\n            },\n          },\n        },\n      },\n',
    '      courseSpec: {\n'
    '        select: { id: true, reviewStatus: true, assessmentItems: { select: { id: true } } },\n'
    '      },\n',
)
replace(
    "apps/backend/src/plugins/student-portal/service.ts",
    '        course: {\n          include: {\n            specs: {\n              where: { reviewStatus: "Approved" },\n              orderBy: [{ versionMajor: "desc" }, { versionMinor: "desc" }],\n              take: 1,\n              include: {\n                assessmentItems: {\n                  orderBy: { order: "asc" },\n                  include: {\n                    criterionCloMappings: true,\n                    rubric: { include: { levelRows: { orderBy: { order: "asc" } }, criterionRows: { orderBy: { order: "asc" } } } },\n                  },\n                },\n              },\n            },\n          },\n        },\n',
    '        course: true,\n'
    '        courseSpec: {\n'
    '          include: {\n'
    '            assessmentItems: {\n'
    '              orderBy: { order: "asc" },\n'
    '              include: {\n'
    '                criterionCloMappings: true,\n'
    '                rubric: { include: { levelRows: { orderBy: { order: "asc" } }, criterionRows: { orderBy: { order: "asc" } } } },\n'
    '              },\n'
    '            },\n'
    '          },\n'
    '        },\n',
)
replace(
    "apps/backend/src/plugins/student-portal/service.ts",
    '      const spec = offering.course.specs[0] ?? null;\n',
    '      const spec = offering.courseSpec ?? null;\n',
)
replace(
    "apps/backend/src/plugins/student-portal/service.ts",
    '        offering.assessmentDeadlines.map((deadline) => [deadline.assessmentItemId, deadline.dueAt]),\n',
    '        offering.assessmentDeadlines\n'
    '          .filter((deadline) => deadline.courseSpecId === spec?.id)\n'
    '          .map((deadline) => [deadline.assessmentItemId, deadline.dueAt]),\n',
)
replace(
    "apps/backend/src/plugins/student-portal/service.ts",
    '            course: {\n              include: {\n                specs: {\n                  where: { reviewStatus: "Approved" },\n                  orderBy: [{ versionMajor: "desc" }, { versionMinor: "desc" }],\n                  take: 1,\n                  include: { assessmentItems: true },\n                },\n              },\n            },\n',
    '            courseSpec: { include: { assessmentItems: true } },\n',
)
replace(
    "apps/backend/src/plugins/student-portal/service.ts",
    '    const spec = enrollment.offering.course.specs[0] ?? null;\n',
    '    const spec = enrollment.offering.courseSpec ?? null;\n',
)
replace(
    "apps/backend/src/plugins/student-portal/service.ts",
    '    const spec = offering.course.specs[0] ?? null;\n',
    '    const spec = offering.courseSpec ?? null;\n',
)

# Results lifecycle exact version binding.
replace(
    "apps/backend/src/plugins/student-portal/results-lifecycle.ts",
    '          course: {\n            include: {\n              specs: {\n                where: { reviewStatus: "Approved" },\n                orderBy: [{ versionMajor: "desc" }, { versionMinor: "desc" }],\n                take: 1,\n                include: {\n                  assessmentItems: {\n                    include: {\n                      criterionCloMappings: true,\n                      rubric: { include: { levelRows: true, criterionRows: true } },\n                    },\n                  },\n                },\n              },\n            },\n          },\n',
    '          courseSpec: {\n'
    '            include: {\n'
    '              assessmentItems: {\n'
    '                include: {\n'
    '                  criterionCloMappings: true,\n'
    '                  rubric: { include: { levelRows: true, criterionRows: true } },\n'
    '                },\n'
    '              },\n'
    '            },\n'
    '          },\n',
)
replace(
    "apps/backend/src/plugins/student-portal/results-lifecycle.ts",
    '  const spec = enrollment.offering.course.specs[0] ?? null;\n  if (!spec) throw new PortalNotFoundError("Approved course specification not found");\n',
    '  const spec = enrollment.offering.courseSpec ?? null;\n'
    '  if (!spec) throw new PortalConflictError("Offering is not bound to an Approved CourseSpec version");\n',
)
replace(
    "apps/backend/src/plugins/student-portal/results-lifecycle.ts",
    '      course: {\n        include: {\n          specs: {\n            where: { reviewStatus: "Approved" },\n            orderBy: [{ versionMajor: "desc" }, { versionMinor: "desc" }],\n            take: 1,\n            include: { assessmentItems: true },\n          },\n        },\n      },\n',
    '      courseSpec: { include: { assessmentItems: true } },\n',
)
replace(
    "apps/backend/src/plugins/student-portal/results-lifecycle.ts",
    '  const spec = offering.course.specs[0] ?? null;\n  if (!spec) throw new PortalNotFoundError("Approved course specification not found");\n',
    '  const spec = offering.courseSpec ?? null;\n'
    '  if (!spec) throw new PortalConflictError("Offering is not bound to an Approved CourseSpec version");\n',
)
replace(
    "apps/backend/src/plugins/student-portal/results-lifecycle.ts",
    '        course: {\n          include: {\n            specs: {\n              where: { reviewStatus: "Approved" },\n              orderBy: [{ versionMajor: "desc" }, { versionMinor: "desc" }],\n              take: 1,\n              include: {\n                clos: { orderBy: { order: "asc" } },\n                assessmentItems: {\n                  orderBy: { order: "asc" },\n                  include: { criterionCloMappings: true },\n                },\n              },\n            },\n          },\n        },\n',
    '        course: true,\n'
    '        courseSpec: {\n'
    '          include: {\n'
    '            clos: { orderBy: { order: "asc" } },\n'
    '            assessmentItems: {\n'
    '              orderBy: { order: "asc" },\n'
    '              include: { criterionCloMappings: true },\n'
    '            },\n'
    '          },\n'
    '        },\n',
)
replace(
    "apps/backend/src/plugins/student-portal/results-lifecycle.ts",
    '    const spec = offering.course.specs[0] ?? null;\n    if (!spec) throw new PortalNotFoundError("Approved course specification not found");\n',
    '    const spec = offering.courseSpec ?? null;\n'
    '    if (!spec) throw new PortalConflictError("Offering is not bound to an Approved CourseSpec version");\n',
)

# Offering form: explicit Approved version selector.
replace(
    "apps/frontend/app/(shell)/offerings/offering-form-fields.tsx",
    '  type Lecturer,\n',
    '  type CourseSpecVersionRef,\n  type Lecturer,\n',
)
replace(
    "apps/frontend/app/(shell)/offerings/offering-form-fields.tsx",
    '  courseId: string;\n  term: string;\n',
    '  courseId: string;\n  courseSpecId: string;\n  term: string;\n',
)
replace(
    "apps/frontend/app/(shell)/offerings/offering-form-fields.tsx",
    '  courses: CourseView[];\n  lecturers: Lecturer[];\n',
    '  courses: CourseView[];\n  courseSpecVersions: CourseSpecVersionRef[];\n  courseSpecLoading: boolean;\n  lecturers: Lecturer[];\n',
)
replace(
    "apps/frontend/app/(shell)/offerings/offering-form-fields.tsx",
    '  courses,\n  lecturers,\n',
    '  courses,\n  courseSpecVersions,\n  courseSpecLoading,\n  lecturers,\n',
)
replace(
    "apps/frontend/app/(shell)/offerings/offering-form-fields.tsx",
    '  const lecturerItems: Record<string, string> = {\n',
    '  const courseSpecItems: Record<string, string> = Object.fromEntries(\n'
    '    courseSpecVersions.map((spec) => [spec.id, `Version ${spec.version}`]),\n'
    '  );\n'
    '  const lecturerItems: Record<string, string> = {\n',
)
replace(
    "apps/frontend/app/(shell)/offerings/offering-form-fields.tsx",
    '      </Field>\n      <div className="grid grid-cols-2 gap-3">\n        <Field label="Term" error={errors.term?.message}>\n',
    '      </Field>\n'
    '      <Field label="Approved CourseSpec version" error={errors.courseSpecId?.message}>\n'
    '        <Controller\n'
    '          control={control}\n'
    '          name="courseSpecId"\n'
    '          render={({ field }) => (\n'
    '            <Select\n'
    '              items={courseSpecItems}\n'
    '              value={field.value || null}\n'
    '              onValueChange={(v) => field.onChange(v ?? "")}\n'
    '              disabled={!courseSpecVersions.length || courseSpecLoading}\n'
    '            >\n'
    '              <SelectTrigger className="w-full">\n'
    '                <SelectValue placeholder={courseSpecLoading ? "Loading approved versions…" : "— Select approved version —"} />\n'
    '              </SelectTrigger>\n'
    '              <SelectContent>\n'
    '                {courseSpecVersions.map((spec) => (\n'
    '                  <SelectItem key={spec.id} value={spec.id}>\n'
    '                    Version {spec.version}{spec.effectiveFrom ? ` · effective ${spec.effectiveFrom}` : ""}\n'
    '                  </SelectItem>\n'
    '                ))}\n'
    '              </SelectContent>\n'
    '            </Select>\n'
    '          )}\n'
    '        />\n'
    '        {!courseSpecLoading && courses.length > 0 && courseSpecVersions.length === 0 ? (\n'
    '          <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">This course has no Approved CourseSpec version yet.</p>\n'
    '        ) : null}\n'
    '      </Field>\n'
    '      <div className="grid grid-cols-2 gap-3">\n'
    '        <Field label="Term" error={errors.term?.message}>\n',
)

replace(
    "apps/frontend/app/(shell)/offerings/offering-form-page.tsx",
    '  type Lecturer,\n',
    '  type CourseSpecVersionRef,\n  type Lecturer,\n',
)
replace(
    "apps/frontend/app/(shell)/offerings/offering-form-page.tsx",
    '  courseId: "",\n  term: "",\n',
    '  courseId: "",\n  courseSpecId: "",\n  term: "",\n',
)
replace(
    "apps/frontend/app/(shell)/offerings/offering-form-page.tsx",
    '  const [courses, setCourses] = useState<CourseView[]>([]);\n  const [lecturers, setLecturers] = useState<Lecturer[]>([]);\n',
    '  const [courses, setCourses] = useState<CourseView[]>([]);\n'
    '  const [courseSpecVersions, setCourseSpecVersions] = useState<CourseSpecVersionRef[]>([]);\n'
    '  const [courseSpecLoading, setCourseSpecLoading] = useState(false);\n'
    '  const [lecturers, setLecturers] = useState<Lecturer[]>([]);\n',
)
replace(
    "apps/frontend/app/(shell)/offerings/offering-form-page.tsx",
    '  const lecturerId = useWatch({ control, name: "lecturerId" }) ?? null;\n',
    '  const courseId = useWatch({ control, name: "courseId" }) ?? "";\n'
    '  const lecturerId = useWatch({ control, name: "lecturerId" }) ?? null;\n',
)
replace(
    "apps/frontend/app/(shell)/offerings/offering-form-page.tsx",
    '            courseId: offering.course?.id ?? "",\n            term: offering.term,\n',
    '            courseId: offering.course?.id ?? "",\n            courseSpecId: offering.courseSpec?.id ?? "",\n            term: offering.term,\n',
)
insert_before(
    "apps/frontend/app/(shell)/offerings/offering-form-page.tsx",
    '  const onSubmit = handleSubmit(async (values) => {\n',
    '  useEffect(() => {\n'
    '    let cancelled = false;\n'
    '    if (!courseId) { setCourseSpecVersions([]); return; }\n'
    '    setCourseSpecLoading(true);\n'
    '    void coursesApi.approvedSpecVersions(courseId)\n'
    '      .then((versions) => { if (!cancelled) setCourseSpecVersions(versions); })\n'
    '      .catch(() => { if (!cancelled) setCourseSpecVersions([]); })\n'
    '      .finally(() => { if (!cancelled) setCourseSpecLoading(false); });\n'
    '    return () => { cancelled = true; };\n'
    '  }, [courseId]);\n\n',
)
replace(
    "apps/frontend/app/(shell)/offerings/offering-form-page.tsx",
    '                courses={courses}\n                lecturers={lecturers}\n',
    '                courses={courses}\n                courseSpecVersions={courseSpecVersions}\n                courseSpecLoading={courseSpecLoading}\n                lecturers={lecturers}\n',
)

# CI: execute the new database/historical-drift regression on fresh PostgreSQL.
replace(
    ".github/workflows/ci.yml",
    '      - name: Verify historical attendance correction\n        run: bun test apps/backend/src/plugins/offerings/attendance-service-db.test.ts\n        env:\n          ATTENDANCE_DB_TESTS: "1"\n\n',
    '      - name: Verify historical attendance correction\n'
    '        run: bun test apps/backend/src/plugins/offerings/attendance-service-db.test.ts\n'
    '        env:\n          ATTENDANCE_DB_TESTS: "1"\n\n'
    '      - name: Verify Offering CourseSpec binding and historical result stability\n'
    '        run: bun test apps/backend/src/plugins/offerings/course-spec-binding-db.test.ts\n'
    '        env:\n          OFFERING_COURSE_SPEC_DB_TESTS: "1"\n'
    '          JWT_SECRET: issue-211-course-spec-binding-ci-secret-at-least-32-characters\n\n',
)

migration = r'''-- Issue #211: bind each delivered Offering to one exact approved CourseSpec version.
-- The column stays nullable so deployment is safe for legacy rows whose historical
-- version cannot be proven. Application create/update paths require an explicit
-- approved binding; runtime academic writes fail closed while a legacy row is null.

ALTER TABLE "Offering" ADD COLUMN "courseSpecId" TEXT;
CREATE INDEX "Offering_courseSpecId_idx" ON "Offering"("courseSpecId");
ALTER TABLE "Offering"
  ADD CONSTRAINT "Offering_courseSpecId_fkey"
  FOREIGN KEY ("courseSpecId") REFERENCES "CourseSpec"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill tier 1: authoritative historical evidence. AssessmentResult and
-- OfferingAssessmentDeadline already snapshot the CourseSpec id used when the
-- academic record was written. Bind only when all evidence for an offering agrees
-- on one Approved spec belonging to that offering's course. Conflicting evidence is
-- deliberately left unresolved rather than guessed.
WITH evidence AS (
  SELECT e."offeringId", ar."courseSpecId"
  FROM "AssessmentResult" ar
  INNER JOIN "Enrollment" e ON e."id" = ar."enrollmentId"
  UNION ALL
  SELECT d."offeringId", d."courseSpecId"
  FROM "OfferingAssessmentDeadline" d
), resolved AS (
  SELECT "offeringId", MIN("courseSpecId") AS "courseSpecId"
  FROM evidence
  GROUP BY "offeringId"
  HAVING COUNT(DISTINCT "courseSpecId") = 1
)
UPDATE "Offering" o
SET "courseSpecId" = resolved."courseSpecId"
FROM resolved
INNER JOIN "CourseSpec" cs ON cs."id" = resolved."courseSpecId"
WHERE o."id" = resolved."offeringId"
  AND cs."courseId" = o."courseId"
  AND cs."reviewStatus" = 'Approved';

-- Backfill tier 2: no historical evidence and exactly one Approved CourseSpec for
-- the course. Multiple Approved versions are ambiguous and stay null for explicit
-- administrator repair through the Offering edit form.
WITH evidence_offerings AS (
  SELECT e."offeringId"
  FROM "AssessmentResult" ar
  INNER JOIN "Enrollment" e ON e."id" = ar."enrollmentId"
  UNION
  SELECT d."offeringId" FROM "OfferingAssessmentDeadline" d
), sole_approved AS (
  SELECT "courseId", MIN("id") AS "courseSpecId"
  FROM "CourseSpec"
  WHERE "reviewStatus" = 'Approved'
  GROUP BY "courseId"
  HAVING COUNT(*) = 1
)
UPDATE "Offering" o
SET "courseSpecId" = sole_approved."courseSpecId"
FROM sole_approved
WHERE o."courseId" = sole_approved."courseId"
  AND o."courseSpecId" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM evidence_offerings evidence WHERE evidence."offeringId" = o."id"
  );

CREATE OR REPLACE FUNCTION "validate_offering_course_spec_binding"()
RETURNS TRIGGER AS $$
DECLARE
  spec_course_id TEXT;
  spec_status "CourseSpecReviewStatus";
BEGIN
  IF NEW."courseSpecId" IS NULL THEN
    IF TG_OP = 'UPDATE' AND OLD."courseSpecId" IS NOT NULL THEN
      RAISE EXCEPTION 'An Offering CourseSpec binding cannot be cleared once set';
    END IF;
    RETURN NEW;
  END IF;

  SELECT "courseId", "reviewStatus"
  INTO spec_course_id, spec_status
  FROM "CourseSpec"
  WHERE "id" = NEW."courseSpecId";

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Offering CourseSpec version does not exist';
  END IF;
  IF spec_course_id IS DISTINCT FROM NEW."courseId" THEN
    RAISE EXCEPTION 'Offering CourseSpec version belongs to another course';
  END IF;
  IF spec_status <> 'Approved' THEN
    RAISE EXCEPTION 'Offering may only bind an Approved CourseSpec version';
  END IF;

  IF TG_OP = 'UPDATE'
    AND OLD."courseSpecId" IS NOT NULL
    AND NEW."courseSpecId" IS DISTINCT FROM OLD."courseSpecId"
  THEN
    IF OLD."status" <> 'Planned'
      OR EXISTS (SELECT 1 FROM "OfferingAssessmentDeadline" d WHERE d."offeringId" = OLD."id")
      OR EXISTS (
        SELECT 1
        FROM "AssessmentResult" ar
        INNER JOIN "Enrollment" e ON e."id" = ar."enrollmentId"
        WHERE e."offeringId" = OLD."id"
      )
    THEN
      RAISE EXCEPTION 'Historical Offering CourseSpec binding is immutable after delivery or academic data';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Offering_validate_course_spec_binding"
BEFORE INSERT OR UPDATE OF "courseSpecId" ON "Offering"
FOR EACH ROW EXECUTE FUNCTION "validate_offering_course_spec_binding"();

-- Result/deadline provenance must always agree with the Offering binding. This
-- closes direct-DB/future-code paths that could otherwise write evidence under a
-- newer CourseSpec while the Offering remains bound to its historical version.
CREATE OR REPLACE FUNCTION "enforce_offering_course_spec_on_academic_row"()
RETURNS TRIGGER AS $$
DECLARE
  bound_spec_id TEXT;
BEGIN
  IF TG_TABLE_NAME = 'AssessmentResult' THEN
    SELECT o."courseSpecId"
    INTO bound_spec_id
    FROM "Enrollment" e
    INNER JOIN "Offering" o ON o."id" = e."offeringId"
    WHERE e."id" = NEW."enrollmentId";
  ELSE
    SELECT o."courseSpecId"
    INTO bound_spec_id
    FROM "Offering" o
    WHERE o."id" = NEW."offeringId";
  END IF;

  IF bound_spec_id IS NULL THEN
    RAISE EXCEPTION 'Offering must be bound to an Approved CourseSpec before academic data can be written';
  END IF;
  IF NEW."courseSpecId" IS DISTINCT FROM bound_spec_id THEN
    RAISE EXCEPTION 'Academic record CourseSpec must match the Offering bound CourseSpec version';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AssessmentResult_enforce_offering_course_spec"
BEFORE INSERT OR UPDATE OF "enrollmentId", "courseSpecId" ON "AssessmentResult"
FOR EACH ROW EXECUTE FUNCTION "enforce_offering_course_spec_on_academic_row"();

CREATE TRIGGER "OfferingAssessmentDeadline_enforce_course_spec"
BEFORE INSERT OR UPDATE OF "offeringId", "courseSpecId" ON "OfferingAssessmentDeadline"
FOR EACH ROW EXECUTE FUNCTION "enforce_offering_course_spec_on_academic_row"();
'''
mp = Path("apps/backend/prisma/migrations/20260817070000_bind_offerings_course_spec_versions")
mp.mkdir(parents=True, exist_ok=True)
(mp / "migration.sql").write_text(migration)

# Focused DB regression: approving a newer spec must not drift old lecturer/student reads.
test = r'''import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { prisma } from "../../core/db/prisma.ts";
import { studentPortalService } from "../student-portal/service.ts";
import { resultsLifecycleService } from "../student-portal/results-lifecycle.ts";

process.env.JWT_SECRET ??= "issue-211-course-spec-binding-test-secret-at-least-32-characters";

const runDbTests = process.env.OFFERING_COURSE_SPEC_DB_TESTS === "1";
const dbDescribe = runDbTests ? describe : describe.skip;

async function rejected(operation: () => Promise<unknown>) {
  let didReject = false;
  try { await operation(); } catch { didReject = true; }
  expect(didReject).toBe(true);
}

dbDescribe("Offering exact CourseSpec version integrity", () => {
  test("keeps historical lecturer/student reads on the bound version after a newer approval", async () => {
    const suffix = randomUUID();
    const actor = await prisma.user.findFirstOrThrow({ select: { id: true } });
    const baseSpec = await prisma.courseSpec.findFirstOrThrow({
      where: { reviewStatus: "Approved", assessmentItems: { some: { status: "Active" } } },
      orderBy: [{ versionMajor: "desc" }, { versionMinor: "desc" }],
      include: { course: true, assessmentItems: { where: { status: "Active" }, orderBy: { order: "asc" } } },
    });
    const baseAssessment = baseSpec.assessmentItems[0]!;
    const maxVersion = await prisma.courseSpec.findFirstOrThrow({
      where: { courseId: baseSpec.courseId },
      orderBy: [{ versionMajor: "desc" }, { versionMinor: "desc" }],
      select: { versionMajor: true },
    });
    const futureAssessmentId = `issue-211-future-${suffix}`;
    const newerSpec = await prisma.courseSpec.create({
      data: {
        courseId: baseSpec.courseId,
        versionMajor: maxVersion.versionMajor + 1,
        versionMinor: 0,
        revisionType: "Major",
        revisionTriggers: ["ProgrammeCoordinator"],
        revisionReason: "Issue 211 historical drift regression",
        changeSummary: "Future approved version",
        reviewStatus: "Approved",
        approvedAt: new Date(),
        assessmentItems: {
          create: {
            id: futureAssessmentId,
            order: 0,
            name: "Future-version assessment",
            type: "Exam",
            status: "Active",
            weight: 100,
          },
        },
      },
    });

    const offering = await prisma.offering.create({
      data: {
        courseId: baseSpec.courseId,
        courseSpecId: baseSpec.id,
        lecturerId: actor.id,
        term: `issue211-${suffix}`,
        sectionCode: "A",
        status: "Completed",
      },
    });
    const sharedVersionSection = await prisma.offering.create({
      data: {
        courseId: baseSpec.courseId,
        courseSpecId: baseSpec.id,
        lecturerId: actor.id,
        term: `issue211-${suffix}`,
        sectionCode: "B",
        status: "Planned",
      },
    });
    expect(sharedVersionSection.courseSpecId).toBe(baseSpec.id);

    const studentUser = await prisma.user.create({
      data: { email: `issue211-user-${suffix}@dse.invalid`, name: "Issue 211 Student" },
    });
    const student = await prisma.student.create({
      data: {
        name: "Issue 211 Student",
        email: `issue211-profile-${suffix}@dse.invalid`,
        studentId: `I211-${suffix}`,
        status: "Active",
        userId: studentUser.id,
      },
    });
    const enrollment = await prisma.enrollment.create({
      data: { offeringId: offering.id, studentId: student.id },
    });
    await prisma.assessmentResult.create({
      data: {
        enrollmentId: enrollment.id,
        courseSpecId: baseSpec.id,
        assessmentItemId: baseAssessment.id,
        score: 8,
        maxScore: 10,
        feedback: "Historical v1 result",
        publishedAt: new Date(),
        publishedById: actor.id,
      },
    });

    const studentDetail = await studentPortalService.course(studentUser.id, offering.id);
    expect(studentDetail.assessments.some((item) => item.id === baseAssessment.id)).toBe(true);
    expect(studentDetail.assessments.some((item) => item.id === futureAssessmentId)).toBe(false);
    expect(studentDetail.assessments.find((item) => item.id === baseAssessment.id)?.result?.score).toBe(8);

    const delivery = await studentPortalService.deliveryOfferings(actor.id, true);
    const delivered = delivery.find((item) => item.offeringId === offering.id)!;
    expect(delivered.assessments.some((item) => item.id === baseAssessment.id)).toBe(true);
    expect(delivered.assessments.some((item) => item.id === futureAssessmentId)).toBe(false);

    const review = await resultsLifecycleService.review(actor.id, true, offering.id);
    expect(review.courseSpecId).toBe(baseSpec.id);

    // Historical binding cannot be moved to the newly-approved version.
    await rejected(() => prisma.offering.update({
      where: { id: offering.id },
      data: { courseSpecId: newerSpec.id },
    }));

    // Academic data cannot disagree with the Offering's bound version.
    await rejected(() => prisma.assessmentResult.create({
      data: {
        enrollmentId: enrollment.id,
        courseSpecId: newerSpec.id,
        assessmentItemId: futureAssessmentId,
        score: 9,
        maxScore: 10,
      },
    }));
    await rejected(() => prisma.offeringAssessmentDeadline.create({
      data: {
        offeringId: offering.id,
        courseSpecId: newerSpec.id,
        assessmentItemId: futureAssessmentId,
        dueAt: new Date(),
      },
    }));

    // Cross-course and non-approved bindings fail at the database boundary.
    const otherCourse = await prisma.course.create({
      data: {
        programmeId: baseSpec.course.programmeId,
        code: `I211-${suffix.slice(0, 8)}`,
        title: "Issue 211 Other Course",
      },
    });
    const draftSpec = await prisma.courseSpec.create({
      data: { courseId: otherCourse.id, revisionTriggers: [], reviewStatus: "Draft" },
    });
    await rejected(() => prisma.offering.create({
      data: {
        courseId: otherCourse.id,
        courseSpecId: draftSpec.id,
        term: `issue211-draft-${suffix}`,
        sectionCode: "A",
      },
    }));
    await rejected(() => prisma.offering.create({
      data: {
        courseId: otherCourse.id,
        courseSpecId: baseSpec.id,
        term: `issue211-cross-${suffix}`,
        sectionCode: "A",
      },
    }));
  });
});
'''
Path("apps/backend/src/plugins/offerings/course-spec-binding-db.test.ts").write_text(test)

# Remove temporary patch machinery from the resulting tree.
Path("scripts/issue-211-apply.py").unlink(missing_ok=True)
Path(".github/workflows/issue-211-apply.yml").unlink(missing_ok=True)
