# Academic PR review gate

Status: repository development process, not an accreditation or institutional approval mechanism. Applies to all contributors and coding agents. See [constitution](CONSTITUTION.md), [reference index](REFERENCES.md) and [decision register](DECISION-REGISTER.md).

## Process

1. Before coding, read the issue, current implementation, constitution and applicable guides. Identify impact, scope, evidence, policy authority and blockers.
2. Complete the Academic impact review section in the root PR template. Link the issue and document actual findings; never copy confidential records, private URLs or examinations. Use non-sensitive source IDs and section/page locators, authority status and applicability. State pending verification explicitly.
3. For academic changes, identify AC principles and explain OBE, CDIO, AUN-QA and RUPP implications individually. If a framework is not relevant, explain why. Include evidence/assessment semantics, exact version/cohort scope, historical behavior, security and regression tests. Do not invent requirements or report unexecuted tests as passed.
4. For non-academic changes, set Impact to none and explain why no academic semantics, records or reports change. Other fields still need concrete reasons or relevant engineering checks; do not mark security or tests irrelevant merely because the change is not academic.
5. The reviewer compares actual diff and issue against the completed block and verifies source authority, approvals, test results and appropriate review. A format check does not determine whether a policy claim is true. When an unresolved policy would change academic meaning, keep that slice blocked; do not approve it through a checkbox or CI.
6. Preserve all current engineering, security and student-plugin-specific review gates. Record any academic reviewer decision in PR discussion without disclosing protected information.

## Required fields

Use the exact heading and field names below. Each value must be a non-placeholder single-line statement. Add detailed evidence elsewhere in the PR and refer to it. Impact must be academic or none; Issue must include a GitHub issue number (#123); academic changes must cite at least one AC-001 through AC-015. Source locators and pending status are reviewed by humans.

```markdown
## Academic impact review
- Issue: #123 (example only)
- Impact: academic
- Rationale: Change affects course-spec validation.
- AC principles: AC-002, AC-006, AC-010
- OBE: Verify approved SLT alignment.
- CDIO: N/A — does not change competency mappings.
- AUN-QA: Criterion 2, curriculum evidence; applicability to be reviewed.
- RUPP: Credit allocation verification pending.
- Sources and authority: RUPP-01 pending authorized section verification; no new numeric rule proposed.
- Scope and historical integrity: Draft specifications only; approved versions unchanged.
- Evidence and assessment: No changes to grade or attainment calculations.
- Authorization and privacy: Existing assigned-lecturer scope preserved; deny unauthorized writes.
- Verification: Run validation, version-isolation and authorization tests; pending CI.
- Policy blockers and review: Block new credit conversion until authorized confirmation; coordinator review required.
```

## Rollout and limitations

The lightweight GitHub workflow runs on PR creation, body edits, updates, reopening and ready-for-review. It reads the event JSON as data, uses no secrets and does not print PR body contents. PRs numbered 1380 or earlier can omit the block during transition, but manual academic review is still required. If older PRs add the section, it must be complete. PRs newer than 1380 must include it when the workflow is available. Existing open PRs may need to sync main to receive it. Branch protection is unchanged: the maintainer must decide whether to make the check required after pilot CI. This is format validation only and cannot detect incorrect impact classification or fabricated evidence. No production deployment required.

Local test: `python -m unittest discover -s scripts -p 'test_academic_pr_review.py'`.
