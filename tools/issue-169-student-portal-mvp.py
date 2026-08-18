from __future__ import annotations

from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")


def replace_once(path: str, old: str, new: str) -> None:
    text = read(path)
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"Expected exactly one match in {path}, found {count}: {old[:100]!r}")
    write(path, text.replace(old, new, 1))


# Shared Student Portal contract: assessment overview, rubric detail, deadline semantics,
# and the authenticated document-download payload.
path = "packages/shared-types/src/student-portal.ts"
text = read(path)
text = text.replace(
    'export interface PortalAssessmentResult {\n',
    '''export interface PortalRubricCriterion {\n  id: string;\n  name: string;\n  cloCodes: string[];\n  levels: Array<{ id: string; label: string; points: number }>;\n}\n\nexport interface PortalAssessmentResult {\n''',
    1,
)
text = text.replace(
    '    rubricName: string;\n    result: PortalAssessmentResult | null;\n',
    '    rubricName: string;\n    rubricCriteria?: PortalRubricCriterion[];\n    result: PortalAssessmentResult | null;\n',
    1,
)
marker = '''export interface StudentPortalHome {\n  student: { id: string; name: string; studentId: string; email: string };\n  courses: PortalCourseSummary[];\n  upcomingAssessments: Array<{\n    offeringId: string;\n    courseCode: string;\n    assessmentId: string;\n    name: string;\n    dueAt: string | null;\n    dueWeek: number | null;\n    weight: number | null;\n  }>;\n  announcements: PortalAnnouncement[];\n  overallAchievement: number | null;\n}\n'''
addition = marker + '''\nexport const STUDENT_PORTAL_TIME_ZONE = "Asia/Phnom_Penh" as const;\n\nexport interface PortalAssessmentOverview {\n  offeringId: string;\n  courseCode: string;\n  courseTitle: string;\n  sectionCode: string;\n  term: string;\n  assessmentId: string;\n  name: string;\n  type: string;\n  description: string;\n  mode: "individual" | "group";\n  cloCodes: string[];\n  weight: number | null;\n  dueAt: string | null;\n  dueWeek: number | null;\n  format: string;\n  submissionMethod: string;\n  instructions: string;\n  rubricName: string;\n  rubricCriteria: PortalRubricCriterion[];\n}\n\nexport interface PortalCourseDocumentDownload {\n  fileName: string;\n  contentType: "text/html; charset=utf-8";\n  content: string;\n}\n\nexport type PortalAssessmentDeadlineState = "overdue" | "upcoming" | "week-only" | "unscheduled";\n\nexport function portalAssessmentDeadlineState(\n  assessment: Pick<PortalAssessmentOverview, "dueAt" | "dueWeek">,\n  now = new Date(),\n): PortalAssessmentDeadlineState {\n  if (assessment.dueAt) {\n    return new Date(assessment.dueAt).getTime() < now.getTime() ? "overdue" : "upcoming";\n  }\n  return assessment.dueWeek !== null ? "week-only" : "unscheduled";\n}\n\nexport function comparePortalAssessmentDeadlines(\n  left: Pick<PortalAssessmentOverview, "dueAt" | "dueWeek" | "courseCode" | "name">,\n  right: Pick<PortalAssessmentOverview, "dueAt" | "dueWeek" | "courseCode" | "name">,\n): number {\n  if (left.dueAt && right.dueAt) {\n    const exact = left.dueAt.localeCompare(right.dueAt);\n    if (exact !== 0) return exact;\n  } else if (left.dueAt) {\n    return -1;\n  } else if (right.dueAt) {\n    return 1;\n  } else if (left.dueWeek !== null && right.dueWeek !== null) {\n    const week = left.dueWeek - right.dueWeek;\n    if (week !== 0) return week;\n  } else if (left.dueWeek !== null) {\n    return -1;\n  } else if (right.dueWeek !== null) {\n    return 1;\n  }\n\n  const course = left.courseCode.localeCompare(right.courseCode);\n  return course !== 0 ? course : left.name.localeCompare(right.name);\n}\n'''
if marker not in text:
    raise RuntimeError("StudentPortalHome marker not found")
text = text.replace(marker, addition, 1)
write(path, text)

# Student navigation now exposes the dedicated assessment overview.
replace_once(
    "packages/shared-types/src/plugins.ts",
    '  version: "0.1.0",\n  description: "Enrolled courses, schedule, approved learning information, results, and feedback.",\n  routes: [\n    { label: "Home", path: "/portal", icon: "home", roles: ["student"] },\n    { label: "My Courses", path: "/portal/courses", icon: "book", roles: ["student"], group: "Learning" },\n    { label: "Schedule", path: "/portal/schedule", icon: "calendar", roles: ["student"], group: "Learning" },\n    { label: "Results", path: "/portal/results", icon: "chart", roles: ["student"], group: "Progress" },',
    '  version: "0.2.0",\n  description: "Enrolled courses, schedule, approved learning information, assessments, results, and feedback.",\n  routes: [\n    { label: "Home", path: "/portal", icon: "home", roles: ["student"] },\n    { label: "My Courses", path: "/portal/courses", icon: "book", roles: ["student"], group: "Learning" },\n    { label: "Schedule", path: "/portal/schedule", icon: "calendar", roles: ["student"], group: "Learning" },\n    { label: "Assessments", path: "/portal/assessments", icon: "file-check", roles: ["student"], group: "Learning" },\n    { label: "Results", path: "/portal/results", icon: "chart", roles: ["student"], group: "Progress" },',
)
replace_once(
    "packages/shared-types/src/plugins.ts",
    ' * `roles` on each entry follows the per-role sidebars proposed in issue #101\n',
    ' * `roles` on each entry follows the per-role sidebars proposed in issue #101\n',
)
# Remove a now-stale sentence without changing placeholder behavior.
path = "packages/shared-types/src/plugins.ts"
text = read(path)
text = text.replace(
    ' * `Users`/`Settings`/`Audit Trail` are system administration and stay\n * admin-only, matching the role-comparison table (§18). `student` isn\'t\n * listed anywhere here — there\'s no student portal built yet, so it (like\n * every other unlisted role) only ever sees the unrestricted footer entry.\n',
    ' * `Users`/`Settings`/`Audit Trail` are system administration and stay\n * admin-only, matching the role-comparison table (§18). Student navigation is\n * provided separately by `studentPortalManifest`; these placeholders remain\n * restricted to the programme roles listed below.\n',
    1,
)
write(path, text)

