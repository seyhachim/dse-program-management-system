from pathlib import Path

path = Path("apps/frontend/app/(shell)/aun-qa/workspace-client.tsx")
text = path.read_text()

old = '''                          <td className="py-3 pr-4">
                            <div className="font-medium">{requirement.code}</div>
                            <div className="mt-0.5 max-w-md text-xs text-muted-foreground">{requirement.title}</div>
                          </td>'''
new = '''                          <td className="py-3 pr-4">
                            <Link href={`/aun-qa/sar/${requirement.code}`} className="font-medium text-primary hover:underline">
                              {requirement.code}
                            </Link>
                            <div className="mt-0.5 max-w-md text-xs text-muted-foreground">{requirement.title}</div>
                          </td>'''
if old in text:
    text = text.replace(old, new, 1)

old = '''                          <td className="py-3 pr-4"><StatusPill>Not started</StatusPill></td>'''
new = '''                          <td className="py-3 pr-4">
                            <Link href={`/aun-qa/sar/${requirement.code}`} className="text-xs font-medium text-primary hover:underline">
                              Open editor
                            </Link>
                          </td>'''
if old in text:
    text = text.replace(old, new, 1)

old = '''              <p className="mt-4 text-xs text-muted-foreground">
                Evidence can continue to be collected now. The structured SAR writing action will appear here once authoring is enabled.
              </p>'''
new = '''              <div className="mt-4 flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">Write the narrative around mapped evidence and PMS data.</p>
                <Link
                  href={`/aun-qa/sar/${item.assignment.requirementCode}`}
                  className="rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground"
                >
                  Open SAR editor
                </Link>
              </div>'''
if old in text:
    text = text.replace(old, new, 1)

path.write_text(text)
