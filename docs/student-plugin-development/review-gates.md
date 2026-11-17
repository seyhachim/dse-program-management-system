# Student plugin review and release gates (Issue #1304)

**Status:** policy and checklist proposed in PR; effective repository protections must be checked in GitHub **Settings**. This file does not enable branch rules.

## Design decision

Phase 1 supports **student-authored source plugins submitted in reviewed pull requests**, consistent with [ADR #1301](https://github.com/seyhachim/dse-program-management-system/issues/1301).

No student uploads, dynamic code loading, production credentials, direct deployment or unreviewed database migrations. Students develop in a disposable local PostgreSQL environment with fictional records (see #1303).

## Current ruleset snapshot (2026-11-17)

[Protect main](https://github.com/seyhachim/dse-program-management-system/rules/21180169) applies to the default branch. It currently requires PRs and these checks:

- `Typecheck, lint, test, build`
- `Fresh database migration, seed, and security`
- `Backend integration authorization`

It blocks deletion/non-fast-forward updates, but the ruleset **currently has 0 required approving reviews** and does not require CODEOWNERS, stale review dismissal or approval of the latest push. That is a P0 student contribution blocker.

## Required one-time repository-admin changes (not achievable by source PR)

As repository administrator, open **Settings → Rules → Rulesets → Protect main → Edit** and keep the existing default-branch targeting and all mandatory CI checks.

1. Under pull request rules, set **Required approvals = 1** (minimum).
2. Enable **Require review from Code Owners**, with `.github/CODEOWNERS` identifying the PMS maintainer. If this feature is unavailable on the plan, maintain a compensating procedure and **do not claim enforcement** until tested.
3. Enable **Dismiss stale approvals when new commits are pushed**, or **Require approval of the most recent reviewable push**, to ensure added commits cannot bypass review.
4. Prefer requiring all review conversations to be resolved. Keep existing no-bypass protection.
5. Save the ruleset and re-fetch its parameters to verify changes took effect. Read-only status is insufficient; test an actual unapproved PR.

Do not reduce the current three status checks or create bypass actors. Do not allow automatic merging or production deployment from student PRs.

## Enforcement verification

- With a **separate test contributor** (not the repo owner), open an innocuous PR against `main` from a fork. Until a distinct maintainer approves, GitHub must block merge even after CI passes.
- Verify student cannot self-approve and cannot merge with a failing required check. Ask maintainer to approve, then push one new harmless commit from contributor; previous review must be invalidated or latest-push approval required.
- Verify `.github/CODEOWNERS` requests the intended owner; GitHub CODEOWNERS alone does not enforce review.
- Retain links/screenshots showing denied merge and final ruleset values. Avoid tokens, IDs of real students, data or private URLs.

## CI trust boundary

Main `.github/workflows/ci.yml` uses `pull_request` and `contents: read` and operates with ephemeral PostgreSQL; do not introduce `pull_request_target`/privileged `workflow_run` jobs that execute untrusted contributor code. Prevent fork PR jobs from receiving production DB URLs, Supabase/Neon/Render/Vercel/GitHub deployment keys and real academic records. Review any new workflow or dependency script, not just files under `apps/backend/src/plugins`.

A 2026-11-17 review of 23 workflows found no `pull_request_target`, `workflow_run` or `secrets.` references. `.github/workflows/tmp-issue-231-schema.yml` is **push-only** and has `contents: write`; assess whether it can be removed or made read-only in a separate, reviewed change. This is **not** evidence that fork PRs receive write tokens.

## Human review checklist

- Business purpose, plugin owner and version; no hidden privilege increase or unrelated core changes.
- New API auth + exact programme grants + resource ownership, including negative tests for IDOR/cross-programme attempts.
- Shared Zod contracts, typed service, predictable errors and restricted data transfer objects.
- No cross-plugin implementation imports; no direct write to a domain whose canonical workflow is owned elsewhere.
- Database migrations tested on clean and upgraded **isolated** database; schema grants/RLS/security inventory verified.
- Dependencies, third-party licence, network egress, event handlers, suspicious package scripts and CI changes reviewed.
- All existing verification jobs pass; a security failure blocks merge.
- Owner/mentor sign-off, rollback and maintainership documented; no production release as a side effect of passing CI.

## Relationship to next issues

- #1303 creates isolated synthetic contributor test setup; local/dev tokens must never enter deployed or preview environments.
- #1302 supplies a build-time starter only **after** ADR #1301 and suitable review/CI gates; it must not provide runtime installation.
- #1305 uses the starter as a low-risk non-official event example; #1306 covers student documentation and contribution/licence policy.

**Status criterion:** #1304 cannot be closed until ruleset enforcement and a denied-merge test have been verified. A documentation PR alone is not sufficient.
