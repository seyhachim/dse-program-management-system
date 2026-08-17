from pathlib import Path
import runpy

patch = Path("scripts/issue-211-apply.py")
text = patch.read_text()
old_a = "    '  @@index([lecturerId])\\n}\\n\\nmodel OfferingCoLecturer',"
new_a = "    '  @@unique([courseId, term, sectionCode])\\n  @@index([status])\\n  @@index([lecturerId])\\n}',"
old_b = "    '  @@index([lecturerId])\\n  @@index([courseSpecId])\\n}\\n\\nmodel OfferingCoLecturer',"
new_b = "    '  @@unique([courseId, term, sectionCode])\\n  @@index([status])\\n  @@index([lecturerId])\\n  @@index([courseSpecId])\\n}',"
if text.count(old_a) != 1 or text.count(old_b) != 1:
    raise SystemExit("Could not locate the exact Offering index assertion in issue-211-apply.py")
patch.write_text(text.replace(old_a, new_a).replace(old_b, new_b))
runpy.run_path(str(patch), run_name="__main__")
Path(__file__).unlink(missing_ok=True)