# Shared navigation regression: the student shell must never expose staff-only routes.
path = "packages/shared-types/src/plugins.test.ts"
text = read(path)
append = '''\n\ntest("Student Portal navigation contains the complete MVP and excludes staff workspaces", () => {\n  const paths = navForRole(pluginManifests, ["student"]).map((route) => route.path);\n\n  for (const path of [\n    "/portal",\n    "/portal/courses",\n    "/portal/schedule",\n    "/portal/assessments",\n    "/portal/results",\n    "/portal/announcements",\n  ]) {\n    expect(paths).toContain(path);\n  }\n\n  for (const path of [\n    "/dashboard",\n    "/courses",\n    "/offerings",\n    "/students",\n    "/lecturer-overview",\n    "/course-delivery",\n    "/assessment-management",\n    "/programme-management",\n    "/users",\n    "/settings",\n  ]) {\n    expect(paths).not.toContain(path);\n  }\n});\n'''
if 'Student Portal navigation contains the complete MVP' not in text:
    write(path, text.rstrip() + append)

# Shared deadline behavior tests.
write(
    "packages/shared-types/src/student-portal.test.ts",
    '''import { expect, test } from "bun:test";\nimport {\n  comparePortalAssessmentDeadlines,\n  portalAssessmentDeadlineState,\n  type PortalAssessmentOverview,\n} from "./student-portal.ts";\n\nfunction assessment(\n  name: string,\n  dueAt: string | null,\n  dueWeek: number | null,\n): PortalAssessmentOverview {\n  return {\n    offeringId: "offering",\n    courseCode: "PAN202",\n    courseTitle: "Predictive Analytics",\n    sectionCode: "A",\n    term: "2026-S2",\n    assessmentId: name,\n    name,\n    type: "Project",\n    description: "",\n    mode: "individual",\n    cloCodes: ["CLO1"],\n    weight: 20,\n    dueAt,\n    dueWeek,\n    format: "",\n    submissionMethod: "",\n    instructions: "",\n    rubricName: "",\n    rubricCriteria: [],\n  };\n}\n\ntest("assessment deadline state distinguishes overdue, upcoming, week-only, and missing deadlines", () => {\n  const now = new Date("2026-08-18T00:00:00.000Z");\n  expect(portalAssessmentDeadlineState(assessment("late", "2026-08-17T23:59:59.000Z", null), now)).toBe("overdue");\n  expect(portalAssessmentDeadlineState(assessment("soon", "2026-08-18T00:00:00.000Z", null), now)).toBe("upcoming");\n  expect(portalAssessmentDeadlineState(assessment("week", null, 12), now)).toBe("week-only");\n  expect(portalAssessmentDeadlineState(assessment("missing", null, null), now)).toBe("unscheduled");\n});\n\ntest("assessment ordering prefers exact deadlines, then configured weeks, then unscheduled items", () => {\n  const rows = [\n    assessment("No deadline", null, null),\n    assessment("Week 10", null, 10),\n    assessment("Later exact", "2026-08-20T02:00:00.000Z", null),\n    assessment("Earlier exact", "2026-08-19T02:00:00.000Z", null),\n    assessment("Week 4", null, 4),\n  ].sort(comparePortalAssessmentDeadlines);\n\n  expect(rows.map((row) => row.name)).toEqual([\n    "Earlier exact",\n    "Later exact",\n    "Week 4",\n    "Week 10",\n    "No deadline",\n  ]);\n});\n''',
)

