from pathlib import Path

path = Path("packages/shared-types/src/plugins.ts")
text = path.read_text()
needle = '''    {
      label: "QA Evidence Analysis",
      path: "/qa-dashboard",
      icon: "file-check",
      roles: ["admin", "program_coordinator", "qa_reviewer"],
      group: "Quality Assurance",
    },
'''
insert = '''    {
      label: "Evidence Library",
      path: "/aun-qa/evidence",
      icon: "library",
      roles: ["admin", "program_coordinator", "qa_contributor", "qa_reviewer"],
      group: "Quality Assurance",
    },
''' + needle
if 'path: "/aun-qa/evidence"' not in text:
    if text.count(needle) != 1:
        raise SystemExit(f"Expected QA Evidence Analysis route once, found {text.count(needle)}")
    text = text.replace(needle, insert, 1)
path.write_text(text)
