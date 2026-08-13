export type JsonObject = Record<string, unknown>;

function clean(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function asRows(value: unknown): string[][] | null {
  if (!Array.isArray(value)) return null;
  const rows = value.filter(Array.isArray).map((row) => row.map(clean));
  return rows.length ? rows : null;
}

function collectSltTables(value: unknown, out: string[][][] = []): string[][][] {
  if (!value || typeof value !== "object") return out;

  if (Array.isArray(value)) {
    const rows = asRows(value);
    if (rows) {
      const text = rows.flat().join(" ").toLowerCase();
      if (
        text.includes("total hours for student learning time") ||
        (text.includes("total hours") && text.includes("slt") && text.includes("plo"))
      ) {
        out.push(rows);
      }
    }
    for (const item of value) collectSltTables(item, out);
    return out;
  }

  const object = value as JsonObject;
  const rows = asRows(object.rows);
  if (rows) {
    const surroundingText = [
      clean(object.label),
      clean(object.text),
      rows.flat().join(" "),
    ]
      .join(" ")
      .toLowerCase();

    if (
      surroundingText.includes("total hours for student learning time") ||
      (surroundingText.includes("total hours") &&
        surroundingText.includes("slt") &&
        surroundingText.includes("plo"))
    ) {
      out.push(rows);
    }
  }

  for (const child of Object.values(object)) collectSltTables(child, out);
  return out;
}

function numericHours(value: string): number | null {
  const normalized = value.replace(/,/g, "").trim();
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;
  const number = Number(normalized);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

export function recoverCloSltHours(value: JsonObject): Map<string, number> {
  const result = new Map<string, number>();
  const rawSections = value.rawSections;
  if (!rawSections) return result;

  for (const rows of collectSltTables(rawSections)) {
    for (const row of rows) {
      const cloCell = row.find((cell) => /^CLO\s*\d+$/i.test(cell));
      if (!cloCell) continue;

      const code = cloCell.replace(/\s+/g, "").toUpperCase();
      const values = row
        .filter((cell) => cell !== cloCell)
        .map(numericHours)
        .filter((number): number is number => number != null && number > 0);

      if (!values.length) continue;

      // This table is the CLO × PLO SLT-hours table. A CLO can support more than
      // one PLO, while CourseSpecClo.sltHours stores the CLO's total SLT. Sum the
      // non-zero PLO cells to recover that total without inventing allocations.
      const total = values.reduce((sum, number) => sum + number, 0);
      if (total > 0) result.set(code, total);
    }
  }

  return result;
}

export function normalizeCanonicalJson(value: JsonObject): JsonObject {
  const sltByClo = recoverCloSltHours(value);

  const clos = Array.isArray(value.clos)
    ? value.clos.map((raw) => {
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
        const item = { ...(raw as JsonObject) };
        const code = clean(item.code).replace(/\s+/g, "").toUpperCase();
        if (item.sltHours == null && sltByClo.has(code)) {
          item.sltHours = sltByClo.get(code)!;
        }
        return item;
      })
    : value.clos;

  const assessments = Array.isArray(value.assessments)
    ? value.assessments.map((raw) => {
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
        const item = { ...(raw as JsonObject) };
        if (item.mode == null || clean(item.mode) === "") item.mode = "individual";
        return item;
      })
    : value.assessments;

  return { ...value, clos, assessments };
}
