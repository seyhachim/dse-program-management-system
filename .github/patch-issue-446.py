from pathlib import Path


def replace(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"expected text not found in {path}: {old[:120]!r}")
    p.write_text(text.replace(old, new, 1))


def write(path: str, content: str) -> None:
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content)


# Shared contract -----------------------------------------------------------------
replace(
    "packages/shared-types/src/courses.ts",
    "export type ListCoursesQuery = z.infer<typeof ListCoursesQuery>;\n",
    '''export type ListCoursesQuery = z.infer<typeof ListCoursesQuery>;\n\nexport const SetCourseSpecResponsibleLecturersInputSchema = z.object({\n  lecturerIds: z\n    .array(z.string().uuid())\n    .max(20, \"A Course Specification can have at most 20 responsible lecturers\")\n    .refine((ids) => new Set(ids).size === ids.length, {\n      message: \"Responsible lecturers must be unique\",\n    }),\n});\nexport type SetCourseSpecResponsibleLecturersInput = z.infer<\n  typeof SetCourseSpecResponsibleLecturersInputSchema\n>;\n\nexport type CourseSpecResponsibleLecturerRef = {\n  id: string;\n  name: string;\n  email: string;\n};\n\nexport type CourseSpecResponsibleLecturersView = {\n  courseId: string;\n  courseSpecId: string | null;\n  academicVersion: string;\n  reviewStatus: string;\n  lecturers: CourseSpecResponsibleLecturerRef[];\n};\n''',
)

write(
    "packages/shared-types/src/courses.test.ts",
    '''import { describe, expect, test } from "bun:test";\nimport { SetCourseSpecResponsibleLecturersInputSchema } from "./courses.ts";\n\ndescribe("Course Spec responsible lecturers contract", () => {\n  test("accepts multiple unique responsible lecturers", () => {\n    const result = SetCourseSpecResponsibleLecturersInputSchema.safeParse({\n      lecturerIds: [\n        "11111111-1111-4111-8111-111111111111",\n        "22222222-2222-4222-8222-222222222222",\n      ],\n    });\n    expect(result.success).toBe(true);\n  });\n\n  test("rejects duplicate responsible lecturers", () => {\n    const id = "11111111-1111-4111-8111-111111111111";\n    const result = SetCourseSpecResponsibleLecturersInputSchema.safeParse({\n      lecturerIds: [id, id],\n    });\n    expect(result.success).toBe(false);\n  });\n});\n''',
)

# Prisma --------------------------------------------------------------------------
replace(
    "apps/backend/prisma/schema.prisma",
    '  courseSpecSubmissions            CourseSpec[]                     @relation("CourseSpecSubmittedBy")\n',
    '  courseSpecSubmissions            CourseSpec[]                     @relation("CourseSpecSubmittedBy")\n  courseSpecResponsibilities          CourseSpecResponsibleLecturer[]   @relation("CourseSpecResponsibleLecturer")\n',
)
replace(
    "apps/backend/prisma/schema.prisma",
    '  reviewActions        CourseSpecReviewAction[]\n',
    '  reviewActions        CourseSpecReviewAction[]\n  responsibleLecturers CourseSpecResponsibleLecturer[]\n',
)
replace(
    "apps/backend/prisma/schema.prisma",
    'model CourseSpecCourseInfo {\n',
    '''model CourseSpecResponsibleLecturer {\n  courseSpecId String\n  courseSpec   CourseSpec @relation(fields: [courseSpecId], references: [id], onDelete: Cascade)\n  lecturerId   String\n  lecturer     User       @relation("CourseSpecResponsibleLecturer", fields: [lecturerId], references: [id], onDelete: Restrict)\n  createdAt    DateTime   @default(now())\n\n  @@id([courseSpecId, lecturerId])\n  @@index([lecturerId])\n}\n\nmodel CourseSpecCourseInfo {\n''',
)
write(
    "apps/backend/prisma/migrations/20260819194500_add_course_spec_responsible_lecturers/migration.sql",
    '''CREATE TABLE "CourseSpecResponsibleLecturer" (\n    "courseSpecId" TEXT NOT NULL,\n    "lecturerId" TEXT NOT NULL,\n    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,\n\n    CONSTRAINT "CourseSpecResponsibleLecturer_pkey" PRIMARY KEY ("courseSpecId","lecturerId")\n);\n\nCREATE INDEX "CourseSpecResponsibleLecturer_lecturerId_idx" ON "CourseSpecResponsibleLecturer"("lecturerId");\n\nALTER TABLE "CourseSpecResponsibleLecturer"\nADD CONSTRAINT "CourseSpecResponsibleLecturer_courseSpecId_fkey"\nFOREIGN KEY ("courseSpecId") REFERENCES "CourseSpec"("id") ON DELETE CASCADE ON UPDATE CASCADE;\n\nALTER TABLE "CourseSpecResponsibleLecturer"\nADD CONSTRAINT "CourseSpecResponsibleLecturer_lecturerId_fkey"\nFOREIGN KEY ("lecturerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;\n''',
)

