from pathlib import Path

spec = Path("apps/frontend/app/(shell)/courses/[id]/spec/spec-client.tsx")
source = spec.read_text()
old = '''      if (sectionId === "courseInfo") {\n        setActiveTab("overview");\n        setCourseInfoDialogOpen(true);\n      } else if (sectionId === "references") {'''
new = '''      if (sectionId === "courseInfo") {\n        setActiveTab("overview");\n      } else if (sectionId === "references") {'''
if old not in source:
    raise SystemExit("spec-client courseInfo navigation block not found")
spec.write_text(source.replace(old, new, 1))

readonly = Path("apps/frontend/app/(shell)/courses/[id]/spec/read-only-spec-client.tsx")
source = readonly.read_text()
old = '''                  onEditCourseInfo={() => undefined}\n                  onGoToTab={(id) => setActiveTab(id)}'''
new = '''                  onSaveCourseDescription={() => Promise.resolve(false)}\n                  onGoToTab={(id) => setActiveTab(id)}'''
if old not in source:
    raise SystemExit("read-only OverviewTab prop block not found")
readonly.write_text(source.replace(old, new, 1))

preview = Path("apps/frontend/app/(shell)/courses/[id]/spec/document-preview-pages.tsx")
source = preview.read_text()
old = '''  const numeric = Number(value);\n  if (Number.isFinite(numeric) && numeric === 0) return "";\n  return String(value).replace(/\\.0+$/, "");'''
new = '''  const numeric = Number(value);\n  if (Number.isFinite(numeric) && numeric === 0) return "";\n  return Number.isFinite(numeric) ? String(numeric) : String(value);'''
if old not in source:
    raise SystemExit("compactSltValue block not found")
preview.write_text(source.replace(old, new, 1))

regression = Path("apps/frontend/app/(shell)/courses/[id]/spec/course-info-inline-edit.test.ts")
source = regression.read_text()
if 'READ_ONLY_PATH' not in source:
    source = source.replace(
        'const INFO_PATH = new URL("./course-info-section.tsx", import.meta.url);\n',
        'const INFO_PATH = new URL("./course-info-section.tsx", import.meta.url);\nconst READ_ONLY_PATH = new URL("./read-only-spec-client.tsx", import.meta.url);\n',
        1,
    )
    insert = '''\n  test("read-only history view uses the new Overview contract without exposing editing", async () => {\n    const source = await Bun.file(READ_ONLY_PATH).text();\n\n    expect(source).toContain("onSaveCourseDescription={() => Promise.resolve(false)}");\n    expect(source).toContain("readOnly");\n    expect(source).not.toContain("onEditCourseInfo");\n  });\n'''
    marker = '\n  test("course-info payload only persists the synopsis", async () => {'
    if marker not in source:
        raise SystemExit("course-info test insertion marker not found")
    source = source.replace(marker, insert + marker, 1)
regression.write_text(source)
