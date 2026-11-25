import { z } from "zod";

const telegramId = z.number().int().positive().safe();
const incoming = z.object({
  message: z.object({
    from: z.object({ id: telegramId, is_bot: z.literal(false) }),
    chat: z.object({ id: telegramId, type: z.literal("private") }),
    text: z.string().optional(),
    contact: z.object({ user_id: telegramId, phone_number: z.string().min(1).max(40) }).optional(),
    forward_origin: z.unknown().optional(),
    forward_from: z.unknown().optional(),
    forward_date: z.unknown().optional(),
  }),
});

export const STUDENT_REGISTRATION_START = "student_register";
export const STUDENT_REGISTRATION_SKIP = "Continue without phone";

export type StudentRegistrationBotAction =
  | { kind: "start" | "skip"; telegramUserId: string }
  | { kind: "contact"; telegramUserId: string; phone: string };

export function parseStudentRegistrationBotAction(raw: unknown): StudentRegistrationBotAction | null {
  const parsed = incoming.safeParse(raw);
  if (!parsed.success) return null;
  const msg = parsed.data.message;
  if (msg.from.id !== msg.chat.id || msg.forward_origin !== undefined ||
      msg.forward_from !== undefined || msg.forward_date !== undefined) return null;
  const telegramUserId = String(msg.from.id);
  if (msg.contact) {
    if (msg.contact.user_id !== msg.from.id) return null;
    const phone = msg.contact.phone_number.trim().replace(/[ ()-]/g, "");
    if (!/^\+?[0-9]{7,15}$/.test(phone)) return null;
    return { kind: "contact", telegramUserId, phone };
  }
  if (msg.text === `/start ${STUDENT_REGISTRATION_START}`) return { kind: "start", telegramUserId };
  if (msg.text === STUDENT_REGISTRATION_SKIP) return { kind: "skip", telegramUserId };
  return null;
}

export function studentRegistrationBotUrl(username: string | undefined): string | null {
  const name = username?.replace(/^@/, "");
  return name && /^[A-Za-z0-9_]{5,32}$/.test(name)
    ? `https://t.me/${name}?start=${STUDENT_REGISTRATION_START}` : null;
}
