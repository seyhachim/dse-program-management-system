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

client_path = ROOT / "apps/frontend/app/(shell)/final-project/final-project-client.tsx"
client = client_path.read_text(encoding="utf-8")
client = client.replace(
    '  useEffect(() => {\n    if (!me) return;\n    let active = true;',
    '  useEffect(() => {\n    const currentUser = me;\n    if (!currentUser) return;\n    let active = true;',
    1,
)
client = client.replace(
    '        if (me.roles.includes("lecturer")) {',
    '        if (currentUser.roles.includes("lecturer")) {',
    1,
)
client = client.replace(
    '        if (me.roles.includes("admin") || me.roles.includes("program_coordinator")) {',
    '        if (currentUser.roles.includes("admin") || currentUser.roles.includes("program_coordinator")) {',
    1,
)
if 'if (me.roles.includes("lecturer"))' in client or 'if (me.roles.includes("admin") || me.roles.includes("program_coordinator"))' in client:
    raise RuntimeError("Final Project client user narrowing repair did not apply as expected")
client_path.write_text(client, encoding="utf-8")

Path(__file__).unlink(missing_ok=True)
