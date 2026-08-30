from pathlib import Path

branch_note = 'Issue 766 helper: apply inline synopsis UX and official CLO preview formatting.'

overview = Path("apps/frontend/app/(shell)/courses/[id]/spec/overview-tab.tsx")
source = overview.read_text()
source = source.replace('import { useParams } from "next/navigation";\n', 'import { useEffect, useState } from "react";\nimport { useParams } from "next/navigation";\n', 1)
source = source.replace('  onEditCourseInfo,\n  onGoToTab,\n  readOnly = false,\n', '  onSaveCourseDescription,\n  savingCourseDescription = false,\n  onGoToTab,\n  readOnly = false,\n', 1)
source = source.replace('  onEditCourseInfo: () => void;\n  onGoToTab: (id: SpecSectionId | "teachingLearning") => void;\n', '  onSaveCourseDescription: (description: string) => Promise<boolean>;\n  savingCourseDescription?: boolean;\n  onGoToTab: (id: SpecSectionId | "teachingLearning") => void;\n', 1)
needle = '  const planTotals = weeklyPlanFormTotals(instructionalPlan);\n\n  return (\n'
replacement = '''  const planTotals = weeklyPlanFormTotals(instructionalPlan);\n  const [editingDescription, setEditingDescription] = useState(false);\n  const [descriptionDraft, setDescriptionDraft] = useState(courseInfo.description);\n\n  useEffect(() => {\n    if (!editingDescription) setDescriptionDraft(courseInfo.description);\n  }, [courseInfo.description, editingDescription]);\n\n  const saveDescription = async () => {\n    const ok = await onSaveCourseDescription(descriptionDraft);\n    if (ok) setEditingDescription(false);\n  };\n\n  return (\n'''
if needle not in source: raise SystemExit('overview insertion point missing')
source = source.replace(needle, replacement, 1)
old_header = '''          <CardHeader\n            title="Course Information"\n            action={\n              <Button\n                variant="outline"\n                size="sm"\n                onClick={onEditCourseInfo}\n                disabled={readOnly}\n              >\n                <Pencil className="mr-1 h-3.5 w-3.5" />{" "}\n                {readOnly ? "Read-only" : "Edit"}\n              </Button>\n            }\n          />'''
if old_header not in source: raise SystemExit('old course info header missing')
source = source.replace(old_header, '          <CardHeader title="Course Information" />', 1)
old_desc = '''              <Field\n                label="Course Description / Synopsis"\n                value={courseInfo.description}\n                full\n              />'''
new_desc = '''              <div className="sm:col-span-2">\n                <div className="flex items-center justify-between gap-3">\n                  <span className="text-xs text-muted-foreground">Course Description / Synopsis</span>\n                  {!editingDescription && !readOnly ? (\n                    <Button variant="ghost" size="sm" onClick={() => setEditingDescription(true)}>\n                      <Pencil className="mr-1 h-3.5 w-3.5" />\n                      Edit description\n                    </Button>\n                  ) : null}\n                </div>\n                {editingDescription ? (\n                  <div className="mt-1.5 space-y-2">\n                    <textarea\n                      className="min-h-[150px] w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"\n                      value={descriptionDraft}\n                      onChange={(event) => setDescriptionDraft(event.target.value)}\n                      disabled={savingCourseDescription}\n                      autoFocus\n                    />\n                    <div className="flex justify-end gap-2">\n                      <Button\n                        variant="outline"\n                        size="sm"\n                        onClick={() => {\n                          setDescriptionDraft(courseInfo.description);\n                          setEditingDescription(false);\n                        }}\n                        disabled={savingCourseDescription}\n                      >\n                        Cancel\n                      </Button>\n                      <Button size="sm" onClick={saveDescription} disabled={savingCourseDescription}>\n                        {savingCourseDescription ? "Saving…" : "Save changes"}\n                      </Button>\n                    </div>\n                  </div>\n                ) : (\n                  <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-foreground">\n                    {courseInfo.description || "—"}\n                  </p>\n                )}\n              </div>'''
if old_desc not in source: raise SystemExit('old description field missing')
source = source.replace(old_desc, new_desc, 1)
source = source.replace('              action={readOnly ? undefined : "Fill it in"}\n              onClick={readOnly ? undefined : onEditCourseInfo}\n', '              action={undefined}\n              onClick={undefined}\n', 1)
overview.write_text(source)

