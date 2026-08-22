from pathlib import Path
root = Path(__file__).resolve().parents[1]

shared = root / 'packages/shared-types/src/public-programme-info.ts'
s = shared.read_text(encoding='utf-8')
old = 'keywordsKm: z.array(z.string().trim().min(1).max(80)).default([]),'
if old not in s:
    raise SystemExit('keywordsKm schema pattern not found')
s = s.replace(old, 'keywordsKm: z.array(z.string().trim().min(1).max(80)).optional(),')
shared.write_text(s, encoding='utf-8')

service = root / 'apps/backend/src/plugins/programme/public-programme-info-service.ts'
s = service.read_text(encoding='utf-8')
old = 'keywordsKm: input.keywordsKm,'
if old not in s:
    raise SystemExit('service keywordsKm pattern not found')
s = s.replace(old, 'keywordsKm: input.keywordsKm ?? [],')
service.write_text(s, encoding='utf-8')

frontend = root / 'apps/frontend/app/(shell)/public-information/public-information-client.tsx'
s = frontend.read_text(encoding='utf-8')
old = 'keywordsKm: faq.keywordsKm.join(", "),'
if old not in s:
    raise SystemExit('frontend keywordsKm pattern not found')
s = s.replace(old, 'keywordsKm: faq.keywordsKm?.join(", ") ?? "",')
frontend.write_text(s, encoding='utf-8')

(root / '.github/workflows/issue-545-fix.yml').unlink(missing_ok=True)
Path(__file__).unlink(missing_ok=True)
