from pathlib import Path

path = Path("apps/backend/src/plugins/qa/service.ts")
text = path.read_text()

import_anchor = 'import { prisma } from "../../core/db/prisma.ts";\n'
import_add = import_anchor + 'import { createAndMapQaEvidence, listMappedQaEvidenceForCycle } from "./evidence/library.ts";\n'
if 'listMappedQaEvidenceForCycle' not in text:
    if text.count(import_anchor) != 1:
        raise SystemExit("qa service import anchor not found exactly once")
    text = text.replace(import_anchor, import_add, 1)

old_query = '''          prisma.qaEvidence.findMany({
            where: { programmeId, cycleId: selected.id },
            orderBy: { createdAt: "desc" },
            include: { requirement: { select: { code: true } } },
          }),'''
new_query = '''          listMappedQaEvidenceForCycle(programmeId, selected.id),'''
if old_query in text:
    text = text.replace(old_query, new_query, 1)

text = text.replace(
    'new Set(evidenceRows.map((row) => row.requirement.code))',
    'new Set(evidenceRows.map((row) => row.requirementCode))',
)
text = text.replace(
    '''evidenceRows
        .filter((row) => row.status === "Reviewed")
        .map((row) => row.requirement.code),''',
    '''evidenceRows
        .filter((row) => row.status === "reviewed")
        .map((row) => row.requirementCode),''',
)
text = text.replace('      evidence: evidenceRows.map(toEvidenceView),', '      evidence: evidenceRows,')

start = text.find('  async createEvidence(\n')
end = text.find('  async upsertSelfAssessment(\n', start)
if start == -1 or end == -1:
    raise SystemExit("createEvidence service block anchors not found")
new_create = '''  async createEvidence(
    cycleId: string,
    input: CreateQaEvidenceInput,
    userId: string,
  ): Promise<QaEvidenceView> {
    return createAndMapQaEvidence(cycleId, input, userId);
  },

'''
text = text[:start] + new_create + text[end:]
path.write_text(text)