# Backend document builder: generated only after the service has enforced student + enrollment + approved-spec access.
write(
    "apps/backend/src/plugins/student-portal/course-document.ts",
    '''import type { PortalCourseDetail, PortalCourseDocumentDownload } from "@dse-pms/shared-types";\n\nfunction escapeHtml(value: string): string {\n  return value.replace(/[&<>"']/g, (char) => ({\n    "&": "&amp;",\n    "<": "&lt;",\n    ">": "&gt;",\n    '"': "&quot;",\n    "'": "&#039;",\n  })[char]!);\n}\n\nfunction fileSafe(value: string): string {\n  const safe = value.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");\n  return safe || "course";\n}\n\nfunction section(title: string, content: string): string {\n  return `<section><h2>${escapeHtml(title)}</h2>${content}</section>`;\n}\n\nexport function buildPortalCourseDocument(course: PortalCourseDetail): PortalCourseDocumentDownload {\n  const learningOutcomes = course.clos.map((item) =>\n    `<article><strong>${escapeHtml(item.code)}</strong> ${escapeHtml(item.description)}<div class="meta">${escapeHtml(item.mappedPlos.join(", "))}</div></article>`,\n  ).join("");\n  const weeklyPlan = course.weeks.map((item) =>\n    `<article><strong>Week ${item.week}: ${escapeHtml(item.topic)}</strong><div class="meta">${escapeHtml(item.cloCodes.join(", "))}</div></article>`,\n  ).join("");\n  const assessments = course.assessments.map((item) => {\n    const criteria = (item.rubricCriteria ?? []).map((criterion) =>\n      `<li><strong>${escapeHtml(criterion.name)}</strong>${criterion.cloCodes.length ? ` <span class="meta">(${escapeHtml(criterion.cloCodes.join(", "))})</span>` : ""}</li>`,\n    ).join("");\n    return `<article><strong>${escapeHtml(item.name)}</strong> — ${item.weight ?? "TBA"}%<p>${escapeHtml(item.description)}</p>${item.instructions ? `<p><strong>Instructions:</strong> ${escapeHtml(item.instructions)}</p>` : ""}${item.rubricName ? `<h3>Rubric: ${escapeHtml(item.rubricName)}</h3>${criteria ? `<ul>${criteria}</ul>` : ""}` : ""}</article>`;\n  }).join("");\n  const resources = course.resources.map((item) =>\n    `<li>${escapeHtml(item.title || item.resourceType)}${item.url ? ` — ${escapeHtml(item.url)}` : ""}</li>`,\n  ).join("");\n\n  const content = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(course.code)} Course Specification</title><style>body{font:15px/1.55 Arial,sans-serif;max-width:900px;margin:40px auto;padding:0 24px;color:#18212f}header{border-bottom:3px solid #185a9d;padding-bottom:16px}h1{margin:0}h2{margin-top:32px;color:#185a9d}article{border:1px solid #d9e0e7;border-radius:10px;padding:14px;margin:10px 0}.meta{color:#667085}ul{padding-left:20px}@media print{body{margin:0;max-width:none}}</style></head><body><header><p class="meta">Approved course specification · ${escapeHtml(course.term)} · Section ${escapeHtml(course.sectionCode)}</p><h1>${escapeHtml(course.code)} — ${escapeHtml(course.title)}</h1><p>${escapeHtml(course.description ?? "")}</p></header>${section("Course learning outcomes", learningOutcomes)}${section("Weekly plan", weeklyPlan)}${section("Assessment plan", assessments)}${section("Learning resources", `<ul>${resources}</ul>`)}<footer><p class="meta">Downloaded from DSE Program Management System</p></footer></body></html>`;\n\n  return {\n    fileName: `${fileSafe(course.code)}-approved-course-specification.html`,\n    contentType: "text/html; charset=utf-8",\n    content,\n  };\n}\n''',
)

write(
    "apps/backend/src/plugins/student-portal/course-document.test.ts",
    '''import { expect, test } from "bun:test";\nimport type { PortalCourseDetail } from "@dse-pms/shared-types";\nimport { buildPortalCourseDocument } from "./course-document.ts";\n\nconst fixture = {\n  offeringId: "offering", enrollmentId: "enrollment", courseId: "course", code: "PAN202",\n  title: "Predictive <Analytics>", description: "Approved & safe", credits: 3, term: "2026-S2", sectionCode: "A",\n  lecturer: null, coLecturers: [], meetings: [], specAvailable: true, nextAssessment: null,\n  clos: [{ code: "CLO1", description: "Build models", level: "C3", mappedPlos: ["PLO1"] }],\n  weeks: [{ id: "week", week: 1, topic: "Introduction", cloCodes: ["CLO1"], learningOutcomes: [], activities: [] }],\n  assessments: [{\n    id: "assessment", name: "Project", type: "Project", description: "Build a model", mode: "individual",\n    cloCodes: ["CLO1"], weight: 40, countsTowardGrade: true, courseGradeWeight: 40, dueAt: null, dueWeek: 8,\n    format: "Notebook", submissionMethod: "PMS", instructions: "Do <not> paste secrets", rubricName: "Project rubric",\n    rubricCriteria: [{ id: "criterion", name: "Method", cloCodes: ["CLO1"], levels: [] }], result: null,\n  }],\n  resources: [{ id: "resource", resourceType: "Reference", title: "Guide", url: "https://example.com/?a=1&b=2", notes: "" }],\n  totalCourseGrade: null, courseGradeComplete: false, completedGradeWeight: 0, configuredGradeWeight: 40,\n  achievements: [], overallAchievement: null, feedbackSubmitted: false,\n} satisfies PortalCourseDetail;\n\ntest("approved course document has a stable filename/content type and escapes student-visible content", () => {\n  const document = buildPortalCourseDocument(fixture);\n  expect(document.fileName).toBe("PAN202-approved-course-specification.html");\n  expect(document.contentType).toBe("text/html; charset=utf-8");\n  expect(document.content).toContain("Predictive &lt;Analytics&gt;");\n  expect(document.content).toContain("Approved &amp; safe");\n  expect(document.content).toContain("Do &lt;not&gt; paste secrets");\n  expect(document.content).toContain("Project rubric");\n  expect(document.content).not.toContain("<script");\n});\n''',
)

