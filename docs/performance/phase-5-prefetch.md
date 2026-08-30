# Performance Phase 5 route/data prefetch

Issue: #741  
Parent epic: #736

## Intent policy

Protected data prefetch runs only after the authenticated application user is resolved and only for a route already visible in that user's role-filtered sidebar. Backend authorization remains authoritative for every prefetched request.

Supported high-probability routes:

| Route | Prefetched data | Freshness | Intent-time requests |
| --- | --- | --- | ---: |
| `/students` | Initial unfiltered student list | operational | 1 |
| `/offerings` | Initial offering list | operational | 1 |
| `/courses` (programme-wide roles) | Initial course list | operational | 1 |
| `/courses` (lecturer-only) | Courses, offerings, spec progress, section presence | reference / operational / review | 4 |

For lecturer-only Course Specifications, these are the same four reads that gate the table containing rows such as PAN202. Starting them on pointer/focus/touch intent reduces click-to-content wait without changing the page contract.

## Request-overhead evidence

- No intent: no protected route-data request is added by Phase 5.
- First intent: the same destination query keys start before navigation.
- Repeated hover/focus/touch while a query is in flight or fresh: TanStack Query reuses the in-flight/fresh key; the focused regression test proves two prefetch calls produce one query execution.
- Click after intent: the destination consumes the same user-scoped query keys, so there is no second click-time request while the prefetched query remains in flight/fresh.
- Offerings roster reference data is intentionally excluded because it is only required if the enrollment dialog is opened.

## Explicit exclusions

This phase does **not** prefetch heavy or lower-probability data such as:

- curriculum detail used only to enhance course grouping;
- enrollment roster reference data;
- reports, exports, document generation, or preview payloads;
- approval/finalization/publication mutations or lifecycle state;
- AUN-QA SAR preview/evidence history and other sensitive/heavy QA detail;
- unrelated Student Portal or Action Research detail until a safe high-probability intent surface is selected.

These remain candidates for later measured slices rather than being globally preloaded.

## Desktop browser smoke

Use the exact PR branch after CI is green. In DevTools Network, preserve log only when needed and do not capture protected payload content in screenshots.

1. Sign in with an authorized programme-management account.
2. From Dashboard or another shell page, hover **Students** before clicking.
   - `/api/students` begins on intent.
   - Clicking Students does not issue a duplicate request while the prefetched request is fresh/in flight.
3. Repeat for **Offerings**.
   - `/api/offerings` begins on intent.
   - Enrollment roster reference data is not prefetched solely by sidebar intent.
4. Repeat for **Courses** using a programme-wide account.
   - only the initial course-list data is prefetched.
5. With a lecturer-only account, hover/focus **Course Specifications**.
   - courses, offerings, spec-progress, and section-presence begin on intent;
   - click after intent should show assigned course rows sooner than a cold no-intent navigation;
   - no permission-restricted route appears or prefetched data bypasses backend authorization.
6. Keyboard: tab to Students/Courses/Offerings and confirm focus triggers the same behavior.
7. Move the pointer repeatedly in/out of one target while its data is fresh and confirm it does not create a burst of duplicate API calls.

## Mobile browser smoke (~390 x 844)

1. Open the mobile sidebar.
2. Touch Students, Courses, and Offerings normally.
3. Confirm touch intent starts the supported prefetch and navigation still succeeds normally.
4. Confirm hidden/unauthorized navigation items remain absent.
5. Confirm there is no horizontal overflow or interaction regression introduced by the handlers.

## Merge evidence

Record:

- exact commit SHA;
- CI/typecheck/lint/tests/build result;
- desktop hover + keyboard-focus result;
- mobile touch result;
- whether click after intent avoided duplicate destination requests;
- any environment limitation.
