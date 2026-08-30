# Performance Phase 4 browser smoke

Issue: #740  
Parent epic: #736

Use this matrix on the PR preview or a production-like local environment after CI is green. Do not capture protected student/course/offering data in screenshots or logs.

## Desktop (>= 1280 px)

1. Sign in with an authorized programme-management account and hard-navigate to `/dashboard`.
   - Neutral shell-shaped loading chrome may appear while session/account checks resolve.
   - No role-sensitive navigation labels or protected values appear before authorization resolves.
   - Cold Dashboard loading is visually distinct from an empty Dashboard.
2. Navigate Dashboard → Students → Courses → Offerings → Dashboard.
   - Returning to Dashboard renders cached summary data immediately when available.
   - Background refresh uses a small refresh status; populated content does not collapse into a full skeleton.
3. Students: type a search term and toggle Active only.
   - Existing authorized rows remain visible while the next filtered result loads.
   - A small `Refreshing students…` status is exposed to assistive technology.
   - A successful zero-result response shows the empty-state message, not a loading state.
4. Courses: change search text while rows are populated.
   - Existing rows remain visible during the debounced revalidation.
   - Curriculum grouping failure, if simulated, leaves course rows available in code order.
5. Offerings: revisit the route after it has loaded once.
   - Cached offerings render immediately and revalidate in the background.
   - Enrollment updates patch only the cached authorized offering row.
6. Open a direct URL that the current role is not allowed to use.
   - Protected route content never flashes.
   - A neutral redirect status appears before navigation to an allowed route.
7. Simulate an API refresh failure after each list has valid cached data.
   - Last available data remains visible with a refresh-failed warning.
   - A first-load failure remains a hard error and does not fabricate an empty result.

## Mobile (~390 x 844 px)

Repeat steps 1–7 with the responsive viewport and additionally verify:

- safe auth loading chrome fits without horizontal overflow;
- table containers scroll horizontally where needed instead of widening the page;
- refresh/error status text remains visible and does not cover controls;
- no protected sidebar/navigation content is exposed before authorization resolves.

## Merge evidence

Record the environment/commit, desktop + mobile result, and any preview limitation in the PR. Browser smoke is a merge gate for #740; if the canonical preview is unavailable, keep that limitation explicit rather than claiming it passed.
