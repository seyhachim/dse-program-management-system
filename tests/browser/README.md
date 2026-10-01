# Authenticated browser smoke

This suite uses Playwright with the existing DSE PMS dev-JWT boundary.

- Tests run only against an isolated database.
- Role contexts inject a valid dev JWT through `dse-pms-dev-token` local storage.
- The frontend reads that override only when `NEXT_PUBLIC_AUTH_MODE=dev`.
- Production/Supabase credentials are never used.
- CI retains traces and screenshots only when the browser job fails.

Run after preparing an isolated PostgreSQL database and dev tokens:

```bash
bun install --cwd tests/browser --frozen-lockfile
cd tests/browser && bunx playwright install chromium
cd ../..
bun run --cwd tests/browser test
```
