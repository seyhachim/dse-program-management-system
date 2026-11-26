# PR #1367 hosted synthetic acceptance

This runbook applies only to the dedicated Render/Neon environment, never production. As of 2026-11-25 the hosted database contains two finalized synthetic TSA301-UAT sections, each with three students, a group score of 80, three individual contribution scores (60, 70, 80), and a 70/30 weighted derived grade (74, 77, 80). The fixture was seeded with guarded SQL, not with a signed-in grading action. Database-only acceptance passed 2 group and 6 component lifecycles, independent reviewer, cross-section rejection, immutable history and unchanged marks; 24 test revisions were rolled back.

## Credential gate

The four prebound identities are `evidence1367-lecturer@example.test`, `evidence1367-coordinator@example.test`, `evidence1367-student@example.test`, and `evidence1367-unassigned@example.test`. They are reserved synthetic addresses and cannot receive email. At last inspection each has a credential account but email verification is false and no usable password has been established. The connected Neon management API does not expose setting a password or verifying email. Use an authorized provider administrator's supported account provisioning/password management and verification workflow for these isolated synthetic identities. If verification requires a deliverable test mailbox, use controlled test aliases and explicitly rebind the exact verified auth ID and matching email on this staging DB after reviewing the change. Do not change production, directly edit provider password/verification tables, open public registration, share passwords in chat, or commit credentials. Do not grant PMS admin roles to bootstrap the provider administrator. Check provider docs for the supported admin workflow.

## Signed-session API acceptance

From a local terminal with Python 3.10+ and network access, on the PR branch:

```sh
python apps/backend/scripts/uat-assessment-evidence-hosted.py --execute
```

Passwords are entered with hidden prompts, then the runner signs in to the exact pinned Neon issuer, requests provider-signed JWTs, verifies PMS /me identity/role and uses the real hosted API. If the provider's direct cookie API does not support this client, use genuine short-lived tokens from the four independently authenticated sessions with `--token-only --execute`; this tests bearer authentication, not credential sign-in. Never paste tokens into chat. The runner rejects redirects, unknown targets, roles, sections and scores before modifying evidence. It appends synthetic evidence revisions only; reruns append new immutable revisions, not overwrite existing evidence. The fake Drive references deliberately test reference workflow syntax only, not actual private document access. No hosted file upload or browser layout test is implied. A hosted browser pass still requires a dedicated staging frontend (or local frontend configured to the exact staging issuer and backend without Vercel production deployment). Real student data, hosted scanner/private storage and institutional retention approval remain blocked.

Run with no flags for a non-network dry run. Record only pass/fail summaries and revision counts in PR #1367, no secrets or raw API bodies. If credentials are unavailable, stop rather than bypass authentication.
