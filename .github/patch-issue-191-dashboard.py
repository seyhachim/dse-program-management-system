from pathlib import Path
p=Path('apps/frontend/app/(shell)/qa-dashboard/qa-dashboard-client.tsx')
s=p.read_text()

s=s.replace('''  type QaDashboardView,\n  type QaEvidenceAnalysisView,\n} from "@dse-pms/shared-types";''','''  type QaAnalysisReviewView,\n  type QaDashboardView,\n  type QaEvidenceAnalysisView,\n} from "@dse-pms/shared-types";''',1)
s=s.replace('''import { useMe } from "@/lib/auth";''','''import { useMe } from "@/lib/auth";\nimport { QaAnalysisReviewPanel } from "./qa-analysis-review-panel";''',1)
s=s.replace('''  const [analyses, setAnalyses] = useState<QaEvidenceAnalysisView[]>([]);''','''  const [analyses, setAnalyses] = useState<QaEvidenceAnalysisView[]>([]);\n  const [reviews, setReviews] = useState<QaAnalysisReviewView[]>([]);''',1)
old='''        setAnalyses(\n          await api.get<QaEvidenceAnalysisView[]>(\n            `/api/qa/cycles/${dashboard.selectedCycle.id}/analyses?${historyQuery}`,\n          ),\n        );\n      } else {\n        setAnalyses([]);\n      }'''
new='''        const [analysisHistory, reviewHistory] = await Promise.all([\n          api.get<QaEvidenceAnalysisView[]>(\n            `/api/qa/cycles/${dashboard.selectedCycle.id}/analyses?${historyQuery}`,\n          ),\n          api.get<QaAnalysisReviewView[]>(\n            `/api/qa/cycles/${dashboard.selectedCycle.id}/reviews?${historyQuery}`,\n          ),\n        ]);\n        setAnalyses(analysisHistory);\n        setReviews(reviewHistory);\n      } else {\n        setAnalyses([]);\n        setReviews([]);\n      }'''
if old not in s: raise SystemExit('load block not found')
s=s.replace(old,new,1)
anchor='''  const latestAnalysisByRequirement = useMemo(() => {\n    const latest = new Map<string, QaEvidenceAnalysisView>();\n    for (const analysis of analyses) {\n      if (!latest.has(analysis.requirementCode)) latest.set(analysis.requirementCode, analysis);\n    }\n    return latest;\n  }, [analyses]);'''
insert=anchor+'''\n  const reviewsByAnalysis = useMemo(() => {\n    const grouped = new Map<string, QaAnalysisReviewView[]>();\n    for (const review of reviews) {\n      const list = grouped.get(review.analysisId) ?? [];\n      list.push(review);\n      grouped.set(review.analysisId, list);\n    }\n    return grouped;\n  }, [reviews]);'''
if anchor not in s: raise SystemExit('memo anchor not found')
s=s.replace(anchor,insert,1)
s=s.replace('''<span className="font-medium">Latest deterministic evidence analysis</span>''','''<span className="font-medium">Latest evidence analysis</span>''',1)
old2='''                          {analysis.uncertaintyNote ? <p className="mt-2 text-xs text-muted-foreground">{analysis.uncertaintyNote}</p> : null}\n                        </div>'''
new2='''                          {analysis.uncertaintyNote ? <p className="mt-2 text-xs text-muted-foreground">{analysis.uncertaintyNote}</p> : null}\n                          <QaAnalysisReviewPanel\n                            analysis={analysis}\n                            reviews={reviewsByAnalysis.get(analysis.id) ?? []}\n                            canWrite={canWrite}\n                            onReviewed={() => load(data.selectedCycle!.id)}\n                          />\n                        </div>'''
if old2 not in s: raise SystemExit('analysis panel anchor not found')
s=s.replace(old2,new2,1)
p.write_text(s)
