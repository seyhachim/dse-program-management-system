# Public DSE News — explicit website publication

Canonical public website: /program → /program/news → /program/news/[article-id].

This is the existing DSE programme page hosted inside DSE PMS. The external RUPP Faculty of Engineering domain is a different site and is **not** updated automatically.

## Two distinct audiences and separate approvals
1. Author saves DSE News Draft and attaches photos. Private Course Activity participant records are unrelated.
2. Coordinator/Admin publishes to **DSE students** with existing Published status (Student Portal only).
3. Coordinator/Admin reviews content and photo permission for the unrestricted internet audience, then chooses **Approve for public website**. Only this action creates a non-null \`publicPublishedAt\`.
4. The public API lists only articles with both \`status='Published'\` and \`publicPublishedAt IS NOT NULL\` and validated media approval.
5. Coordinator can revoke public publication without affecting Student Portal visibility. Changing status to Draft/Archived automatically revokes public access. Public-approved articles must be unpublished from the website before editing.

The migration does **not** auto-publish already published articles. In particular, the Sindora article must go through step 3 before non-students can read it.

## Data and media security
- Public projection contains only title, summary, plain text article body, tags, date, and approved cover/gallery URLs. No participants, study-trip sign-in sheets, student identifiers, attendance statuses, evidence links, user IDs or object storage paths.
- The \`dse-news-media\` bucket remains **private**. Only backend server can sign a 15-minute read URL after checking public publication; bucket is never made public.
- Public API is read-only, returns 404 for drafts/unapproved articles and uses \`Cache-Control: no-store\` so revocation is not hidden by a caching layer.
- Staff action is optimistic-versioned and recorded as \`public_published\` or \`public_unpublished\` in existing DseNewsAuditEvent. No new grants to public SQL tables.
- Search and cards use the public endpoint only. Sitemap lists only approved article IDs. Robots excludes private PMS routes.

## Verification
- Run shared typechecks, Prisma validation, isolated migration/security verifier and backend authorization integration tests.
- Browser: open /program anonymously, follow News & Activities, check search and 375px layout; coordinator sees approval button and public link only after approving.
- Staging: intentionally no public articles by default; verify empty News listing and no private data leaks.
- Production after deployment: verify /program/news is open without login and Sindora remains absent until explicitly approved for public use.
- After public approval and separate photo review, check public article's SEO metadata and link in a private/incognito browser. Verify removing approval returns 404 (do not use the student's authenticated reader for this test).
