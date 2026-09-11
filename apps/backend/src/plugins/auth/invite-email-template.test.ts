import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const authDocsDir = resolve(import.meta.dir, "../../../../../docs/auth");
const template = readFileSync(resolve(authDocsDir, "supabase-invite-email.html"), "utf8");
const subject = readFileSync(resolve(authDocsDir, "supabase-invite-email.subject.txt"), "utf8").trim();

describe("DSE Supabase invite email template", () => {
  test("keeps the Supabase confirmation URL as the activation target and fallback", () => {
    expect(template.match(/{{ \.ConfirmationURL }}/g)?.length).toBeGreaterThanOrEqual(2);
    expect(template).toContain('href="{{ .ConfirmationURL }}"');
  });

  test("uses trusted invitation metadata for personalization and role-safe copy", () => {
    expect(template).toContain("{{ .Data.name }}");
    expect(template).toContain("{{ .Email }}");
    expect(template).toContain('{{ if eq .Data.role "lecturer" }}');
    expect(template).toContain("As a lecturer");
    expect(template).toContain("available to your assigned role");
  });

  test("contains the required DSE onboarding identity and CTA", () => {
    expect(subject).toBe("You're invited to DSE Program Management System");
    expect(template).toContain("Data Science and Engineering Programme");
    expect(template).toContain("Royal University of Phnom Penh");
    expect(template).toContain("DSE Program Management System");
    expect(template).toContain("Activate DSE Account");
    expect(template).toContain("safely ignore this email");
  });

  test("does not embed common secret or credential fields", () => {
    expect(template).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(template).not.toContain("temporaryPassword");
    expect(template).not.toContain("access_token=");
  });
});
