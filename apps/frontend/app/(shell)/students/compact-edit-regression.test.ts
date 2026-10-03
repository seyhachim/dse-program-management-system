import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const clientSource = readFileSync(
  new URL("./students-client.tsx", import.meta.url),
  "utf8",
);
const apiSource = readFileSync(
  new URL("../../../lib/students.ts", import.meta.url),
  "utf8",
);

describe("compact student list edit safety", () => {
  test("exposes a profile-aware detail GET", () => {
    expect(apiSource).toContain("get(id: string): Promise<Student>");
    expect(apiSource).toContain("/api/students/${id}");
  });

  test("loads detail before passing an existing record to StudentForm", () => {
    expect(clientSource).toContain("const detail = await studentsApi.get(student.id)");
    expect(clientSource).toContain("setEditing(detail)");
    expect(clientSource).not.toContain("setEditing(s);\n            setFormOpen(true)");
  });
  test("keeps the roster compact while surfacing current placement", () => {
    expect(clientSource).toContain('header: "Study Year / Class"');
    expect(clientSource).toContain('s.currentStudyYear ? `Year ${s.currentStudyYear}` : "Study year not set"');
    expect(clientSource).toContain('s.currentClassCode ?? "Class not assigned"');
    expect(clientSource).toContain('<p className="mt-0.5 text-xs text-muted-foreground">{s.category}</p>');
    expect(clientSource).not.toContain('{ key: "category", header: "Category"');
    expect(clientSource).not.toContain('key: "active"');
    expect(clientSource).toContain('header: "Student Status"');
  });

});