# Backend service hardening + assessment/document reads.
path = "apps/backend/src/plugins/student-portal/service.ts"
text = read(path)
text = text.replace(
    '  PortalAnnouncement,\n  PortalCloAchievement,\n  PortalCourseDetail,\n  PortalCourseSummary,\n',
    '  comparePortalAssessmentDeadlines,\n  PortalAnnouncement,\n  PortalAssessmentOverview,\n  PortalCloAchievement,\n  PortalCourseDetail,\n  PortalCourseDocumentDownload,\n  PortalCourseSummary,\n',
    1,
)
text = text.replace(
    'import { calculateCloEvidence, calculateCourseGrade } from "./assessment-calculation.ts";\n',
    'import { calculateCloEvidence, calculateCourseGrade } from "./assessment-calculation.ts";\nimport { buildPortalCourseDocument } from "./course-document.ts";\n',
    1,
)
text = text.replace(
    'function approvedSpec(row: EnrollmentRow) {\n  return row.offering.courseSpec ?? null;\n}\n',
    'function approvedSpec(row: EnrollmentRow) {\n  const spec = row.offering.courseSpec;\n  return spec?.reviewStatus === "Approved" ? spec : null;\n}\n',
    1,
)
text = text.replace(
    '          rubricName: item.rubric?.name ?? "",\n          result: result && result.publishedAt\n',
    '''          rubricName: item.rubric?.name ?? "",\n          rubricCriteria: (item.rubric?.criterionRows ?? []).map((criterion) => ({\n            id: criterion.id,\n            name: criterion.name,\n            cloCodes: item.criterionCloMappings\n              .filter((mapping) => mapping.rubricId === item.rubricId && mapping.criterionId === criterion.id)\n              .map((mapping) => mapping.cloCode),\n            levels: (item.rubric?.levelRows ?? []).map((level) => ({\n              id: level.id,\n              label: level.label,\n              points: level.points,\n            })),\n          })),\n          result: result && result.publishedAt\n''',
    1,
)
old_announcements = '''function announcementsFrom(rows: EnrollmentRow[]): PortalAnnouncement[] {\n  return rows.flatMap((row) => row.offering.announcements.map((announcement) => ({\n    id: announcement.id,\n    offeringId: row.offeringId,\n    courseCode: row.offering.course.code,\n    courseTitle: row.offering.course.title,\n    sectionCode: row.offering.sectionCode,\n    title: announcement.title,\n    body: announcement.body,\n    pinned: announcement.pinned,\n    authorName: announcement.author.name,\n    publishedAt: announcement.publishedAt!.toISOString(),\n  }))).sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.publishedAt.localeCompare(a.publishedAt));\n}\n'''
new_announcements = '''function announcementsFrom(rows: EnrollmentRow[]): PortalAnnouncement[] {\n  const now = Date.now();\n  return rows.flatMap((row) => row.offering.announcements\n    .filter((announcement) =>\n      announcement.publishedAt !== null &&\n      announcement.publishedAt.getTime() <= now &&\n      (announcement.expiresAt === null || announcement.expiresAt.getTime() > now),\n    )\n    .map((announcement) => ({\n      id: announcement.id,\n      offeringId: row.offeringId,\n      courseCode: row.offering.course.code,\n      courseTitle: row.offering.course.title,\n      sectionCode: row.offering.sectionCode,\n      title: announcement.title,\n      body: announcement.body,\n      pinned: announcement.pinned,\n      authorName: announcement.author.name,\n      publishedAt: announcement.publishedAt!.toISOString(),\n    }))).sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.publishedAt.localeCompare(a.publishedAt));\n}\n\nasync function detailForStudent(userId: string, offeringId: string): Promise<PortalCourseDetail> {\n  const rows = await enrolledRows(userId);\n  const row = rows.find((item) => item.offeringId === offeringId);\n  if (!row) throw new PortalNotFoundError("Enrolled course not found");\n  return toDetail(row, userId);\n}\n'''
if old_announcements not in text:
    raise RuntimeError("announcementsFrom block not found")
text = text.replace(old_announcements, new_announcements, 1)
old_methods = '''  async courses(userId: string): Promise<PortalCourseSummary[]> {\n    return (await enrolledRows(userId)).map(toSummary);\n  },\n\n  async course(userId: string, offeringId: string): Promise<PortalCourseDetail> {\n    const rows = await enrolledRows(userId);\n    const row = rows.find((item) => item.offeringId === offeringId);\n    if (!row) throw new PortalNotFoundError("Enrolled course not found");\n    return toDetail(row, userId);\n  },\n'''
new_methods = '''  async courses(userId: string): Promise<PortalCourseSummary[]> {\n    return (await enrolledRows(userId)).map(toSummary);\n  },\n\n  async assessments(userId: string): Promise<PortalAssessmentOverview[]> {\n    const rows = await enrolledRows(userId);\n    const details = await Promise.all(rows.map((row) => toDetail(row, userId)));\n    return details.flatMap((course) => course.assessments.map((assessment) => ({\n      offeringId: course.offeringId,\n      courseCode: course.code,\n      courseTitle: course.title,\n      sectionCode: course.sectionCode,\n      term: course.term,\n      assessmentId: assessment.id,\n      name: assessment.name,\n      type: assessment.type,\n      description: assessment.description,\n      mode: assessment.mode,\n      cloCodes: assessment.cloCodes,\n      weight: assessment.weight,\n      dueAt: assessment.dueAt,\n      dueWeek: assessment.dueWeek,\n      format: assessment.format,\n      submissionMethod: assessment.submissionMethod,\n      instructions: assessment.instructions,\n      rubricName: assessment.rubricName,\n      rubricCriteria: assessment.rubricCriteria ?? [],\n    }))).sort(comparePortalAssessmentDeadlines);\n  },\n\n  async course(userId: string, offeringId: string): Promise<PortalCourseDetail> {\n    return detailForStudent(userId, offeringId);\n  },\n\n  async courseDocument(userId: string, offeringId: string): Promise<PortalCourseDocumentDownload> {\n    const detail = await detailForStudent(userId, offeringId);\n    if (!detail.specAvailable) throw new PortalNotFoundError("Approved course specification not found");\n    return buildPortalCourseDocument(detail);\n  },\n'''
if old_methods not in text:
    raise RuntimeError("service course methods block not found")
text = text.replace(old_methods, new_methods, 1)
write(path, text)

