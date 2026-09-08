from pathlib import Path

router = Path("apps/backend/src/plugins/telegram/public-bot/router.ts")
text = router.read_text()
old = '''function inlineKeyboard(\n  route: RouteKey,\n  visibleFaqSlugs?: ReadonlySet<string>,\n): TelegramReplyMarkup {'''
new = '''function inlineKeyboard(\n  route: RouteKey,\n  visibleFaqSlugs?: ReadonlySet<string>,\n  excludedCallbackData?: ReadonlySet<string>,\n): TelegramReplyMarkup {'''
assert old in text
text = text.replace(old, new, 1)
old = '''      row.filter((button) => {\n        if (!visibleFaqSlugs || button.type !== "callback") return true;\n        const faqSlug = FAQ_SLUG_BY_CALLBACK[button.callbackData];'''
new = '''      row.filter((button) => {\n        if (\n          button.type === "callback" &&\n          excludedCallbackData?.has(button.callbackData)\n        ) {\n          return false;\n        }\n        if (!visibleFaqSlugs || button.type !== "callback") return true;\n        const faqSlug = FAQ_SLUG_BY_CALLBACK[button.callbackData];'''
assert old in text
text = text.replace(old, new, 1)
old = '''      replyMarkup: inlineKeyboard("ask"),\n    };\n  }\n\n  const faqCategoryCallbacks'''
new = '''      replyMarkup: inlineKeyboard(\n        "ask",\n        undefined,\n        new Set(["faq:popular"]),\n      ),\n    };\n  }\n\n  const faqCategoryCallbacks'''
assert old in text
text = text.replace(old, new, 1)
router.write_text(text)

test_file = Path("apps/backend/src/plugins/telegram/public-bot/router.test.ts")
test = test_file.read_text()
old = '''    expect(text).not.toContain("Published DSE answer.");\n    expect(client.edited.at(-1)?.messageId).toBe(44);\n    expect(client.answered.at(-1)).toEqual({ callbackQueryId: "cb-1" });'''
new = '''    expect(text).not.toContain("Published DSE answer.");\n    const replyMarkup = client.edited.at(-1)?.replyMarkup;\n    expect(replyMarkup && "inline_keyboard" in replyMarkup).toBe(true);\n    if (replyMarkup && "inline_keyboard" in replyMarkup) {\n      const callbacks = replyMarkup.inline_keyboard\n        .flatMap((row) => row)\n        .flatMap((button) =>\n          "callback_data" in button ? [button.callback_data] : [],\n        );\n      expect(callbacks).not.toContain("faq:popular");\n      expect(callbacks).toContain("faq:category:admission");\n      expect(callbacks).toContain("faq:category:curriculum");\n      expect(callbacks).toContain("faq:category:careers");\n      expect(callbacks).toContain("faq:category:fees");\n    }\n    expect(client.edited.at(-1)?.messageId).toBe(44);\n    expect(client.answered.at(-1)).toEqual({ callbackQueryId: "cb-1" });'''
assert old in test
test = test.replace(old, new, 1)
test_file.write_text(test)

Path("scripts/_tmp_apply_issue_948.py").unlink()
Path(".github/workflows/tmp-issue-948-apply.yml").unlink()
