from pathlib import Path
p=Path('apps/backend/prisma/schema.prisma')
s=p.read_text()
old='''  engine          String\n  engineVersion   String\n  createdAt       DateTime                   @default(now())\n'''
new='''  engine          String\n  engineVersion   String\n  promptVersion   String                     @default(\"\")\n  createdAt       DateTime                   @default(now())\n'''
if 'promptVersion   String' not in s:
    if old not in s: raise SystemExit('analysis anchor not found')
    s=s.replace(old,new,1)
old2='''  @@index([expectationId, createdAt])\n}\n'''
new2='''  @@index([expectationId, createdAt])\n  @@index([engine, promptVersion])\n}\n'''
if '@@index([engine, promptVersion])' not in s:
    if old2 not in s: raise SystemExit('index anchor not found')
    s=s.replace(old2,new2,1)
p.write_text(s)