# Student routes for the new read surfaces.
path = "apps/backend/src/plugins/student-portal/router.ts"
text = read(path)
text = text.replace(
    '''  router.get("/courses", requirePermission("student-portal:read"), async (req, res) => {\n    try { res.json(await studentPortalService.courses(req.user!.id)); } catch (error) { handleError(error, res); }\n  });\n''',
    '''  router.get("/courses", requirePermission("student-portal:read"), async (req, res) => {\n    try { res.json(await studentPortalService.courses(req.user!.id)); } catch (error) { handleError(error, res); }\n  });\n  router.get("/assessments", requirePermission("student-portal:read"), async (req, res) => {\n    try { res.json(await studentPortalService.assessments(req.user!.id)); } catch (error) { handleError(error, res); }\n  });\n''',
    1,
)
text = text.replace(
    '''  router.get("/announcements", requirePermission("student-portal:read"), async (req, res) => {\n    try { res.json(await studentPortalService.announcements(req.user!.id)); } catch (error) { handleError(error, res); }\n  });\n''',
    '''  router.get("/announcements", requirePermission("student-portal:read"), async (req, res) => {\n    try { res.json(await studentPortalService.announcements(req.user!.id)); } catch (error) { handleError(error, res); }\n  });\n  router.get("/courses/:offeringId/document", requirePermission("student-portal:read"), async (req, res) => {\n    try { res.json(await studentPortalService.courseDocument(req.user!.id, req.params.offeringId!)); } catch (error) { handleError(error, res); }\n  });\n''',
    1,
)
write(path, text)

# Backend DB regression for identity/enrollment/document/announcement privacy boundaries.
write(
    "apps/backend/src/plugins/student-portal/portal-mvp-db.test.ts",
    '''import { describe, expect, test } from "bun:test";\nimport { randomUUID } from "node:crypto";\nimport { prisma } from "../../core/db/prisma.ts";\nimport { PortalAccessError, PortalNotFoundError, studentPortalService } from "./service.ts";\n\nconst runDbTests = process.env.STUDENT_PORTAL_MVP_DB_TESTS === "1";\nconst dbDescribe = runDbTests ? describe : describe.skip;\n\ndbDescribe("Student Portal MVP authorization and publication boundaries", () => {\n  test("scopes reads/downloads to the active student enrollment and hides future/expired announcements", async () => {\n    const suffix = randomUUID();\n    const lecturer = await prisma.user.create({\n      data: { email: `portal-mvp-lecturer-${suffix}@dse.invalid`, name: "Portal MVP Lecturer" },\n    });\n    const studentUser = await prisma.user.create({\n      data: { email: `portal-mvp-student-${suffix}@dse.invalid`, name: "Portal MVP Student" },\n    });\n    const otherUser = await prisma.user.create({\n      data: { email: `portal-mvp-other-${suffix}@dse.invalid`, name: "Portal MVP Other Student" },\n    });\n\n    const spec = await prisma.courseSpec.findFirstOrThrow({\n      where: { reviewStatus: "Approved" },\n      orderBy: [{ versionMajor: "desc" }, { versionMinor: "desc" }],\n      select: { id: true, courseId: true },\n    });\n    const offering = await prisma.offering.create({\n      data: {\n        courseId: spec.courseId,\n        courseSpecId: spec.id,\n        lecturerId: lecturer.id,\n        term: `portal-mvp-${suffix}`,\n        sectionCode: `MVP-${suffix.slice(0, 8)}`,\n        capacity: 10,\n        status: "Active",\n      },\n    });\n    const student = await prisma.student.create({\n      data: {\n        userId: studentUser.id,\n        name: "Portal MVP Student",\n        email: studentUser.email,\n        studentId: `MVP-S-${suffix}`,\n        status: "Active",\n      },\n    });\n    const otherStudent = await prisma.student.create({\n      data: {\n        userId: otherUser.id,\n        name: "Portal MVP Other",\n        email: otherUser.email,\n        studentId: `MVP-O-${suffix}`,\n        status: "Active",\n      },\n    });\n    await prisma.enrollment.create({ data: { offeringId: offering.id, studentId: student.id } });\n\n    const now = Date.now();\n    await prisma.courseAnnouncement.createMany({\n      data: [\n        { offeringId: offering.id, authorId: lecturer.id, title: "Visible", body: "Visible now", publishedAt: new Date(now - 60_000) },\n        { offeringId: offering.id, authorId: lecturer.id, title: "Future", body: "Not yet", publishedAt: new Date(now + 86_400_000) },\n        { offeringId: offering.id, authorId: lecturer.id, title: "Expired", body: "Expired", publishedAt: new Date(now - 86_400_000), expiresAt: new Date(now - 60_000) },\n      ],\n    });\n\n    try {\n      const courses = await studentPortalService.courses(studentUser.id);\n      expect(courses.map((course) => course.offeringId)).toEqual([offering.id]);\n\n      const detail = await studentPortalService.course(studentUser.id, offering.id);\n      expect(detail.specAvailable).toBe(true);\n\n      const document = await studentPortalService.courseDocument(studentUser.id, offering.id);\n      expect(document.fileName).toContain("approved-course-specification.html");\n      expect(document.contentType).toBe("text/html; charset=utf-8");\n\n      await expect(studentPortalService.course(otherUser.id, offering.id)).rejects.toBeInstanceOf(PortalNotFoundError);\n      await expect(studentPortalService.courseDocument(otherUser.id, offering.id)).rejects.toBeInstanceOf(PortalNotFoundError);\n\n      const announcements = await studentPortalService.announcements(studentUser.id);\n      expect(announcements.map((announcement) => announcement.title)).toEqual(["Visible"]);\n\n      await prisma.student.update({ where: { id: student.id }, data: { status: "Inactive" } });\n      await expect(studentPortalService.courses(studentUser.id)).rejects.toBeInstanceOf(PortalAccessError);\n    } finally {\n      await prisma.offering.delete({ where: { id: offering.id } }).catch(() => undefined);\n      await prisma.student.deleteMany({ where: { id: { in: [student.id, otherStudent.id] } } });\n      await prisma.user.deleteMany({ where: { id: { in: [lecturer.id, studentUser.id, otherUser.id] } } });\n    }\n  });\n});\n''',
)