# Backend responsibility service --------------------------------------------------
write(
    "apps/backend/src/plugins/courses/responsible-lecturers.ts",
    '''import type {\n  CourseSpecResponsibleLecturersView,\n  LecturersServiceContract,\n  SetCourseSpecResponsibleLecturersInput,\n} from "@dse-pms/shared-types";\nimport { prisma } from "../../core/db/prisma.ts";\nimport { registry } from "../../core/plugins/registry.ts";\nimport {\n  buildCourseInfoSnapshot,\n  courseInfoSnapshotData,\n} from "./course-info-snapshot.ts";\nimport { assertCourseSpecEditable } from "./spec-lock.ts";\n\nconst CURRENT_SPEC_ORDER = [\n  { versionMajor: "desc" as const },\n  { versionMinor: "desc" as const },\n];\n\nfunction lecturers(): LecturersServiceContract {\n  return registry.get<LecturersServiceContract>("lecturers").service;\n}\n\nexport async function courseIdsForResponsibleLecturer(\n  lecturerId: string,\n): Promise<string[]> {\n  const courses = await prisma.course.findMany({\n    select: {\n      id: true,\n      specs: {\n        orderBy: CURRENT_SPEC_ORDER,\n        take: 1,\n        select: {\n          responsibleLecturers: {\n            where: { lecturerId },\n            select: { lecturerId: true },\n          },\n        },\n      },\n    },\n  });\n  return courses\n    .filter((course) => (course.specs[0]?.responsibleLecturers.length ?? 0) > 0)\n    .map((course) => course.id);\n}\n\nexport async function getCourseSpecResponsibleLecturers(\n  courseId: string,\n): Promise<CourseSpecResponsibleLecturersView | null> {\n  const course = await prisma.course.findUnique({\n    where: { id: courseId },\n    select: { id: true },\n  });\n  if (!course) return null;\n\n  const spec = await prisma.courseSpec.findFirst({\n    where: { courseId },\n    orderBy: CURRENT_SPEC_ORDER,\n    select: {\n      id: true,\n      versionMajor: true,\n      versionMinor: true,\n      reviewStatus: true,\n      responsibleLecturers: {\n        orderBy: { lecturer: { name: "asc" } },\n        select: {\n          lecturer: { select: { id: true, name: true, email: true } },\n        },\n      },\n    },\n  });\n\n  return {\n    courseId,\n    courseSpecId: spec?.id ?? null,\n    academicVersion: spec ? `${spec.versionMajor}.${spec.versionMinor}` : "1.0",\n    reviewStatus: spec?.reviewStatus ?? "Draft",\n    lecturers: spec?.responsibleLecturers.map((row) => row.lecturer) ?? [],\n  };\n}\n\nexport async function setCourseSpecResponsibleLecturers(\n  courseId: string,\n  input: SetCourseSpecResponsibleLecturersInput,\n): Promise<CourseSpecResponsibleLecturersView> {\n  const course = await prisma.course.findUnique({ where: { id: courseId } });\n  if (!course) throw new Error("Course not found");\n\n  for (const lecturerId of input.lecturerIds) {\n    const lecturer = await lecturers().getById(lecturerId);\n    if (!lecturer) throw new Error("Assigned responsible lecturer does not exist");\n  }\n\n  let spec = await prisma.courseSpec.findFirst({\n    where: { courseId },\n    orderBy: CURRENT_SPEC_ORDER,\n    select: { id: true, reviewStatus: true },\n  });\n\n  if (!spec) {\n    const snapshot = await buildCourseInfoSnapshot(course);\n    spec = await prisma.courseSpec.create({\n      data: {\n        courseId,\n        courseInfo: { create: courseInfoSnapshotData(snapshot) },\n      },\n      select: { id: true, reviewStatus: true },\n    });\n  } else {\n    assertCourseSpecEditable(spec.reviewStatus);\n  }\n\n  await prisma.$transaction([\n    prisma.courseSpecResponsibleLecturer.deleteMany({\n      where: { courseSpecId: spec.id },\n    }),\n    prisma.courseSpecResponsibleLecturer.createMany({\n      data: input.lecturerIds.map((lecturerId) => ({\n        courseSpecId: spec!.id,\n        lecturerId,\n      })),\n    }),\n  ]);\n\n  return (await getCourseSpecResponsibleLecturers(courseId))!;\n}\n''',
)
write(
    "apps/backend/src/plugins/courses/responsible-lecturers.test.ts",
    '''import { expect, test } from "bun:test";\n\n// Regression guard for the core equality model: responsibility is membership,\n// not owner/co-author rank. The DB primary key prevents duplicate membership.\ntest("responsible lecturer membership has no role hierarchy", async () => {\n  const schema = await Bun.file(\n    new URL("../../../prisma/schema.prisma", import.meta.url),\n  ).text();\n  expect(schema).toContain("model CourseSpecResponsibleLecturer");\n  expect(schema).toContain("@@id([courseSpecId, lecturerId])");\n  expect(schema).not.toContain("CourseSpecResponsibleLecturerRole");\n});\n''',
)

