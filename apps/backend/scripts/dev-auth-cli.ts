import { z } from "zod";
import type { Role } from "../src/core/auth/token.ts";

const emailSchema = z.string().trim().toLowerCase().email("Expected a valid email address");

export const GEN_TOKEN_ROLES: Role[] = [
  "admin",
  "program_coordinator",
  "program_secretary",
  "lecturer",
  "qa_reviewer",
  "student",
];

function optionValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

export function parseGenTokenArgs(args: string[]) {
  const roleValue = optionValue(args, "--role") ?? "admin";
  if (!GEN_TOKEN_ROLES.includes(roleValue as Role)) {
    throw new Error(`Invalid role "${roleValue}". Use one of: ${GEN_TOKEN_ROLES.join(", ")}`);
  }
  const emailValue = optionValue(args, "--email");
  return {
    role: roleValue as Role,
    email: emailValue ? emailSchema.parse(emailValue) : undefined,
  };
}

export function parseStudentPersonaArgs(args: string[]) {
  const emailValue = optionValue(args, "--email");
  if (!emailValue) {
    throw new Error("--email is required");
  }
  const studentEmailValue = optionValue(args, "--student-email") ?? "ada@dse.dev";
  return {
    email: emailSchema.parse(emailValue),
    studentEmail: emailSchema.parse(studentEmailValue),
  };
}

export function assertDevAuthMode(authMode: string | undefined) {
  if (authMode !== "dev") {
    throw new Error(
      "Dev student personas are allowed only when AUTH_MODE=dev. Refusing to modify Supabase/production auth data.",
    );
  }
}

export function assertDevTokenSigningConfigured(jwtSecret: string | undefined) {
  if (!jwtSecret) {
    throw new Error(
      "JWT_SECRET must be configured before creating a dev student persona. No database changes were made.",
    );
  }
}