# Make the DB authorization regression an explicit CI gate.
path = ".github/workflows/ci.yml"
text = read(path)
needle = '''      - name: Verify provisional result access and finalized-result visibility\n        run: bun test apps/backend/src/plugins/student-portal/result-access-policy-db.test.ts\n        env:\n          RESULT_ACCESS_POLICY_DB_TESTS: "1"\n          JWT_SECRET: pr-289-result-access-ci-secret-at-least-32-characters\n\n'''
replacement = needle + '''      - name: Verify Student Portal MVP authorization and publication boundaries\n        run: bun test apps/backend/src/plugins/student-portal/portal-mvp-db.test.ts\n        env:\n          STUDENT_PORTAL_MVP_DB_TESTS: "1"\n          JWT_SECRET: issue-169-student-portal-ci-secret-at-least-32-characters\n\n'''
if needle not in text:
    raise RuntimeError("CI insertion point not found")
write(path, text.replace(needle, replacement, 1))

# Frontend API: explicit timezone and authenticated JSON download payload.
path = "apps/frontend/lib/student-portal.ts"
text = read(path)
text = text.replace(
    '''  PortalAnnouncement,\n  PortalCourseDetail,\n  PortalCourseSummary,\n  StudentPortalHome,\n''',
    '''  PortalAnnouncement,\n  PortalAssessmentOverview,\n  PortalCourseDetail,\n  PortalCourseDocumentDownload,\n  PortalCourseSummary,\n  STUDENT_PORTAL_TIME_ZONE,\n  StudentPortalHome,\n''',
    1,
)
text = text.replace(
    '''  course: (offeringId: string) =>\n    api.get<PortalCourseDetail>(`/api/student-portal/courses/${offeringId}`),\n  announcements: () =>\n''',
    '''  course: (offeringId: string) =>\n    api.get<PortalCourseDetail>(`/api/student-portal/courses/${offeringId}`),\n  assessments: () =>\n    api.get<PortalAssessmentOverview[]>("/api/student-portal/assessments"),\n  courseDocument: (offeringId: string) =>\n    api.get<PortalCourseDocumentDownload>(`/api/student-portal/courses/${offeringId}/document`),\n  announcements: () =>\n''',
    1,
)
text = text.replace(
    '''    return new Intl.DateTimeFormat(undefined, {\n      dateStyle: "medium",\n      timeStyle: "short",\n    }).format(new Date(dueAt));\n''',
    '''    return `${new Intl.DateTimeFormat(undefined, {\n      dateStyle: "medium",\n      timeStyle: "short",\n      timeZone: STUDENT_PORTAL_TIME_ZONE,\n    }).format(new Date(dueAt))} (Cambodia time)`;\n''',
    1,
)
text += '''\nexport async function downloadApprovedCourseDocument(offeringId: string): Promise<void> {\n  const document = await studentPortalApi.courseDocument(offeringId);\n  const blob = new Blob([document.content], { type: document.contentType });\n  const url = URL.createObjectURL(blob);\n  try {\n    const anchor = window.document.createElement("a");\n    anchor.href = url;\n    anchor.download = document.fileName;\n    anchor.click();\n  } finally {\n    URL.revokeObjectURL(url);\n  }\n}\n'''
write(path, text)

# Dedicated mobile-first assessment dashboard.
write(
    "apps/frontend/app/(shell)/portal/assessments/page.tsx",
    '''import { Topbar } from "../../topbar";\nimport { PortalAssessments } from "./portal-assessments";\n\nexport default function PortalAssessmentsPage() {\n  return (\n    <>\n      <Topbar title="Assessments" subtitle="Deadlines, grading weights, instructions, and rubrics" />\n      <main className="flex-1 overflow-y-auto p-4 md:p-6">\n        <PortalAssessments />\n      </main>\n    </>\n  );\n}\n''',
)

