import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const attendanceSource = readFileSync(
  new URL("./attendance-client.tsx", import.meta.url),
  "utf8",
);

describe("Attendance register student identity", () => {
  test("desktop register shows bilingual identity, sex, and row number", () => {
    expect(attendanceSource).toContain(">#</th>");
    expect(attendanceSource).toContain(">English Name</th>");
    expect(attendanceSource).toContain(">Khmer Name</th>");
    expect(attendanceSource).toContain(">Sex</th>");
    expect(attendanceSource).toContain("record.studentKhmerName");
    expect(attendanceSource).toContain("record.studentGender");
    expect(attendanceSource).toContain("{index + 1}");
  });

  test("uses safe neutral identity fallbacks", () => {
    expect(attendanceSource).toContain('record.studentNumber ?? "Pending ID"');
    expect(attendanceSource).toContain('record.studentGender ?? "—"');
    expect(attendanceSource).toContain('<span className="text-muted-foreground">—</span>');
  });

  test("student search includes Khmer name and desktop overflow stays contained", () => {
    expect(attendanceSource).toContain(
      '(record.studentKhmerName ?? "").toLowerCase().includes(query)',
    );
    expect(attendanceSource).toContain(
      'placeholder="English / Khmer name or student ID"',
    );
    expect(attendanceSource).toContain('min-w-[1220px]');
  });
});
