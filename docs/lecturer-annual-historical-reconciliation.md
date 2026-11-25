# Historical lecturer activity reconciliation (#1298)

This is an operator-only dry-run, not an importer, approval, report release, or public API. It compares historical source rows against existing annual PMS records and returns a review inventory. Existing annual summary, portfolio, teaching, staff snapshot and release workflows remain authoritative.

## Preconditions

- Use only the independently marked, populated Neon staging database, with the existing `verify-staging-db.ts` environment settings. Do not point the command at production. The command validates the target before connecting, checks the database marker in the transaction, and enforces PostgreSQL READ ONLY with repeatable-read isolation.
- Use the exact DSE academic-year ID and label from PMS. Configure and verify official reporting boundaries through the existing coordinator workflow. Never substitute the example dates from tests.
- An authorized operator prepares the source JSON from reviewed historical HR and teaching sheets. Resolve canonical lecturer and offering IDs explicitly; do not infer identity by name or create users. Include a distinct source-row reference and source URL for each claim. Assignment alone is not proof of delivery; use `confirmed` only if the external source actually claims delivery.
- Keep real source files and report outputs private; never commit them. Output contains internal entity IDs and row references, not names, contact fields, evidence URLs or free-text evidence. Use opaque row references, not personal data.

Example format (synthetic identifiers, not actual records):

```json
{
  "schemaVersion": 1,
  "programmeId": "dse",
  "academicYearId": "replace-with-exact-pms-id",
  "academicYearLabel": "2025–2026",
  "staff": [
    {
      "row": "HR:2",
      "lecturerId": "replace-with-lecturer-id",
      "employmentType": "part_time",
      "qualification": "Master",
      "evidenceUrl": "https://example.invalid/hr"
    }
  ],
  "teaching": [
    {
      "row": "Teaching:2",
      "lecturerId": "replace-with-lecturer-id",
      "offeringId": "replace-with-offering-id",
      "verdict": "confirmed",
      "evidenceUrl": "https://example.invalid/delivery-evidence"
    }
  ]
}
```

Use empty arrays to inventory PMS without spreadsheet claims. Supported employment values are full_time, part_time, other; teaching verdicts confirmed and not_delivered. Unknown values must be investigated rather than guessed. Schema rejects extra fields, other programmes and unsafe URL schemes.

From repository root, with dependencies installed and staging settings verified:

```sh
bun apps/backend/scripts/annual-lecturer-reconciliation.ts --input /private/path/historical-source.json
```

Redirect stdout to a restricted private file if needed. There is no commit/apply flag. The command does not perform migrations, seed, mutate academic data or change releases.

## Review output

- candidate_for_review: review source document and evidence independently in the existing coordinator workflow; never automatically verify.
- already_recorded: existing verified annual record or authoritative delivery agrees; do not duplicate.
- conflict / duplicate / unmatched: resolve identity, existing decision, assignment or source discrepancy manually; no overwrite.
- window_missing: configure official academic-year dates before considering new claims.
- legacyOfferings: inventory of DSE offerings without canonical calendar binding; explicit label matches and overlapping dates are hints, not new year assignments. Other unresolved unbound offerings may belong to a different year.
- evidence: unlinked portfolio items for the existing annual staff projection; only verified in-period items are owner-link candidates. Self-declared items require review; rejected, undated and out-of-period evidence are not promoted. Already linked items are excluded.
- gaps: existing submission, staffing and teaching review state. Missing submissions are not zero achievements.

This slice does not match names, ingest arbitrary spreadsheet layouts, create missing historical people, fix legacy calendar links, submit on behalf of lecturers or apply backfill. Do not use candidate counts as verified annual statistics. Existing reviewed snapshots, source records and report versions remain unchanged.

## Tests and acceptance

```sh
bun test apps/backend/src/plugins/lecturers/annual-reconciliation.test.ts
bun test apps/backend/scripts/verify-staging-db.test.ts
bun run typecheck
bun run lint
bun run test
bun run test:backend
bun run build
```

Before operational use, run on the approved populated staging copy with a synthetic or authorized redacted source, check the candidate results against manual inspection, verify read-only enforcement and no changes, and review the reporting period and HR sources. Full CI and independent review remain required. No production rollout is implied.