write(
    "apps/frontend/app/(shell)/portal/assessments/portal-assessments.tsx",
    '''"use client";\n\nimport { useCallback } from "react";\nimport Link from "next/link";\nimport { AlertTriangle, CalendarClock, CheckCircle2, ClipboardList } from "lucide-react";\nimport {\n  STUDENT_PORTAL_TIME_ZONE,\n  portalAssessmentDeadlineState,\n  type PortalAssessmentDeadlineState,\n  type PortalAssessmentOverview,\n} from "@dse-pms/shared-types";\nimport { assessmentDeadline, studentPortalApi } from "@/lib/student-portal";\nimport { EmptyState, PortalError, PortalLoading, usePortalData } from "../portal-state";\n\nconst labels: Record<PortalAssessmentDeadlineState, string> = {\n  overdue: "Overdue",\n  upcoming: "Upcoming",\n  "week-only": "Week scheduled",\n  unscheduled: "Deadline pending",\n};\n\nexport function PortalAssessments() {\n  const load = useCallback(() => studentPortalApi.assessments(), []);\n  const { data, loading, error } = usePortalData(load);\n  if (loading) return <PortalLoading />;\n  if (error || !data) return <PortalError message={error ?? "Could not load assessments"} />;\n  if (!data.length) {\n    return <EmptyState title="No published assessments" description="Approved assessment plans from your enrolled courses will appear here." />;\n  }\n\n  const now = new Date();\n  const groups: PortalAssessmentDeadlineState[] = ["overdue", "upcoming", "week-only", "unscheduled"];\n  return (\n    <div className="mx-auto max-w-6xl space-y-5">\n      <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">\n        Exact dates and times are shown in <strong className="text-foreground">Asia/Phnom_Penh (Cambodia time)</strong>.\n        Week-only deadlines are shown separately until an exact date is published.\n      </div>\n      {groups.map((state) => {\n        const items = data.filter((item) => portalAssessmentDeadlineState(item, now) === state);\n        if (!items.length) return null;\n        return <AssessmentGroup key={state} state={state} items={items} />;\n      })}\n      <p className="text-xs text-muted-foreground">Timezone: {STUDENT_PORTAL_TIME_ZONE}</p>\n    </div>\n  );\n}\n\nfunction AssessmentGroup({ state, items }: { state: PortalAssessmentDeadlineState; items: PortalAssessmentOverview[] }) {\n  const Icon = state === "overdue" ? AlertTriangle : state === "upcoming" ? CalendarClock : state === "week-only" ? ClipboardList : CheckCircle2;\n  return (\n    <section aria-labelledby={`assessment-${state}`} className="space-y-3">\n      <div className="flex items-center gap-2">\n        <Icon className="h-5 w-5 text-primary" aria-hidden="true" />\n        <h2 id={`assessment-${state}`} className="text-lg font-semibold">{labels[state]}</h2>\n        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{items.length}</span>\n      </div>\n      <div className="grid gap-3">\n        {items.map((item) => <AssessmentCard key={`${item.offeringId}:${item.assessmentId}`} item={item} state={state} />)}\n      </div>\n    </section>\n  );\n}\n\nfunction AssessmentCard({ item, state }: { item: PortalAssessmentOverview; state: PortalAssessmentDeadlineState }) {\n  return (\n    <article className="rounded-2xl border border-border bg-card p-4 md:p-5">\n      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">\n        <div>\n          <div className="flex flex-wrap gap-2 text-xs">\n            <span className="rounded bg-primary/10 px-2 py-1 font-semibold text-primary">{item.courseCode}</span>\n            <span className="rounded bg-muted px-2 py-1">Section {item.sectionCode}</span>\n            <span className="rounded bg-muted px-2 py-1">{item.type}</span>\n          </div>\n          <h3 className="mt-2 text-base font-semibold">{item.name}</h3>\n          <p className="text-sm text-muted-foreground">{item.courseTitle}</p>\n        </div>\n        <div className="sm:text-right">\n          <p className={state === "overdue" ? "text-sm font-semibold text-destructive" : "text-sm font-semibold"}>{assessmentDeadline(item.dueAt, item.dueWeek)}</p>\n          <p className="mt-1 text-xs text-muted-foreground">{item.weight === null ? "Weight TBA" : `${item.weight}% of course grade`}</p>\n        </div>\n      </div>\n\n      {item.description ? <p className="mt-3 text-sm text-muted-foreground">{item.description}</p> : null}\n      {item.instructions ? <div className="mt-3 rounded-xl bg-muted/40 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Instructions</p><p className="mt-1 text-sm">{item.instructions}</p></div> : null}\n\n      <div className="mt-3 flex flex-wrap gap-1">\n        {item.cloCodes.map((code) => <span key={code} className="rounded bg-muted px-2 py-1 text-xs">{code}</span>)}\n      </div>\n\n      {item.rubricName ? (\n        <details className="mt-4 rounded-xl border border-border p-3">\n          <summary className="cursor-pointer text-sm font-semibold">Rubric · {item.rubricName}</summary>\n          <div className="mt-3 space-y-2">\n            {item.rubricCriteria.length ? item.rubricCriteria.map((criterion) => (\n              <div key={criterion.id} className="rounded-lg bg-muted/40 p-3">\n                <p className="text-sm font-medium">{criterion.name}</p>\n                {criterion.cloCodes.length ? <p className="mt-1 text-xs text-muted-foreground">{criterion.cloCodes.join(", ")}</p> : null}\n                {criterion.levels.length ? <div className="mt-2 flex flex-wrap gap-1">{criterion.levels.map((level) => <span key={level.id} className="rounded bg-background px-2 py-1 text-xs">{level.label} · {level.points} pts</span>)}</div> : null}\n              </div>\n            )) : <p className="text-sm text-muted-foreground">Rubric criteria are not available yet.</p>}\n          </div>\n        </details>\n      ) : null}\n\n      <div className="mt-4">\n        <Link href={`/portal/courses/${item.offeringId}`} className="text-sm font-medium text-primary hover:underline">View course details</Link>\n      </div>\n    </article>\n  );\n}\n''',
)

