from pathlib import Path

# Sidebar route for SAR reviewers.
path = Path("packages/shared-types/src/plugins.ts")
text = path.read_text()
needle = '''    {
      label: "QA Evidence Analysis",
      path: "/qa-dashboard",
      icon: "file-check",
      roles: ["admin", "program_coordinator", "qa_reviewer"],
      group: "Quality Assurance",
    },
'''
route = '''    {
      label: "SAR Review",
      path: "/aun-qa/review",
      icon: "clipboard-check",
      roles: ["admin", "program_coordinator", "qa_reviewer"],
      group: "Quality Assurance",
    },
''' + needle
if 'path: "/aun-qa/review"' not in text:
    if text.count(needle) != 1:
        raise SystemExit("QA Evidence Analysis nav anchor not found")
    text = text.replace(needle, route, 1)
path.write_text(text)

# Wire real SAR lifecycle into the AUN-QA workspace.
path = Path("apps/frontend/app/(shell)/aun-qa/workspace-client.tsx")
text = path.read_text()
if "QaSarProgressItemView" not in text:
    text = text.replace(
        '  QaRequirementAssignmentView,\n',
        '  QaRequirementAssignmentView,\n  QaSarProgressItemView,\n',
        1,
    )
    text = text.replace(
        '  const [contributors, setContributors] = useState<ProgrammeRoleAssignmentView[]>([]);\n',
        '  const [contributors, setContributors] = useState<ProgrammeRoleAssignmentView[]>([]);\n  const [sarProgress, setSarProgress] = useState<QaSarProgressItemView[]>([]);\n',
        1,
    )
    old = '''        const [assignmentRows, contributorRows] = await Promise.all([
          dashboardView.selectedCycle
            ? api.get<QaRequirementAssignmentView[]>(
                `/api/qa/cycles/${dashboardView.selectedCycle.id}/assignments?${query}`,
              )
            : Promise.resolve([]),
          api.get<ProgrammeRoleAssignmentView[]>(`/api/auth/programme-roles?${query}`),
        ]);
        setAssignments(assignmentRows);
        setContributors(contributorRows.filter((item) => item.role === "qa_contributor"));'''
    new = '''        const [assignmentRows, contributorRows, progressRows] = await Promise.all([
          dashboardView.selectedCycle
            ? api.get<QaRequirementAssignmentView[]>(
                `/api/qa/cycles/${dashboardView.selectedCycle.id}/assignments?${query}`,
              )
            : Promise.resolve([]),
          api.get<ProgrammeRoleAssignmentView[]>(`/api/auth/programme-roles?${query}`),
          dashboardView.selectedCycle
            ? api.get<QaSarProgressItemView[]>(
                `/api/qa/cycles/${dashboardView.selectedCycle.id}/sar-progress?${query}`,
              )
            : Promise.resolve([]),
        ]);
        setAssignments(assignmentRows);
        setContributors(contributorRows.filter((item) => item.role === "qa_contributor"));
        setSarProgress(progressRows);'''
    if text.count(old) != 1:
        raise SystemExit("workspace leadership load anchor not found")
    text = text.replace(old, new, 1)
    text = text.replace('        setContributors([]);\n', '        setContributors([]);\n        setSarProgress([]);\n', 1)
    text = text.replace(
        '''  const evidenceByRequirement = useMemo(() => {''',
        '''  const progressByRequirement = useMemo(
    () => new Map(sarProgress.map((item) => [item.requirementCode, item])),
    [sarProgress],
  );
  const evidenceByRequirement = useMemo(() => {''',
        1,
    )
    text = text.replace(
        '          evidenceByRequirement={evidenceByRequirement}\n',
        '          evidenceByRequirement={evidenceByRequirement}\n          progressByRequirement={progressByRequirement}\n',
        1,
    )
    text = text.replace(
        '  evidenceByRequirement,\n  savingCode,\n',
        '  evidenceByRequirement,\n  progressByRequirement,\n  savingCode,\n',
        1,
    )
    text = text.replace(
        '  evidenceByRequirement: Map<string, { count: number; reviewed: number }>;\n',
        '  evidenceByRequirement: Map<string, { count: number; reviewed: number }>;\n  progressByRequirement: Map<string, QaSarProgressItemView>;\n',
        1,
    )
    text = text.replace(
        '                      const evidence = evidenceByRequirement.get(requirement.code) ?? { count: 0, reviewed: 0 };\n',
        '                      const evidence = evidenceByRequirement.get(requirement.code) ?? { count: 0, reviewed: 0 };\n                      const progress = progressByRequirement.get(requirement.code);\n',
        1,
    )
    old = '''                          <td className="py-3 pr-4">
                            <Link href={`/aun-qa/sar/${requirement.code}`} className="text-xs font-medium text-primary hover:underline">
                              Open editor
                            </Link>
                          </td>
                          <td className="py-3"><StatusPill>Not submitted</StatusPill></td>'''
    new = '''                          <td className="py-3 pr-4">
                            <Link href={`/aun-qa/sar/${requirement.code}`} className="text-xs font-medium text-primary hover:underline">
                              {progress?.status === "approved" ? "Approved" : progress?.status === "underReview" ? "Submitted" : progress?.status === "changesRequested" ? "Revise" : progress ? "Drafting" : "Open editor"}
                            </Link>
                          </td>
                          <td className="py-3">
                            <StatusPill tone={progress?.status === "approved" ? "good" : progress?.status === "underReview" || progress?.status === "changesRequested" ? "warn" : "neutral"}>
                              {progress?.status === "approved" ? "Approved" : progress?.status === "underReview" ? "Under review" : progress?.status === "changesRequested" ? "Changes requested" : "Not submitted"}
                            </StatusPill>
                          </td>'''
    if text.count(old) != 1:
        raise SystemExit("leadership status cells anchor not found")
    text = text.replace(old, new, 1)

    old = '''                <ReadinessBox label="SAR writing" value="Not started" tone="neutral" />
                <ReadinessBox label="Review" value="Not submitted" tone="neutral" />'''
    new = '''                <ReadinessBox
                  label="SAR writing"
                  value={item.writingStatus === "approved" ? "Approved" : item.writingStatus === "submitted" ? "Submitted" : item.writingStatus === "drafting" ? "Drafting" : "Not started"}
                  tone={item.writingStatus === "approved" ? "good" : item.writingStatus === "submitted" ? "warn" : "neutral"}
                />
                <ReadinessBox
                  label="Review"
                  value={item.reviewStatus === "approved" ? "Approved" : item.reviewStatus === "underReview" ? "Under review" : item.reviewStatus === "changesRequested" ? "Changes requested" : "Not submitted"}
                  tone={item.reviewStatus === "approved" ? "good" : item.reviewStatus === "underReview" || item.reviewStatus === "changesRequested" ? "warn" : "neutral"}
                />'''
    if text.count(old) != 1:
        raise SystemExit("contributor status boxes anchor not found")
    text = text.replace(old, new, 1)
path.write_text(text)
