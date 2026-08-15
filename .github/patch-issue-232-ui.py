from pathlib import Path

path = Path("packages/shared-types/src/plugins.ts")
text = path.read_text()
needle = '''    {
      label: "SAR Review",
      path: "/aun-qa/review",
      icon: "clipboard-check",
      roles: ["admin", "program_coordinator", "qa_reviewer"],
      group: "Quality Assurance",
    },
'''
insert = needle + '''    {
      label: "SAR Preview",
      path: "/aun-qa/sar-preview",
      icon: "file-text",
      roles: ["admin", "program_coordinator", "qa_reviewer"],
      group: "Quality Assurance",
    },
'''
if 'path: "/aun-qa/sar-preview"' not in text:
    if text.count(needle) != 1:
        raise SystemExit(f"SAR Review route anchor count {text.count(needle)}")
    text = text.replace(needle, insert, 1)
path.write_text(text)
