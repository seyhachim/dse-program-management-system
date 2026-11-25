# Opportunity poster and archive management

## Staff workflow

- Create a verified opportunity (title, source, eligibility, registration deadline). Select an optional JPG/PNG/WebP poster (source up to 20 MB). The browser decodes and resizes to fit within 1200 × 1800 px, re-encodes to WebP quality 0.8, and sends the smaller of original and WebP. The final upload is still limited to 5 MB; unsupported/failed optimization is not silently uploaded.
- The image is stored in the dedicated Supabase Storage `opportunity-posters` bucket and only its generated object path is kept in the PMS database.
- Drafts are never shown in the student feed. Edit/review a draft, then select **Publish**. Only a programme administrator or coordinator can do this.
- **Archive** hides an opportunity immediately from the feed and detail API.
- Select **View archived**, then **Restore to draft**. Recheck the official source, change the deadline if necessary, and publish again. There is no one-click unreviewed public restoration.
- Images are public promotional material; anyone who has the image URL can view the standalone image. The opportunity bank itself remains authenticated and programme-scoped.
- The previous file is removed from Storage when a draft's poster is replaced. Storage objects are not included in PostgreSQL-only backups.

## Deployment setup

Provision the public Supabase bucket (production and any image-enabled staging) with:
- ID `opportunity-posters`
- Public read enabled; no frontend/anon/authenticated upload policies
- Maximum object size 5 MiB (5242880 bytes)
- Allowed MIME types: `image/jpeg`, `image/png`, `image/webp`
- Backend `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` must be configured. Never expose the service role key in the frontend.
- All object writes use backend-authenticated staff-only routes; the uploader checks file signatures and generates an unguessable path.
- Prisma migration `20261123180000_opportunity_poster_path` adds the nullable path field to existing opportunity records.

## Test checklist

1. Coordinator uploads a JPG/PNG/WebP; student sees thumbnail and full image after publication.
2. An ordinary student cannot access management endpoints or upload a poster; fake MIME uploads and files over 5 MiB are rejected.
3. Archive hides an opportunity from student browse/detail; direct links cannot show archived content.
4. Restore to draft does not make it public; an expired deadline blocks publishing until edited.
5. Re-publish after source review returns it to the feed, with a new audit entry.
