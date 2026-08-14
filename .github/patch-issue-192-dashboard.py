from pathlib import Path
p=Path('apps/frontend/app/(shell)/qa-dashboard/qa-dashboard-client.tsx')
s=p.read_text()
s=s.replace('''  type QaEvidenceAnalysisView,\n} from "@dse-pms/shared-types";''','''  type QaEvidenceAnalysisView,\n  type QaImprovementActionView,\n} from "@dse-pms/shared-types";''',1)
s=s.replace('''import { QaAnalysisReviewPanel } from "./qa-analysis-review-panel";''','''import { QaAnalysisReviewPanel } from "./qa-analysis-review-panel";\nimport { QaImprovementActionsPanel } from "./qa-improvement-actions-panel";''',1)
s=s.replace('''  const [reviews, setReviews] = useState<QaAnalysisReviewView[]>([]);''','''  const [reviews, setReviews] = useState<QaAnalysisReviewView[]>([]);\n  const [actions, setActions] = useState<QaImprovementActionView[]>([]);''',1)
old='''        const [analysisHistory, reviewHistory] = await Promise.all([\n          api.get<QaEvidenceAnalysisView[]>(\n            `/api/qa/cycles/${dashboard.selectedCycle.id}/analyses?${historyQuery}`,\n          ),\n          api.get<QaAnalysisReviewView[]>(\n            `/api/qa/cycles/${dashboard.selectedCycle.id}/reviews?${historyQuery}`,\n          ),\n        ]);\n        setAnalyses(analysisHistory);\n        setReviews(reviewHistory);\n      } else {\n        setAnalyses([]);\n        setReviews([]);\n      }'''
new='''        const [analysisHistory, reviewHistory, actionHistory] = await Promise.all([\n          api.get<QaEvidenceAnalysisView[]>(\n            `/api/qa/cycles/${dashboard.selectedCycle.id}/analyses?${historyQuery}`,\n          ),\n          api.get<QaAnalysisReviewView[]>(\n            `/api/qa/cycles/${dashboard.selectedCycle.id}/reviews?${historyQuery}`,\n          ),\n          api.get<QaImprovementActionView[]>(\n            `/api/qa/actions?${new URLSearchParams({ programmeId: PROGRAMME_ID, cycleId: dashboard.selectedCycle.id })}`,\n          ),\n        ]);\n        setAnalyses(analysisHistory);\n        setReviews(reviewHistory);\n        setActions(actionHistory);\n      } else {\n        setAnalyses([]);\n        setReviews([]);\n        setActions([]);\n      }'''
if old not in s: raise SystemExit('load block not found')
s=s.replace(old,new,1)
anchor='''      {error ? <ErrorNotice message={error} /> : null}\n\n      {!data.selectedCycle ? ('''
insert='''      {error ? <ErrorNotice message={error} /> : null}\n\n      {data.selectedCycle ? (\n        <QaImprovementActionsPanel\n          actions={actions}\n          canWrite={canWrite}\n          onChanged={() => load(data.selectedCycle!.id)}\n        />\n      ) : null}\n\n      {!data.selectedCycle ? ('''
if anchor not in s: raise SystemExit('render anchor not found')
s=s.replace(anchor,insert,1)
p.write_text(s)
