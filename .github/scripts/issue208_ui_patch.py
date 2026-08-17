from pathlib import Path

p = Path('apps/frontend/app/(shell)/courses/[id]/spec/revision/revision-request-client.tsx')
text = p.read_text()
old_import = '''  CreateCourseSpecRevisionRequestSchema,\n  recommendedCourseSpecRevisionType,\n} from "@dse-pms/shared-types";\n'''
new_import = '''  CreateCourseSpecRevisionRequestSchema,\n} from "@dse-pms/shared-types";\n'''
if text.count(old_import) != 1:
    raise SystemExit('shared recommendation import marker not found exactly once')
text = text.replace(old_import, new_import, 1)
old_local = '''import { coursesApi, type CourseView } from "@/lib/courses";\n'''
new_local = '''import { coursesApi, type CourseView } from "@/lib/courses";\nimport { revisionRequestUiDecision } from "./revision-request-ui";\n'''
if text.count(old_local) != 1:
    raise SystemExit('local import marker not found exactly once')
text = text.replace(old_local, new_local, 1)
old_decision = '''  const recommendedRevisionType = useMemo(\n    () => recommendedCourseSpecRevisionType(impact),\n    [impact],\n  );\n  const overridingMajor =\n    recommendedRevisionType === "Major" && proposedRevisionType === "Minor";\n'''
new_decision = '''  const { recommendedRevisionType, showOverrideJustification } = useMemo(\n    () => revisionRequestUiDecision(impact, proposedRevisionType),\n    [impact, proposedRevisionType],\n  );\n'''
if text.count(old_decision) != 1:
    raise SystemExit('decision marker not found exactly once')
text = text.replace(old_decision, new_decision, 1)
if text.count('{overridingMajor ? (') != 1:
    raise SystemExit('override visibility marker not found exactly once')
text = text.replace('{overridingMajor ? (', '{showOverrideJustification ? (', 1)
p.write_text(text)
Path('.github/scripts/issue208_ui_patch.py').unlink()
