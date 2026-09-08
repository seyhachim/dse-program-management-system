from pathlib import Path

router_path = Path("apps/backend/src/plugins/telegram/public-bot/router.ts")
router = router_path.read_text(encoding="utf-8")
old = '''function formatFaqs(title: string, faqs: PublicProgrammeFaq[]): string {\n  if (!faqs.length)\n    return `${title}\\n\\nNo published information is available yet.`;\n  const items = faqs\n    .slice(0, 8)\n    .map((faq) => `• ${faq.question}\\n${faq.shortAnswer || faq.answer}`);\n  return `${title}\\n\\n${items.join("\\n\\n")}`;\n}\n'''
new = '''function formatFaqQuestions(title: string, faqs: PublicProgrammeFaq[]): string {\n  if (!faqs.length)\n    return `${title}\\n\\nNo published information is available yet.`;\n  const questions = faqs.slice(0, 8).map((faq) => `• ${faq.question}`);\n  return `${title}\\n\\n${questions.join("\\n")}\\n\\nType one of these questions directly, or choose a topic below.`;\n}\n'''
if old not in router:
    raise SystemExit("router FAQ formatter pattern not found")
router = router.replace(old, new, 1).replace("formatFaqs(", "formatFaqQuestions(")
router_path.write_text(router, encoding="utf-8")

locale_path = Path("apps/backend/src/plugins/telegram/public-bot/locale.ts")
locale = locale_path.read_text(encoding="utf-8")
needle = '    .replace("Choose an option below.", "សូមជ្រើសជម្រើសខាងក្រោម។")\n'
insert = needle + '    .replace("Type one of these questions directly, or choose a topic below.", "សូមវាយសំណួរមួយក្នុងចំណោមសំណួរទាំងនេះដោយផ្ទាល់ ឬជ្រើសប្រធានបទខាងក្រោម។")\n'
if "Type one of these questions directly, or choose a topic below." not in locale:
    if needle not in locale:
        raise SystemExit("locale insertion point not found")
    locale = locale.replace(needle, insert, 1)
locale_path.write_text(locale, encoding="utf-8")

test_path = Path("apps/backend/src/plugins/telegram/public-bot/router.test.ts")
test = test_path.read_text(encoding="utf-8")
old_test = '''  test("FAQ callback edits the existing message and answers the callback query", async () => {\n    const response = await webhook({\n      update_id: 4,\n      callback_query: {\n        id: "cb-1",\n        data: "faq:popular",\n        message: { message_id: 44, chat: { id: 12 } },\n      },\n    });\n    expect(response.status).toBe(200);\n    expect(client.edited.at(-1)?.text).toContain("Published DSE answer.");\n    expect(client.edited.at(-1)?.messageId).toBe(44);\n    expect(client.answered.at(-1)).toEqual({ callbackQueryId: "cb-1" });\n  });\n'''
new_test = '''  test("Popular Questions lists titles without dumping FAQ answers", async () => {\n    const response = await webhook({\n      update_id: 4,\n      callback_query: {\n        id: "cb-1",\n        data: "faq:popular",\n        message: { message_id: 44, chat: { id: 12 } },\n      },\n    });\n    expect(response.status).toBe(200);\n    const text = client.edited.at(-1)?.text ?? "";\n    expect(text).toContain("• What is DSE?");\n    expect(text).toContain("Type one of these questions directly");\n    expect(text).not.toContain("Published DSE answer.");\n    expect(client.edited.at(-1)?.messageId).toBe(44);\n    expect(client.answered.at(-1)).toEqual({ callbackQueryId: "cb-1" });\n  });\n'''
if old_test not in test:
    raise SystemExit("router test pattern not found")
test = test.replace(old_test, new_test, 1)
test_path.write_text(test, encoding="utf-8")

locale_test_path = Path("apps/backend/src/plugins/telegram/public-bot/locale-menu-ux.test.ts")
locale_test_path.write_text('''import { describe, expect, test } from "bun:test";\nimport { localizeBotText } from "./locale.ts";\n\ndescribe("public Telegram compact menu localization", () => {\n  test("localizes compact menu prompt to Khmer", () => {\n    expect(localizeBotText("About DSE\\n\\nChoose an option below.", "km")).toBe(\n      "អំពី DSE\\n\\nសូមជ្រើសជម្រើសខាងក្រោម។",\n    );\n  });\n\n  test("localizes compact question-list guidance without changing question content", () => {\n    const localized = localizeBotText(\n      "Popular Questions\\n\\n• តើ DSE ជាអ្វី?\\n\\nType one of these questions directly, or choose a topic below.",\n      "km",\n    );\n    expect(localized).toContain("សំណួរពេញនិយម");\n    expect(localized).toContain("• តើ DSE ជាអ្វី?");\n    expect(localized).toContain("សូមវាយសំណួរមួយក្នុងចំណោមសំណួរទាំងនេះដោយផ្ទាល់ ឬជ្រើសប្រធានបទខាងក្រោម។");\n  });\n});\n''', encoding="utf-8")

# Remove temporary automation files before committing the real change.
Path("scripts/_tmp_apply_issue_774.py").unlink(missing_ok=True)
Path(".github/workflows/tmp-issue-774-apply.yml").unlink(missing_ok=True)
