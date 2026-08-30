from pathlib import Path

preview = Path("apps/frontend/app/(shell)/courses/[id]/spec/document-preview-pages.tsx")
source = preview.read_text()
old = 'Levels in Learning Domain:<br />Knowledge (Cognitive-C), Attitude (Affective-A), Skills (Psychomotor-P)'
new = 'Levels in Learning Domain:<br />Knowledge (Cognitive-C), Attitude<br />(Affective-A), Skills (Psychomotor-P)'
if old not in source:
    raise SystemExit("section 14 learning-domain header not found")
source = source.replace(old, new, 1)
preview.write_text(source)

themed = Path("apps/frontend/app/(shell)/courses/[id]/spec/themed-document-pages.tsx")
source = themed.read_text()
anchor = '''        .course-spec-theme-root #clos .section14-table .section14-header-row th {\n          background: #e2eedb !important;\n          color: #000 !important;\n          vertical-align: middle !important;\n          text-align: center !important;\n          font-weight: 400 !important;\n        }\n'''
replacement = '''        .course-spec-theme-root #clos .section14-table {\n          table-layout: fixed !important;\n        }\n\n        .course-spec-theme-root #clos .section14-table .section14-header-row:first-child {\n          height: 44px;\n        }\n\n        .course-spec-theme-root #clos .section14-table .section14-header-row:nth-child(2) {\n          height: 18px;\n        }\n\n        .course-spec-theme-root #clos .section14-table .section14-header-row th {\n          background: #e2eedb !important;\n          color: #000 !important;\n          vertical-align: middle !important;\n          text-align: center !important;\n          font-weight: 400 !important;\n          font-size: 8.5pt !important;\n          line-height: 1.08 !important;\n          white-space: normal !important;\n          overflow-wrap: anywhere !important;\n          word-break: normal !important;\n          padding: 3pt 2pt !important;\n        }\n'''
if anchor not in source:
    raise SystemExit("section 14 theme anchor not found")
source = source.replace(anchor, replacement, 1)
themed.write_text(source)

test = Path("apps/frontend/app/(shell)/courses/[id]/spec/document-preview-pages-layout.test.ts")
source = test.read_text()
source = source.replace(
    'expect(source).toContain("Levels in Learning Domain:<br />Knowledge (Cognitive-C), Attitude (Affective-A), Skills (Psychomotor-P)");',
    'expect(source).toContain("Levels in Learning Domain:<br />Knowledge (Cognitive-C), Attitude<br />(Affective-A), Skills (Psychomotor-P)");',
    1,
)
test.write_text(source)

style_test = Path("apps/frontend/app/(shell)/courses/[id]/spec/section14-preview-style.test.ts")
style_test.write_text('''import { describe, expect, test } from "bun:test";\n\nconst THEME_PATH = new URL("./themed-document-pages.tsx", import.meta.url);\n\ndescribe("Section 14 preview layout", () => {\n  test("wraps and constrains the approved grouped header", async () => {\n    const source = await Bun.file(THEME_PATH).text();\n    expect(source).toContain(".section14-header-row:first-child");\n    expect(source).toContain("height: 44px");\n    expect(source).toContain("white-space: normal !important");\n    expect(source).toContain("overflow-wrap: anywhere !important");\n    expect(source).toContain("font-size: 8.5pt !important");\n  });\n});\n''')
