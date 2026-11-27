# Student plugin review and release gates (Issue #1304)

**Status (verified 2026-11-20):** `Protect main` enforces one independent approval, dismisses stale approvals, and requires the three existing CI checks. PR #1308 is blocked without review. This source PR remains unmerged; an actual student-fork denial test, separate trusted reviewer for maintainer-authored PRs, and maintainer approval are still outstanding. These notes do not change GitHub settings.

## Design decision

Phase 1 supports **student-authored source plugins submitted in reviewed pull requests**, consistent with [ADR #1301](https://github.com/seyhachim/dse-program-management-system/issues/1301).

No student uploads, dynamic code loading, production credentials, direct deployment or unreviewed database migrations. Students develop in a disposable local PostgreSQL environment with fictional records (see #1303).

## Verified Protect main ruleset (rechecked 2026-11-20)

[Protect main](https://github.com/seyhachim/dse-program-management-system/rules/21180169) targets the default branch and is active. The current GitHub ruleset API snapshot reports:

- `required_approving_review_count: 1` — GitHub requires approval from someone other than the PR author.
- `dismiss_stale_reviews_on_push: true` — a new commit invalidates earlier approvals.
- `require_code_owner_review: false`; `require_last_push_approval: false` — do not claim either extra rule is enabled.
- `bypass_actors: []`; `current_user_can_bypass: never`.
- Deletion and non-fast-forward updates are prohibited.
- All **three existing** CI checks remain required:
  - `Typecheck, lint, test, build`
  - `Fresh database migration, seed, and security`
  - `Backend integration authorization`

GitHub reports `mergeable_state: blocked` for ready-for-review [PR #1308](https://github.com/seyhachim/dse-program-management-system/pull/1308), authored by `@seyhachim`, with no approving review. Its CI workflow succeeded on the prior head SHA `6beca34` (before this documentation update). This **proves an owner-authored PR is blocked without independent approval**, not that every fork-specific negative case has been exercised.

## Remaining owner actions and reviewer capacity

1. **Arrange an independent trusted reviewer** able to submit a qualifying approval for maintainer-authored PRs, including #1308. On a personal-account GitHub repository, collaborator write access is a meaningful privilege: invite only someone trusted with source code, never a random student solely to clear this check.
2. **Do not turn on `require_code_owner_review` blindly.** Proposed `.github/CODEOWNERS` lists only `@seyhachim`. GitHub cannot accept the PR author's own approval; enforcing that owner on an `@seyhachim`-authored PR could deadlock the merge. After confirming independent reviewer coverage, update ownership policy if needed, then enable and verify the extra rule if feasible.
3. **Perform a real separate-account fork PR acceptance test**: unapproved merge denied even when CI passes; student cannot self-approve or merge; failing required CI denies merge; newly pushed commit invalidates previous approval. Keep non-sensitive evidence in #1304.
4. Obtain a genuine independent review of #1308 before merging; recheck branch protections after any settings change. Maintain three required statuses and no bypass users.

For settings changes, use **Settings → Rules → Rulesets → Protect main**; a source-code PR cannot enable or change an admin ruleset. Do not grant production database, Vercel, Render, Supabase or GitHub deployment credentials to student contributors.

## Enforcement verification

- With a **separate test contributor** (not the repo owner), open an innocuous PR against `main` from a fork. Until a distinct maintainer approves, GitHub must block merge even after CI passes.
- Verify student cannot self-approve and cannot merge with a failing required check. Ask maintainer to approve, then push one new harmless commit from contributor; previous review must be invalidated or latest-push approval required.
- Verify `.github/CODEOWNERS` requests the intended owner; GitHub CODEOWNERS alone does not enforce review.
- Retain links/screenshots showing denied merge and final ruleset values. Avoid tokens, IDs of real students, data or private URLs.

## CI trust boundary

Main `.github/workflows/ci.yml` uses `pull_request` and `contents: read` and operates with ephemeral PostgreSQL; do not introduce `pull_request_target`/privileged `workflow_run` jobs that execute untrusted contributor code. Prevent fork PR jobs from receiving production DB URLs, Supabase/Neon/Render/Vercel/GitHub deployment keys and real academic records. Review any new workflow or dependency script, not just files under `apps/backend/src/plugins`.

A refreshed 2026-11-20 inspection of the 23 workflow YAML files on `main` found no `pull_request_target`, `workflow_run`, or literal `secrets.` references. `.github/workflows/tmp-issue-231-schema.yml` is **push-only** and has `contents: write`; assess whether it can be removed or made read-only in a separate, reviewed change. This is **not** evidence that fork PRs receive write tokens.

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

**Closure criterion:** keep #1304 open until an actual unapproved *fork* PR and post-approval-push denial are verified, a trusted independent maintainer approves and merges #1308 through protected `main`, and release ownership is confirmed. A blocked owner-authored PR and this documentation alone are insufficient.
