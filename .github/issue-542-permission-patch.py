from pathlib import Path

# Temporary self-deleting patch runner for issue #542.

def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one anchor, found {count}: {old!r}")
    file.write_text(text.replace(old, new, 1))


replace_once(
    "packages/shared-types/src/plugins.ts",
    '''    {\n      label: "Students",\n      path: "/students",\n      icon: "users",\n      roles: ["admin", "program_secretary"],\n      group: "Academic",\n    },\n  ],\n  permissions: ["students:read", "students:write"],\n''',
    '''    {\n      label: "Students",\n      path: "/students",\n      icon: "users",\n      roles: ["admin", "program_secretary"],\n      group: "Academic",\n    },\n    {\n      label: "Student Progression",\n      path: "/students/cohorts",\n      icon: "graduation-cap",\n      roles: ["admin", "program_coordinator"],\n      group: "Academic",\n    },\n  ],\n  permissions: ["students:read", "students:write", "students:progression"],\n''',
)

replace_once(
    "apps/backend/prisma/seed.ts",
    '''  "students:read": "View students",\n  "students:write": "Create/edit students",\n''',
    '''  "students:read": "View students",\n  "students:write": "Create/edit students",\n  "students:progression": "Record student progression decisions",\n''',
)
replace_once(
    "apps/backend/prisma/seed.ts",
    '''      "students:read",\n      "students:write",\n\n      "courses:read",\n''',
    '''      "students:read",\n      "students:write",\n      "students:progression",\n\n      "courses:read",\n''',
)
replace_once(
    "apps/backend/prisma/seed.ts",
    '''    permissions: [\n      "students:read",\n\n      "courses:read",\n''',
    '''    permissions: [\n      "students:read",\n      "students:progression",\n\n      "courses:read",\n''',
)

router_path = Path("apps/backend/src/plugins/students/cohort-router.ts")
router = router_path.read_text()
old = 'router.post("/:cohortId/promotion/apply", requirePermission("students:write"), async (req, res) => {'
new = 'router.post("/:cohortId/promotion/apply", requirePermission("students:progression"), async (req, res) => {'
if router.count(old) != 1:
    raise SystemExit(f"cohort-router apply permission anchor count {router.count(old)}")
router_path.write_text(router.replace(old, new, 1))

ui_path = Path("apps/frontend/app/(shell)/students/cohorts/cohort-promotion-client.tsx")
ui = ui_path.read_text()
old = 'const canWrite = me?.permissions.includes("students:write") ?? false;'
new = 'const canWrite = me?.permissions.includes("students:progression") ?? false;'
if ui.count(old) != 1:
    raise SystemExit(f"promotion UI permission anchor count {ui.count(old)}")
ui_path.write_text(ui.replace(old, new, 1))

integration_path = Path("apps/backend/src/integration/auth-authorization.integration.test.ts")
integration = integration_path.read_text()
anchor = '''  test("programme coordinators retain programme-wide course access", async () => {\n    const response = await request(`/api/courses/${context.courses.cs201.id}`, {\n      token: signToken(context.users.coordinator),\n    });\n    expect(response.status).toBe(200);\n    expect((response.body as { id?: string }).id).toBe(context.courses.cs201.id);\n  });\n\n'''
addition = anchor + '''  test("student promotion apply requires progression decision authority", async () => {\n    const cohortId = "00000000-0000-4000-8000-000000000542";\n    const body = {\n      sourceProgrammeYear: 1,\n      targetProgrammeYear: 2,\n      academicYear: "2026-2027",\n      term: "Year end",\n      periodStart: "2026-09-01",\n      periodEnd: "2027-06-30",\n      decisions: [\n        {\n          membershipId: "00000000-0000-4000-8000-000000000543",\n          status: "Progressed",\n          note: "Authorization probe",\n        },\n      ],\n    };\n\n    for (const actor of [context.users.admin, context.users.coordinator]) {\n      const response = await request(`/api/student-cohorts/${cohortId}/promotion/apply`, {\n        method: "POST",\n        token: signToken(actor),\n        body,\n      });\n      expect(response.status).toBe(404);\n      expect(errorMessage(response.body)).toContain("Cohort not found");\n    }\n\n    for (const actor of [\n      context.users.secretary,\n      context.users.lecturer,\n      context.users.qaReviewer,\n      context.users.student,\n    ]) {\n      const response = await request(`/api/student-cohorts/${cohortId}/promotion/apply`, {\n        method: "POST",\n        token: signToken(actor),\n        body,\n      });\n      expect(response.status).toBe(403);\n      expect(errorMessage(response.body)).toContain("students:progression");\n    }\n  });\n\n'''
if integration.count(anchor) != 1:
    raise SystemExit(f"integration anchor count {integration.count(anchor)}")
integration_path.write_text(integration.replace(anchor, addition, 1))