# Course service: union offering access with current Course Spec responsibility. ----
replace(
    "apps/backend/src/plugins/courses/service.ts",
    'import { assertCourseSpecEditable } from "./spec-lock.ts";\n',
    '''import { assertCourseSpecEditable } from "./spec-lock.ts";\nimport {\n  courseIdsForResponsibleLecturer,\n  getCourseSpecResponsibleLecturers,\n  setCourseSpecResponsibleLecturers,\n} from "./responsible-lecturers.ts";\n''',
)
replace(
    "apps/backend/src/plugins/courses/service.ts",
    '''/**\n * Courses a lecturer was actually offered — the non-admin list/dashboard scope.\n * Deliberately Offering-based only: `Course.lecturerId` is just the course\n * record's default/on-file lecturer and does not by itself grant visibility —\n * a lecturer must be assigned to a real Offering of the course to see it.\n */\nasync function ownerScopeFilter(lecturerScope: string) {\n  return { id: { in: await offerings().courseIdsForLecturer(lecturerScope) } };\n}\n''',
    '''/**\n * Non-admin course scope includes both teaching assignments and responsibility\n * for the current Course Specification. This intentionally lets lecturers\n * prepare v1 before an Offering exists while keeping Course.lecturerId from\n * acting as an implicit authorization grant.\n */\nasync function ownerScopeFilter(lecturerScope: string) {\n  const [offeringCourseIds, responsibleCourseIds] = await Promise.all([\n    offerings().courseIdsForLecturer(lecturerScope),\n    courseIdsForResponsibleLecturer(lecturerScope),\n  ]);\n  return {\n    id: { in: [...new Set([...offeringCourseIds, ...responsibleCourseIds])] },\n  };\n}\n''',
)
replace(
    "apps/backend/src/plugins/courses/service.ts",
    '''  /**\n   * May the given lecturer see/edit this course? True only when they were\n   * offered it (assigned to teach an Offering of it) — backs the router's\n   * per-course access guard.\n   */\n  async lecturerCanAccess(\n    courseId: string,\n    lecturerId: string,\n  ): Promise<boolean> {\n    return (await offerings().courseIdsForLecturer(lecturerId)).includes(\n      courseId,\n    );\n  },\n''',
    '''  /**\n   * May the lecturer access this course? Teaching an Offering OR being a\n   * Responsible Lecturer on the current Course Spec grants access.\n   */\n  async lecturerCanAccess(\n    courseId: string,\n    lecturerId: string,\n  ): Promise<boolean> {\n    const [offeringCourseIds, responsibleCourseIds] = await Promise.all([\n      offerings().courseIdsForLecturer(lecturerId),\n      courseIdsForResponsibleLecturer(lecturerId),\n    ]);\n    return offeringCourseIds.includes(courseId) || responsibleCourseIds.includes(courseId);\n  },\n\n  getResponsibleLecturers(courseId: string) {\n    return getCourseSpecResponsibleLecturers(courseId);\n  },\n\n  setResponsibleLecturers(\n    courseId: string,\n    input: import("@dse-pms/shared-types").SetCourseSpecResponsibleLecturersInput,\n  ) {\n    return setCourseSpecResponsibleLecturers(courseId, input);\n  },\n''',
)

