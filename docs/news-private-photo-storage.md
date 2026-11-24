# DSE News — Private Photo Storage

## Architecture
- An authenticated lecturer/coordinator first saves a DSE News **Draft**.
- In DSE News → Photos, the browser draws each JPG/PNG/WebP into Canvas. This automatically strips EXIF / camera GPS metadata, constrains the longest side to **1920 px**, and produces WebP at reduced quality (max **2.5 MB**).
- A separate **400 px** WebP thumbnail (max **240 KB**) is also generated.
- The frontend uploads both as one length-delimited octet-stream payload via PMS authenticated backend; **never** sends Supabase credentials to the browser.
- Backend validates both WebP signatures, RIFF lengths, dimensions, metadata, permissions and quotas, then writes immutable random filenames to **private** Supabase Storage bucket \`dse-news-media\`.
- Metadata is in \`DseNewsMedia\` (RLS-enabled, backend-only); existing URL fields remain for legacy links but uploaded photos use **object paths** rather than stored public/signed URLs.
- Editor and authenticated published-student endpoints return **15-minute signed URLs** generated only after PMS RBAC checks. These can be forwarded until expiry; do not share them publicly.
- One cover + up to eight gallery photos per draft. A new cover replaces the old after successful DB save. Remove deletes both metadata and Storage objects (best-effort cleanup if Storage fails; audit log remains).
- Upload/removal resets article's \`mediaApproved\` and increments revision; **unpublish first** to edit photos. Coordinator still approves consent and publishes manually.
- No original JPG/PNG, EXIF, phone, attendance sheet, or participant names are put in the article storage.

## Production provisioning (once)
The deployment is intentionally separate from database migration because the isolated Neon CI/staging database does not have the Supabase \`storage\` schema.

Create a PRIVATE Supabase Storage bucket with:
- ID: \`dse-news-media\`
- \`public: false\`
- \`file_size_limit: 2621440\`
- \`allowed_mime_types: ["image/webp"]\`
- No \`storage.objects\` policies granting anon/authenticated write or read. The server alone uses the already configured \`SUPABASE_URL\` and \`SUPABASE_SERVICE_ROLE_KEY\`.

Confirm bucket is private and metadata table RLS+grants remain restricted. Never use production Supabase Storage keys in a Neon staging upload test. Staging \`AUTH_MODE=neon-staging\` deliberately rejects photo upload until dedicated isolated storage is configured and reviewed.

## Operational checks
1. CI: typecheck, test, authenticated browser smoke, migration/security verifier.
2. Staging: course and news records load. Photo upload must fail with a clear 503 until isolated private Storage exists. This is **intentional**, not a false passing image-upload UAT.
3. Production: first use one approved disposable test image in an authorized **draft**; verify upload, compression bytes, signed thumbnail, preview, removal, unauthorized reads, and zero public storage access.
4. Verify current Sindora draft stays Draft; do not publish before consent is checked.
5. For deletion failures, look for \`DSE News private photo storage cleanup failed\` in backend logs and clean orphan objects from the private bucket after reviewing referenced metadata.

## Limits / future work
- The Canvas step depends on WebP support and modern browsers. The server checks image structure but does not re-encode untrusted bytes; editors remain trusted PMS staff.
- Storage object deletion is best-effort after DB commit. If deletion fails, the object is no longer issued in signed links but may persist until cleaned.
- Image access is signed for 15 minutes; a user can copy the signed URL while it remains valid. For strict immediate revocation, use an authenticated backend media proxy instead.