spec = Path("apps/frontend/app/(shell)/courses/[id]/spec/spec-client.tsx")
source = spec.read_text()
source = source.replace('  Dialog,\n  DialogContent,\n  DialogFooter,\n  DialogHeader,\n  DialogTitle,\n', '', 1)
source = source.replace('  CourseInfoSection,\n  EMPTY_COURSE_INFO,\n', '  EMPTY_COURSE_INFO,\n', 1)
source = source.replace('  const [courseInfoDialogOpen, setCourseInfoDialogOpen] = useState(false);\n', '', 1)
insert_before = '  const persistClos = useCallback(\n'
persist = '''  const persistCourseDescription = useCallback(\n    async (description: string) => {\n      if (editingLocked) {\n        setError("This course specification is locked while it is in the review workflow.");\n        return false;\n      }\n      setSaving(true);\n      setError(null);\n      const nextCourseInfo = { ...courseInfo, description };\n      try {\n        await courseSpecApi.saveSection(\n          courseId,\n          "courseInfo",\n          toCourseInfoPayload(nextCourseInfo),\n        );\n        setCourseInfo(nextCourseInfo);\n        setStatus((current) => ({ ...current, courseInfo: "complete" }));\n        setSavedFlash(true);\n        setTimeout(() => setSavedFlash(false), 2000);\n        return true;\n      } catch (err) {\n        setError(err instanceof ApiError ? err.message : "Failed to save the course description");\n        return false;\n      } finally {\n        setSaving(false);\n      }\n    },\n    [courseId, courseInfo, editingLocked],\n  );\n\n'''
if insert_before not in source: raise SystemExit('persist insertion missing')
source = source.replace(insert_before, persist + insert_before, 1)
old_props = '''                onEditCourseInfo={() => {\n                  if (!editingLocked) setCourseInfoDialogOpen(true);\n                  else setError("This course specification is locked while it is in the review workflow.");\n                }}\n                onGoToTab={(id) => setActiveTab(id)}\n                readOnly={editingLocked}\n'''
new_props = '''                onSaveCourseDescription={persistCourseDescription}\n                savingCourseDescription={saving}\n                onGoToTab={(id) => setActiveTab(id)}\n                readOnly={editingLocked}\n'''
if old_props not in source: raise SystemExit('overview props missing')
source = source.replace(old_props, new_props, 1)
start = source.find('      <Dialog\n        open={courseInfoDialogOpen && !editingLocked}')
if start == -1: raise SystemExit('dialog start missing')
end_marker = '      </Dialog>\n'
end = source.find(end_marker, start)
if end == -1: raise SystemExit('dialog end missing')
source = source[:start] + source[end + len(end_marker):]
spec.write_text(source)

preview = Path("apps/frontend/app/(shell)/courses/[id]/spec/themed-document-pages.tsx")
source = preview.read_text()
css_anchor = '''        .course-spec-theme-root article[data-doc-page] > div:not(#programme-overview) th {\n          vertical-align: middle;\n        }\n'''
css_patch = '''        .course-spec-theme-root #clos .section14-table thead th {\n          background: #e2eedb !important;\n          color: #000 !important;\n          vertical-align: middle !important;\n          text-align: center !important;\n          font-weight: 400 !important;\n        }\n\n        .course-spec-theme-root #clos .section14-table tbody td:nth-child(1),\n        .course-spec-theme-root #clos .section14-table tbody td:nth-child(3),\n        .course-spec-theme-root #clos .section14-table tbody td:nth-child(4),\n        .course-spec-theme-root #clos .section14-table tbody td:nth-child(5),\n        .course-spec-theme-root #clos .section14-table tbody td:nth-child(6) {\n          text-align: center !important;\n          vertical-align: middle !important;\n        }\n\n'''
if css_anchor not in source: raise SystemExit('preview css anchor missing')
source = source.replace(css_anchor, css_anchor + '\n' + css_patch, 1)
preview.write_text(source)