# Router --------------------------------------------------------------------------
replace(
    "apps/backend/src/plugins/courses/router.ts",
    '  SPEC_SECTION_SCHEMAS,\n',
    '  SPEC_SECTION_SCHEMAS,\n  SetCourseSpecResponsibleLecturersInputSchema,\n',
)
replace(
    "apps/backend/src/plugins/courses/router.ts",
    '''  // ---------------------------------------------------------------------------\n  // Submit Course Specification\n  // ---------------------------------------------------------------------------\n''',
    '''  // ---------------------------------------------------------------------------\n  // Responsible Lecturers (version-specific, equal responsibility)\n  // ---------------------------------------------------------------------------\n\n  router.get(\n    "/:id/spec/responsible-lecturers",\n    requirePermission("courses:read"),\n    async (req, res) => {\n      const courseId = getRequiredParam(req, res, "id");\n      if (!courseId) return;\n      if (!(await ensureCourseAccess(req, res, courseId))) return;\n      const result = await courseService.getResponsibleLecturers(courseId);\n      if (!result) {\n        res.status(404).json({ error: "Course not found" });\n        return;\n      }\n      res.json(result);\n    },\n  );\n\n  router.put(\n    "/:id/spec/responsible-lecturers",\n    requirePermission("courses:manage"),\n    async (req, res) => {\n      const courseId = getRequiredParam(req, res, "id");\n      if (!courseId) return;\n      if (!(await ensureCourseAccess(req, res, courseId))) return;\n      const parsed = SetCourseSpecResponsibleLecturersInputSchema.safeParse(req.body);\n      if (!parsed.success) {\n        res.status(400).json({\n          error: "Invalid responsible lecturer assignment",\n          details: parsed.error.flatten(),\n        });\n        return;\n      }\n      try {\n        res.json(await courseService.setResponsibleLecturers(courseId, parsed.data));\n      } catch (err) {\n        res.status(errStatus(err)).json({\n          error: err instanceof Error ? err.message : "Could not assign responsible lecturers",\n        });\n      }\n    },\n  );\n\n  // ---------------------------------------------------------------------------\n  // Submit Course Specification\n  // ---------------------------------------------------------------------------\n''',
)

# Revision copy-forward -------------------------------------------------------------
replace(
    "apps/backend/src/plugins/courses/revision-service.ts",
    '''  weekProjectProgress: true,\n} satisfies Prisma.CourseSpecInclude;\n''',
    '''  weekProjectProgress: true,\n  responsibleLecturers: true,\n} satisfies Prisma.CourseSpecInclude;\n''',
)
replace(
    "apps/backend/src/plugins/courses/revision-service.ts",
    '''  const cloIdMap = new Map(source.clos.map((row) => [row.id, randomUUID()]));\n''',
    '''  if (source.responsibleLecturers.length > 0) {\n    await tx.courseSpecResponsibleLecturer.createMany({\n      data: source.responsibleLecturers.map((row) => ({\n        courseSpecId: targetCourseSpecId,\n        lecturerId: row.lecturerId,\n      })),\n    });\n  }\n\n  const cloIdMap = new Map(source.clos.map((row) => [row.id, randomUUID()]));\n''',
)

