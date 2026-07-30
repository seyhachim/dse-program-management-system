---
name: issue-workflow
description: Runs this repo's issue -> branch -> PR -> close loop for real work (features, bugs, chores, docs) — open a GitHub issue before starting, work on a conventionally-named branch, and open a PR whose body closes the issue on merge. Use this whenever the user asks to build, fix, add, or change something in dse-pms, says things like "let's work on X", "start on Y", "open an issue for Z", or references an existing issue number to pick up. Also use it when wrapping up work to open the PR and confirm the issue will close. Do not use it for pure exploration, throwaway scratch scripts, or one-line edits made inline at the user's explicit direction without any request to track them.
---

# Issue workflow

This repo already tracks real work through GitHub issues — every merged feature/fix/doc
PR here closes one (`Closes #N` in the PR body), and branches follow a `<type>/<slug>`
convention (`feat/supabase-auth`, `docs/claude-md`, `fix/...`). This skill just makes
that loop explicit and repeatable instead of ad hoc.

The loop has five stages. Don't skip stages, but use judgment on _scope_ — a two-line
typo fix the user dictated directly doesn't need this ceremony; a feature, bug, or
anything the user describes as a task to pick up does.

Every issue also carries a Status on the **DSE PMS Roadmap** board (Todo / In
Progress / Done) that should track which stage it's actually in — set explicitly
at each transition below rather than assumed. Reference IDs (stable — same project
every time):

|                       | value                            |
| --------------------- | -------------------------------- |
| Project number        | `4` (owner `thymadona`)          |
| Project ID            | `PVT_kwHOBODUqM4BeBd4`           |
| Status field ID       | `PVTSSF_lAHOBODUqM4BeBd4zhYetxE` |
| Todo option ID        | `f75ad846`                       |
| In Progress option ID | `47fc9ee4`                       |
| Done option ID        | `98236657`                       |

## 1. Find or open the issue

Before creating anything, check whether an issue for this work already exists:

```bash
gh issue list --state open --search "<keywords>"
```

- If the user names an issue number ("pick up #9", "let's do the Revise UI issue"),
  use it directly — `gh issue view <N>` to confirm title/body match what's being asked.
- If nothing matches, open one:

```bash
gh issue create --title "<concise title>" --body "<what/why, 2-5 lines>" \
  --label "<bug|enhancement|documentation, if it clearly fits>"
```

Match the title style already in use (`docs: README is missing a Testing section`,
`Add Total SLT when create a new course`) — imperative or `type:` prefix, not a
restatement of the user's chat message.

Every new issue also goes on the roadmap board — `gh issue create` doesn't do this
itself, so add it as a separate step right after creating (or reusing) the issue.
Use `--format json` so the item ID comes back directly instead of needing a second
lookup:

```bash
gh project item-add 4 --owner thymadona --url <issue-url> --format json
```

If you're attaching to an issue found in step 1 rather than a newly created one,
check first whether it's already on the board (`gh project item-list 4 --owner
thymadona`) — adding a duplicate is harmless but noisy.

New items don't reliably land on Todo by default (observed behavior on this board
is inconsistent), so set it explicitly using the item ID the add command returned:

```bash
gh project item-edit --id <item-id> --project-id PVT_kwHOBODUqM4BeBd4 \
  --field-id PVTSSF_lAHOBODUqM4BeBd4zhYetxE --single-select-option-id f75ad846
```

## 2. Branch

Name it `<type>/<slug>`, matching existing branches — `feat/`, `fix/`, `docs/`,
`chore/`, `refactor/`. Include the issue number in the slug only if it adds
traceability value (`example/readme-testing-section-7`); it's not required.

```bash
git checkout -b <type>/<slug>
```

Move the board item to In Progress as soon as the branch exists and work has
actually started (not at the moment the issue was filed) — reuse the item ID from
step 1:

```bash
gh project item-edit --id <item-id> --project-id PVT_kwHOBODUqM4BeBd4 \
  --field-id PVTSSF_lAHOBODUqM4BeBd4zhYetxE --single-select-option-id 47fc9ee4
```

For work substantial enough to warrant an upfront design pass, note the plan in the
issue itself (a comment or an edit to the issue body) before writing code — this repo
doesn't use a separate spec/plan doc workflow. Small fixes skip straight to committing.

## 3. Work and commit

Normal commit hygiene applies — see the top-level git safety rules already governing
this session (no `--no-verify`, confirm before force-pushing, etc.). Commits don't need
to mention the issue individually; the PR body is what closes it.

## 4. Open the PR — confirm first

Opening a PR is a visible, shared-state action. Before running `gh pr create`, tell the
user what you're about to push and to which branch, and confirm — the same bar as any
other push in this session, not a special rule for this skill.

```bash
gh pr create --title "<type>(<scope>): <summary>" --body "$(cat <<'EOF'
## Summary
- ...

Closes #<N>

## Test plan
- [ ] ...
EOF
)"
```

`Closes #<N>` must be in the PR body (or title) exactly like PRs #3, #8, and #11 in
this repo's history — that's what makes the issue close automatically on merge. The
board's "Item closed" workflow (already enabled on this project) then moves the Status
to Done by itself — don't set Done manually, and don't wait around to confirm it fired.
If the PR doesn't fully resolve the issue (partial work, follow-up needed), say so
instead of using a closing keyword, and leave the issue open with a comment
(`gh issue comment <N> --body "..."`) explaining what's left — Status stays In Progress.

If the user asks to close an issue without a PR (abandoned work, duplicate, decided
against it), close it explicitly and say why — this also trips the "Item closed"
board automation, so Status still lands on Done with no extra step:

```bash
gh issue close <N> --comment "<reason>"
```
