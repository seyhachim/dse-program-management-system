# Academic development decision register

This is a non-sensitive repository index, not the secure institutional policy register. Status describes engineering guidance, not institutional approval.

| ID | Decision / rationale | Status and authority | Related work |
|---|---|---|---|
| ADR-ACA-001 | Local grade weight is distinct from CLO evidence weight; avoids invalid attribution | Existing documented product rule | #255; [domain audit](../assessment-grade-clo-separation.md) |
| ADR-ACA-002 | Preserve exact version identity and historical results | Existing repository engineering rule | root AGENTS.md; #203 |
| ADR-ACA-003 | Missing is distinct from assessed zero | Existing instrument design; verify policy applicability | #1355; [instrument library](../assessment-instrument-library.md) |
| ADR-ACA-004 | Restricted policy metadata/source access stays in authorized register; no private sources in Git | Existing issue security requirement; runtime work tracked separately | #1361/#1362 |
| ADR-ACA-005 | New rubric drafts use verified institutional four-level default only after approval; separate exam marking schemes | Proposed/verification pending; not permission to change scores | #1361, #1355 |
| ADR-ACA-006 | Exact assigned examination version, direct vs supporting evidence and question-level marks | In-progress engineering design; not a live feature claim | #1371 |
| ADR-ACA-007 | Adopt repository constitution, source register and mandatory agent preflight | Proposed, pending maintainer review | #1378 |

For future entries include ID, date, decision, alternatives/rationale, authority and source locator (non-sensitive only), scope/effective period, owner, approval status, superseded ID, implementation issue and validation evidence. Never mark a draft as institutional approval. Record confidential decisions through the authorized register. Review this index when a policy or implementation changes.