# Course detail: use the authenticated backend document payload; show rubric criteria and weighted course contribution.
path = "apps/frontend/app/(shell)/portal/courses/[offeringId]/portal-course.tsx"
text = read(path)
text = text.replace(
    'import { assessmentDeadline, meetingLabel, studentPortalApi } from "@/lib/student-portal";',
    'import { assessmentDeadline, downloadApprovedCourseDocument, meetingLabel, studentPortalApi } from "@/lib/student-portal";',
    1,
)
text = text.replace(
    '  const [feedbackOpen, setFeedbackOpen] = useState(false);\n',
    '  const [feedbackOpen, setFeedbackOpen] = useState(false);\n  const [downloadError, setDownloadError] = useState<string | null>(null);\n',
    1,
)
text = text.replace(
    '<Button onClick={() => downloadCourseDocument(data)} disabled={!data.specAvailable}><Download />Download approved document</Button>',
    '<Button onClick={() => { setDownloadError(null); void downloadApprovedCourseDocument(offeringId).catch((reason) => setDownloadError(reason instanceof Error ? reason.message : "Could not download course document")); }} disabled={!data.specAvailable}><Download />Download approved document</Button>',
    1,
)
text = text.replace(
    '    </section>\n    {!data.specAvailable ?',
    '    </section>\n    {downloadError ? <p role="alert" className="text-sm text-destructive">{downloadError}</p> : null}\n    {!data.specAvailable ?',
    1,
)
text = text.replace(
    '{item.rubricName ? <p className="mt-3 text-sm text-muted-foreground">Rubric: <span className="font-medium text-foreground">{item.rubricName}</span></p> : null}',
    '{item.instructions ? <div className="mt-3 rounded-lg bg-muted/40 p-3 text-sm"><span className="font-medium">Instructions:</span> {item.instructions}</div> : null}<AssessmentRubric assessment={item} />',
    1,
)
old_results = '{data.assessments.filter((item) => item.result).map((item) => <div key={item.id} className="flex items-center justify-between rounded-xl bg-muted/40 p-4"><div><p className="font-medium">{item.name}</p><p className="text-xs text-muted-foreground">{item.result?.feedback || "No written feedback"}</p></div><p className="text-lg font-bold">{item.result?.score}/{item.result?.maxScore}</p></div>)}'
new_results = '{data.assessments.filter((item) => item.result).map((item) => <div key={item.id} className="flex flex-col justify-between gap-3 rounded-xl bg-muted/40 p-4 sm:flex-row sm:items-center"><div><p className="font-medium">{item.name}</p><p className="text-xs text-muted-foreground">{item.result?.feedback || "No written feedback"}</p>{item.result?.weightedCourseContribution !== null && item.result?.weightedCourseContribution !== undefined ? <p className="mt-1 text-xs text-muted-foreground">Weighted course contribution: <span className="font-semibold text-foreground">{item.result.weightedCourseContribution.toFixed(2)} points</span> of {item.courseGradeWeight ?? 0}</p> : null}</div><div className="sm:text-right"><p className="text-lg font-bold">{item.result?.score}/{item.result?.maxScore}</p><p className="text-xs text-muted-foreground">Raw score · {item.result?.percentage}%</p></div></div>)}'
if old_results not in text:
    raise RuntimeError("Published result card block not found")
text = text.replace(old_results, new_results, 1)
helper_marker = 'function Muted({ children }: { children: React.ReactNode }) { return <p className="text-sm text-muted-foreground">{children}</p>; }\n\n'
helper = helper_marker + '''function AssessmentRubric({ assessment }: { assessment: PortalCourseDetail["assessments"][number] }) {\n  if (!assessment.rubricName) return null;\n  const criteria = assessment.rubricCriteria ?? [];\n  return <details className="mt-3 rounded-lg border border-border p-3"><summary className="cursor-pointer text-sm font-medium">Rubric: {assessment.rubricName}</summary><div className="mt-3 space-y-2">{criteria.length ? criteria.map((criterion) => <div key={criterion.id} className="rounded bg-muted/40 p-3"><p className="text-sm font-medium">{criterion.name}</p>{criterion.cloCodes.length ? <p className="mt-1 text-xs text-muted-foreground">{criterion.cloCodes.join(", ")}</p> : null}<div className="mt-2 flex flex-wrap gap-1">{criterion.levels.map((level) => <span key={level.id} className="rounded bg-background px-2 py-1 text-xs">{level.label} · {level.points} pts</span>)}</div></div>) : <p className="text-sm text-muted-foreground">Rubric criteria are not available yet.</p>}</div></details>;\n}\n\n'''
if helper_marker not in text:
    raise RuntimeError("Portal course helper insertion point not found")
text = text.replace(helper_marker, helper, 1)
text = re.sub(r'\nfunction escapeHtml\(value:string\).*\Z', '\n', text, flags=re.S)
write(path, text)

# Release/verification notes for the MVP closeout.
write(
    "docs/student-portal-mvp.md",
    '''# Student Portal MVP (#169)\n\n## Scope\n\nThe Student Portal is a read-mostly, mobile-first surface backed by the existing DSE PMS academic records. It reuses Student, Enrollment, Offering, approved CourseSpec, assessment deadline, published result, announcement, and anonymous feedback data.\n\nStudent routes:\n\n- `/portal` — dashboard\n- `/portal/courses` — enrolled courses\n- `/portal/schedule` — weekly timetable\n- `/portal/assessments` — deadlines, weights, instructions, and rubric criteria\n- `/portal/results` — published results and CLO achievement\n- `/portal/announcements` — currently published course announcements\n- `/portal/courses/:offeringId` — approved course learning information, resources, feedback, and approved document download\n\n## Authorization and privacy\n\n- Every `/api/student-portal/*` student read requires authentication plus `student-portal:read`.\n- Service reads resolve an **Active** Student from the authenticated user id.\n- Course/document access requires an exact Enrollment row for that student and Offering.\n- CourseSpec learning information is returned only when the Offering is bound to a CourseSpec whose review status is `Approved`.\n- Result reads expose only published records and continue to respect the existing provisional-result/survey gate.\n- Announcement reads exclude future-published and expired records.\n- Anonymous course feedback keeps the existing HMAC response-key design and minimum-response disclosure rule.\n- Approved course documents are generated from the same enrollment-scoped approved CourseSpec payload; there is no unauthenticated document URL.\n\n## Assessment deadline semantics\n\nExact deadline timestamps are stored/transmitted as ISO instants and displayed using `Asia/Phnom_Penh` (Cambodia time). The assessment overview distinguishes overdue, upcoming, week-only, and not-yet-scheduled deadlines.\n\n## Database / migration\n\nNo Prisma schema or migration changes are required for #169. The MVP uses existing canonical academic tables and does not rewrite approved/submitted records.\n\n## Verification\n\nRequired merge gates:\n\n- Prisma generate/validate\n- typecheck\n- lint\n- full Bun test suite + backend discovery\n- production build\n- fresh migrations + seed\n- Student Portal DB authorization/publication regression\n- database security verifier + fail-closed probes\n- backend integration authorization suite\n\nManual smoke checks should cover student navigation at mobile/desktop widths, assessment deadline states, rubric readability, approved document download, unpublished result protection, announcement visibility, feedback duplicate behavior, and an IDOR attempt against another Offering id.\n''',
)

print("issue #169 patch applied")
