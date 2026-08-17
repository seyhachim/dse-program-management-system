from pathlib import Path


def replace(path: str, old: str, new: str, count: int = 1) -> None:
    p = Path(path)
    text = p.read_text()
    actual = text.count(old)
    if actual != count:
        raise SystemExit(f"{path}: expected {count}, found {actual}: {old[:120]!r}")
    p.write_text(text.replace(old, new, count))

replace(
    "apps/backend/src/plugins/student-portal/results-lifecycle-db.test.ts",
    '        courseId: spec.courseId,\n        lecturerId: actor.id,\n',
    '        courseId: spec.courseId,\n        courseSpecId: spec.id,\n        lecturerId: actor.id,\n',
)

replace(
    "apps/backend/src/plugins/offerings/service.ts",
    '    if (!existing) throw new ReferenceError("Offering not found");\n    if (offeringInput.courseSpecId !== undefined) {\n',
    '    if (!existing) throw new ReferenceError("Offering not found");\n'
    '    if (!existing.courseSpecId && offeringInput.courseSpecId === undefined) {\n'
    '      throw new ReferenceError(\n'
    '        "Offering must be bound to an Approved CourseSpec version before it can be updated",\n'
    '      );\n'
    '    }\n'
    '    if (offeringInput.courseSpecId !== undefined) {\n',
)

Path(__file__).unlink(missing_ok=True)
Path(".github/workflows/issue-211-ci-fix.yml").unlink(missing_ok=True)
