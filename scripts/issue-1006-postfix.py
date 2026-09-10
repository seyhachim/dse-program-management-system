from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
seed_path = ROOT / "apps/backend/prisma/seed.ts"
text = seed_path.read_text(encoding="utf-8")

student_inline = '    permissions: ["student-portal:read", "student-portal:feedback"],'
student_fixed = '''    permissions: [
      "student-portal:read",
      "student-portal:feedback",
      "final-project:read",
    ],'''
if student_inline not in text:
    raise RuntimeError("Expected inline student permission block was not found")
text = text.replace(student_inline, student_fixed, 1)

pattern = re.compile(
    r'(name: "Assignment Rubric – Written Report".*?criteria: \[.*?)\n      "final-project:read",(\n    \],\n  \},\n\n  \{\n    name: "Presentation Rubric")',
    re.S,
)
text, count = pattern.subn(r'\1\2', text, count=1)
if count != 1:
    raise RuntimeError("Expected accidental final-project permission inside rubric criteria was not found")

seed_path.write_text(text, encoding="utf-8")
Path(__file__).unlink(missing_ok=True)
