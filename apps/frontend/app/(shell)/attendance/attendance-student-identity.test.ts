import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const attendanceSource = readFileSync(
  new URL("./attendance-client.tsx", import.meta.url),
  "utf8",
);
const layoutSource = readFileSync(
  new URL("./mobile-attendance-layout.ts", import.meta.url),
  "utf8",
);

describe("Attendance register student identity", () => {
  test("compact desktop register preserves bilingual identity, sex, row number, and recheck action", () => {
    expect(attendanceSource).toContain('>Student</th>');
    expect(attendanceSource).toContain('>Status</th>');
    expect(attendanceSource).toContain('>Note</th>');
    expect(attendanceSource).toContain('>Recheck</th>');
    expect(attendanceSource).toContain('{index + 1}');
    expect(attendanceSource).toContain('lang="km"');
    expect(attendanceSource).toContain('record.studentKhmerName');
    expect(attendanceSource).toContain('record.studentName');
    expect(attendanceSource).toContain('record.studentGender ?? "—"');
    expect(attendanceSource).toContain('<RecheckAction record={record}');
  });

  test("both layouts use safe neutral identity fallbacks", () => {
    expect(attendanceSource).toContain('record.studentNumber ?? "Pending ID"');
    expect(attendanceSource).toContain('record.studentGender ?? "—"');
    expect(attendanceSource).toContain('record.studentKhmerName ?');
    expect(attendanceSource).toContain('Sex: {record.studentGender ?? "—"}');
  });

  test("student search includes Khmer name and compact desktop scrolling stays inside register", () => {
    expect(attendanceSource).toContain(
      '(record.studentKhmerName ?? "").toLowerCase().includes(query)',
    );
    expect(attendanceSource).toContain(
      'placeholder="English / Khmer name or student ID"',
    );
    expect(attendanceSource).toContain('min-w-[990px]');
    expect(layoutSource).toContain('desktopRegister: "hidden overflow-x-auto md:block"');
  });
});
