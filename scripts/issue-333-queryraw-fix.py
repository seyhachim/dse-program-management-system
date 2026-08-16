from pathlib import Path

path = Path("apps/backend/src/plugins/student-portal/results-lifecycle.ts")
text = path.read_text()
old = "await tx.$executeRaw`SELECT set_config('dse.result_correction_id', ${correction.id}, true)`;"
new = "await tx.$queryRaw`SELECT set_config('dse.result_correction_id', ${correction.id}, true)`;"
if text.count(old) != 1:
    raise SystemExit(f"expected one query marker, found {text.count(old)}")
path.write_text(text.replace(old, new, 1))
