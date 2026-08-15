from pathlib import Path

path = Path("packages/shared-types/src/plugins.ts")
text = path.read_text()
old = '''export const qaManifest: PluginManifest = {
  id: "qa",
  name: "Quality Assurance",
  version: "0.1.0",
  description:
    "Programme-scoped AUN-QA evidence, self-assessment, review, and readiness workflow.",
  routes: [
    {
      label: "QA Dashboard",
      path: "/qa-dashboard",
      icon: "shield-check",
      roles: ["admin", "program_coordinator", "qa_reviewer"],
      group: "Quality Assurance",
    },
  ],
  permissions: ["qa:read", "qa:write"],
};
'''
new = '''export const qaManifest: PluginManifest = {
  id: "qa",
  name: "Quality Assurance",
  version: "0.2.0",
  description:
    "Programme-scoped AUN-QA evidence, contributor work, self-assessment, review, and readiness workflow.",
  routes: [
    {
      label: "AUN-QA Workspace",
      path: "/aun-qa",
      icon: "shield-check",
      roles: ["admin", "program_coordinator", "qa_contributor"],
      group: "Quality Assurance",
    },
    {
      label: "QA Evidence Analysis",
      path: "/qa-dashboard",
      icon: "file-check",
      roles: ["admin", "program_coordinator", "qa_reviewer"],
      group: "Quality Assurance",
    },
  ],
  permissions: [
    "qa:read",
    "qa:write",
    "qa:contribute",
    "qa:review",
    "qa:manage",
  ],
};
'''
if text.count(old) != 1:
    raise SystemExit(f"Expected qaManifest anchor once, found {text.count(old)}")
path.write_text(text.replace(old, new, 1))
