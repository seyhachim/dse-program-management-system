from pathlib import Path

root = Path(__file__).resolve().parents[1]
path = root / "apps/backend/scripts/verify-db-security.ts"
text = path.read_text(encoding="utf-8")
old = '  "UserSecurityAuditEvent",\n  "LecturerProfile",\n'
new = '  "UserSecurityAuditEvent",\n  "FinalProjectSupervisorProfile",\n  "FinalProjectResearchTrack",\n  "FinalProjectProjectIdea",\n  "FinalProjectSupervisorProfileAudit",\n  "LecturerProfile",\n'
if old not in text:
    raise RuntimeError("DB security public-table inventory anchor not found")
path.write_text(text.replace(old, new, 1), encoding="utf-8")

(root / ".github/workflows/issue-1006-security-classification.yml").unlink(missing_ok=True)
Path(__file__).unlink(missing_ok=True)