# Frontend -------------------------------------------------------------------------
replace(
    "apps/frontend/app/(shell)/courses/course-form-page.tsx",
    '''      if (courseId) await coursesApi.update(courseId, payload);\n      else await coursesApi.create(payload);\n      router.push(BACK_HREF);\n''',
    '''      if (courseId) {\n        await coursesApi.update(courseId, payload);\n        router.push(BACK_HREF);\n      } else {\n        const created = await coursesApi.create(payload);\n        router.push(`/courses/${created.id}/spec/responsible-lecturers`);\n      }\n''',
)
replace(
    "apps/frontend/app/(shell)/courses/courses-client.tsx",
    'import { FileText } from "lucide-react";\n',
    'import { FileText, Users } from "lucide-react";\n',
)
replace(
    "apps/frontend/app/(shell)/courses/courses-client.tsx",
    '''          {\n            key: "syllabus",\n            label: canReview ? "Open Specification" : "Syllabus",\n            icon: <FileText className="mr-1 h-3.5 w-3.5" />,\n            onClick: (c) => router.push(canReview ? `/courses/${c.id}/spec?tab=reviewSubmit` : `/courses/${c.id}/spec`),\n          },\n        ]}\n''',
    '''          {\n            key: "syllabus",\n            label: canReview ? "Open Specification" : "Syllabus",\n            icon: <FileText className="mr-1 h-3.5 w-3.5" />,\n            onClick: (c) => router.push(canReview ? `/courses/${c.id}/spec?tab=reviewSubmit` : `/courses/${c.id}/spec`),\n          },\n          ...(canManage\n            ? [{\n                key: "responsible-lecturers",\n                label: "Responsible Lecturers",\n                icon: <Users className="mr-1 h-3.5 w-3.5" />,\n                onClick: (c: CourseView) =>\n                  router.push(`/courses/${c.id}/spec/responsible-lecturers`),\n              }]\n            : []),\n        ]}\n''',
)
write(
    "apps/frontend/app/(shell)/courses/[id]/spec/responsible-lecturers/page.tsx",
    '''import { Topbar } from "../../../../topbar";\nimport { ResponsibleLecturersClient } from "./responsible-lecturers-client";\n\nexport default async function ResponsibleLecturersPage({\n  params,\n}: {\n  params: Promise<{ id: string }>;\n}) {\n  const { id } = await params;\n  return (\n    <>\n      <Topbar\n        title="Responsible Lecturers"\n        subtitle="Assign equal responsibility for the current Course Specification version."\n      />\n      <main className="flex-1 overflow-y-auto p-6">\n        <ResponsibleLecturersClient courseId={id} />\n      </main>\n    </>\n  );\n}\n''',
)
write(
    "apps/frontend/app/(shell)/courses/[id]/spec/responsible-lecturers/responsible-lecturers-client.tsx",
    '''"use client";\n\nimport Link from "next/link";\nimport { useEffect, useMemo, useState } from "react";\nimport type {\n  CourseSpecResponsibleLecturersView,\n  Lecturer,\n} from "@dse-pms/shared-types";\nimport { Button } from "@dse-pms/ui";\nimport { ApiError, api } from "@/lib/api";\nimport { lecturersApi } from "@/lib/lecturers";\n\nconst EDITABLE = new Set(["Draft", "ChangesRequested"]);\n\nexport function ResponsibleLecturersClient({ courseId }: { courseId: string }) {\n  const [lecturers, setLecturers] = useState<Lecturer[]>([]);\n  const [view, setView] = useState<CourseSpecResponsibleLecturersView | null>(null);\n  const [selected, setSelected] = useState<Set<string>>(new Set());\n  const [loading, setLoading] = useState(true);\n  const [saving, setSaving] = useState(false);\n  const [error, setError] = useState<string | null>(null);\n  const [saved, setSaved] = useState(false);\n\n  useEffect(() => {\n    let cancelled = false;\n    void Promise.all([\n      lecturersApi.list(),\n      api.get<CourseSpecResponsibleLecturersView>(\n        `/api/courses/${courseId}/spec/responsible-lecturers`,\n      ),\n    ])\n      .then(([lecturerList, assignment]) => {\n        if (cancelled) return;\n        setLecturers(lecturerList);\n        setView(assignment);\n        setSelected(new Set(assignment.lecturers.map((lecturer) => lecturer.id)));\n      })\n      .catch((err) => {\n        if (!cancelled) {\n          setError(err instanceof ApiError ? err.message : "Could not load responsible lecturers");\n        }\n      })\n      .finally(() => {\n        if (!cancelled) setLoading(false);\n      });\n    return () => {\n      cancelled = true;\n    };\n  }, [courseId]);\n\n  const editable = !view || EDITABLE.has(view.reviewStatus);\n  const selectedNames = useMemo(\n    () => lecturers.filter((lecturer) => selected.has(lecturer.id)).map((lecturer) => lecturer.name),\n    [lecturers, selected],\n  );\n\n  const toggle = (id: string) => {\n    setSaved(false);\n    setSelected((current) => {\n      const next = new Set(current);\n      if (next.has(id)) next.delete(id);\n      else next.add(id);\n      return next;\n    });\n  };\n\n  const save = async () => {\n    setSaving(true);\n    setError(null);\n    setSaved(false);\n    try {\n      const next = await api.put<CourseSpecResponsibleLecturersView>(\n        `/api/courses/${courseId}/spec/responsible-lecturers`,\n        { lecturerIds: [...selected] },\n      );\n      setView(next);\n      setSelected(new Set(next.lecturers.map((lecturer) => lecturer.id)));\n      setSaved(true);\n    } catch (err) {\n      setError(err instanceof ApiError ? err.message : "Could not save responsible lecturers");\n    } finally {\n      setSaving(false);\n    }\n  };\n\n  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;\n\n  return (\n    <div className="mx-auto max-w-3xl space-y-4">\n      <div className="flex items-center justify-between gap-3">\n        <Button variant="outline" nativeButton={false} render={<Link href="/courses" />}>\n          Back to Courses\n        </Button>\n        <Button variant="outline" nativeButton={false} render={<Link href={`/courses/${courseId}/spec`} />}>\n          Open Course Specification\n        </Button>\n      </div>\n\n      <section className="rounded-xl border bg-card p-6">\n        <div className="flex flex-wrap items-start justify-between gap-3">\n          <div>\n            <h2 className="text-lg font-semibold">Course Spec v{view?.academicVersion ?? "1.0"}</h2>\n            <p className="mt-1 text-sm text-muted-foreground">\n              Every selected lecturer has the same responsibility: edit Draft / Changes Requested, submit, and resubmit. Approval stays with the Head of Program review role.\n            </p>\n          </div>\n          <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium">\n            {view?.reviewStatus ?? "Draft"}\n          </span>\n        </div>\n\n        {!editable ? (\n          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">\n            Responsible lecturers are locked while this version is in review or approved. Create a revision to change the team.\n          </p>\n        ) : null}\n\n        {error ? (\n          <p className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>\n        ) : null}\n        {saved ? (\n          <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">\n            Responsible lecturers saved.\n          </p>\n        ) : null}\n\n        <div className="mt-5 space-y-2">\n          {lecturers.map((lecturer) => (\n            <label key={lecturer.id} className="flex cursor-pointer items-center gap-3 rounded-lg border p-3">\n              <input\n                type="checkbox"\n                checked={selected.has(lecturer.id)}\n                disabled={!editable}\n                onChange={() => toggle(lecturer.id)}\n                className="h-4 w-4"\n              />\n              <span className="min-w-0">\n                <span className="block text-sm font-medium">{lecturer.name}</span>\n                <span className="block truncate text-xs text-muted-foreground">{lecturer.email}</span>\n              </span>\n            </label>\n          ))}\n          {lecturers.length === 0 ? (\n            <p className="text-sm text-muted-foreground">No lecturers are available to assign.</p>\n          ) : null}\n        </div>\n\n        <div className="mt-5 border-t pt-4">\n          <p className="text-xs text-muted-foreground">\n            Selected: {selectedNames.length ? selectedNames.join(", ") : "None"}\n          </p>\n          <div className="mt-3 flex justify-end">\n            <Button onClick={save} disabled={!editable || saving}>\n              {saving ? "Saving…" : "Save Responsible Lecturers"}\n            </Button>\n          </div>\n        </div>\n      </section>\n    </div>\n  );\n}\n''',
)

print("issue 446 patch applied")
