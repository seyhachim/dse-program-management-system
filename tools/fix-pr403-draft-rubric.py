from pathlib import Path

path = Path('apps/backend/src/plugins/student-portal/service.ts')
text = path.read_text(encoding='utf-8')
old = '''          rubricName: item.rubric?.name ?? "",\n          rubricCriteria: (item.rubric?.criterionRows ?? []).map((criterion) => ({\n            id: criterion.id,\n            name: criterion.name,\n            cloCodes: item.criterionCloMappings\n              .filter((mapping) => mapping.rubricId === item.rubricId && mapping.criterionId === criterion.id)\n              .map((mapping) => mapping.cloCode),\n            levels: (item.rubric?.levelRows ?? []).map((level) => ({\n              id: level.id,\n              label: level.label,\n              points: level.points,\n            })),\n          })),\n'''
new = '''          rubricName: item.rubric && item.rubric.status !== "Draft" ? item.rubric.name : "",\n          rubricCriteria: item.rubric && item.rubric.status !== "Draft"\n            ? item.rubric.criterionRows.map((criterion) => ({\n                id: criterion.id,\n                name: criterion.name,\n                cloCodes: item.criterionCloMappings\n                  .filter((mapping) => mapping.rubricId === item.rubricId && mapping.criterionId === criterion.id)\n                  .map((mapping) => mapping.cloCode),\n                levels: item.rubric!.levelRows.map((level) => ({\n                  id: level.id,\n                  label: level.label,\n                  points: level.points,\n                })),\n              }))\n            : [],\n'''
if text.count(old) != 1:
    raise SystemExit(f'expected exactly one rubric block, found {text.count(old)}')
path.write_text(text.replace(old, new, 1), encoding='utf-8')
print('Draft rubric privacy fix applied')
