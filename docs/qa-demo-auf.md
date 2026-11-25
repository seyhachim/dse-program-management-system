# AUF QA demonstration screen

Route: `/qa-demo` (authenticated DSE PMS shell).

The page is a **static, read-only illustration** for the 10 November 2026 AUF presentation. It uses AUN-QA 4.1, TSA301 and programme competency C4 as *illustrative* context; it is not an AUN-QA finding, actual course evidence, or an AI run.

## Safeguards

- The same navigation roles as `/qa-dashboard`: admin, programme coordinator, QA reviewer.
- `QaDemoClient` additionally checks `qa:read` permission before displaying the page.
- No QA API calls, model provider calls, event handlers, or database mutations.
- Visible French labels: “Démonstration”, “Données fictives”, “Aucune analyse IA réelle exécutée”.
- No new database models, migrations or credentials.
- No automatic AUN-QA scores or accreditation decisions.

## Future integration (separate change)

`QaEvidenceResultPanel` is a read-only UI component under `components/qa`, accepting a typed summary derived from `QaEvidenceAnalysisView`.

To add live results *after* the presentation:

1. Use the existing QA dashboard / assessment cycle API to retrieve a requirement and evidence from a scoped, authorized programme. Do not mutate official QA records in the presentation demo.
2. Adapt actual `QaEvidenceAnalysisView` values (`state`, `explanation`, and provenance labels) into `QaEvidenceResultSummary`. Use `mode="real"` **only** for genuine saved analyses, not controlled examples.
3. Run the existing deterministic analysis separately with authorized `qa:write`; surface whether the result is rule-based or LLM-assisted.
4. Configure the optional QA LLM provider server-side and call the already-implemented `llm-analysis` endpoint for suitable evidence context. Never expose API keys to the browser.
5. Reuse the existing `QaAnalysisReviewPanel` or equivalent authorized review flow instead of treating any AI result as approved.
6. Validate source provenance, scope, reporting period and programme permissions. Rehearse with anonymized data before any public screenshot.
7. Complete the expert reference-label pilot documented in GitHub issue #194 before claiming measured performance.

Do **not** silently switch this static AUF page to real data or remove its fictional disclaimers. A future live-data route should be clearly differentiated.
