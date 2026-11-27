import { describe, expect, test } from "bun:test";
import { parseStudentRegistrationBotAction, studentRegistrationBotUrl } from "./student-registration-bot-contract.ts";

const message = { from: { id: 12345, is_bot: false }, chat: { id: 12345, type: "private" } };
describe("student registration bot trust boundary", () => {
  test("accepts explicit private registration start", () => {
    expect(parseStudentRegistrationBotAction({ message: { ...message, text: "/start student_register" } }))
      .toEqual({ kind: "start", telegramUserId: "12345" });
  });
  test("validates the configured bot username", () => {
    expect(studentRegistrationBotUrl("@example_pms_bot")).toBe("https://t.me/example_pms_bot?start=student_register");
    expect(studentRegistrationBotUrl("bad.example/path")).toBeNull();
  });
  test("accepts own contact and optional skip", () => {
    expect(parseStudentRegistrationBotAction({ message: { ...message, contact: { user_id: 12345, phone_number: "+855 12 345 678" } } }))
      .toEqual({ kind: "contact", telegramUserId: "12345", phone: "+85512345678" });
    expect(parseStudentRegistrationBotAction({ message: { ...message, text: "Continue without phone" } }))
      .toEqual({ kind: "skip", telegramUserId: "12345" });
  });
  test("rejects group, other user's contact, forwarded contact, absent contact owner, bot sender and invalid phone", () => {
    const contact = { user_id: 12345, phone_number: "+85512345678" };
    for (const patch of [
      { chat: { id: 12345, type: "group" }, contact },
      { chat: { id: 12346, type: "private" }, contact },
      { contact: { ...contact, user_id: 12346 } },
      { contact: { phone_number: contact.phone_number } },
      { forward_origin: {}, contact },
      { from: { id: 12345, is_bot: true }, contact },
      { contact: { ...contact, phone_number: "invalid" } },
    ]) expect(parseStudentRegistrationBotAction({ message: { ...message, ...patch } })).toBeNull();
  });
  test("does not intercept existing destination registration commands", () => {
    expect(parseStudentRegistrationBotAction({ message: { ...message, text: "/pms_register abcdefghijklmnopqrstuvwxyz" } })).toBeNull();
  });
});
