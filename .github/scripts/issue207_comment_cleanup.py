from pathlib import Path

p = Path('apps/backend/src/plugins/courses/service.ts')
text = p.read_text()
old1 = '''  /**
   * Return the full spec document for a course. Course Information (§1–13) is
   * always recomputed live from the current course + assigned lecturer + latest
   * offering — never read back from storage — so reassigning a lecturer or
   * editing the course elsewhere is reflected immediately instead of showing a
   * stale snapshot from whenever the section was last saved.
   */'''
new1 = '''  /**
   * Return the current academic CourseSpec version for a course. Once a version
   * exists, Course Information (§1–13) is read only from that version's snapshot
   * so later Course, lecturer, or Offering edits cannot rewrite historical output.
   * A course with no CourseSpec yet receives live values only as first-save prefill.
   */'''
old2 = '''  /**
   * Upsert one section of the spec, marking it complete. For the Course
   * Information section, `values` is already restricted by `CourseInfoInput` to
   * Pre-requisites/Description — every other §1–13 field is admin/assignment-
   * derived (see `getSpec`) and isn't accepted here, so it's mirrored onto the
   * Course row rather than stored as a section snapshot; nothing is written to
   * `data.courseInfo`, since `getSpec` recomputes it fresh on every read. `clos`
   * additionally rebuilds the normalized CourseSpecClo rows (issue #81) instead
   * of storing its content as section JSON — every other section is a plain
   * upsert of its own CourseSpecSection row, isolated from every other section's
   * `updatedAt`/content.
   */'''
new2 = '''  /**
   * Upsert one section of the spec, marking it complete. For Course Information,
   * `CourseInfoInput` intentionally permits only prerequisites/description. The
   * initial save captures all administrative §1–13 values into CourseSpecCourseInfo;
   * later draft edits update only those two permitted fields in both Course and
   * the active version snapshot. Other snapshot fields change only by creating a
   * new academic revision. `clos` additionally rebuilds normalized CourseSpecClo
   * rows; other sections keep their existing normalized storage behavior.
   */'''
for old, new in [(old1,new1),(old2,new2)]:
    if text.count(old) != 1:
        raise SystemExit(f'expected exactly one comment marker, got {text.count(old)}')
    text = text.replace(old,new,1)
p.write_text(text)
