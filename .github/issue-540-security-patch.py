from pathlib import Path

path = Path("apps/backend/scripts/verify-db-security.ts")
text = path.read_text()
old = '  "Student",\n  "StudentCohort",'
new = '  "Student",\n  "StudentProfile",\n  "StudentCohort",'
if text.count(old) != 1:
    raise SystemExit(f"security inventory anchor count was {text.count(old)}, expected 1")
path.write_text(text.replace(old, new, 1))
