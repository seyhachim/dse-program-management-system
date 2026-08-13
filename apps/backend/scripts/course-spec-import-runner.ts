import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";
import { spawn } from "bun";

type JsonObject = Record<string, unknown>;

function optionValue(argv: string[], name: string): string | undefined {
  return argv.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1);
}

async function walkJsonFiles(path: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const full = join(path, entry.name);
    if (entry.isDirectory()) out.push(...(await walkJsonFiles(full)));
    else if (entry.isFile() && extname(entry.name).toLowerCase() === ".json") out.push(full);
  }
  return out.sort();
}

function normalizeCanonicalJson(value: JsonObject): JsonObject {
  const assessments = Array.isArray(value.assessments)
    ? value.assessments.map((raw) => {
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
        const item = { ...(raw as JsonObject) };
        // Legacy DOCX extraction may leave the I/G cell blank. The importer
        // already treats non-group values as Individual, so normalize null here
        // instead of failing Zod validation before import rules can run.
        if (item.mode == null || String(item.mode).trim() === "") {
          item.mode = "individual";
        }
        return item;
      })
    : value.assessments;

  return { ...value, assessments };
}

async function main() {
  const argv = process.argv.slice(2);
  const positional = argv.filter((arg) => !arg.startsWith("--"));
  const input = positional[0];
  if (!input) {
    throw new Error(
      "Usage: bun run course-spec:import <json-directory> [--course=CODE] [other importer options]",
    );
  }

  const requestedCourse = optionValue(argv, "--course")?.toUpperCase();
  const temp = await mkdtemp(join(tmpdir(), "dse-course-spec-import-"));

  try {
    const candidates = await walkJsonFiles(input);
    let selected = 0;

    for (const file of candidates) {
      const name = basename(file);
      if (name === "schema.json" || name === "import-report.json") continue;

      let raw: JsonObject;
      try {
        raw = JSON.parse(await readFile(file, "utf8")) as JsonObject;
      } catch {
        // Preserve malformed JSON so the core importer reports it normally.
        await writeFile(join(temp, name), await readFile(file, "utf8"));
        selected += 1;
        continue;
      }

      const course = raw.course;
      const code =
        course && typeof course === "object" && !Array.isArray(course)
          ? String((course as JsonObject).code ?? "").toUpperCase()
          : "";

      if (requestedCourse && code !== requestedCourse) continue;

      await writeFile(
        join(temp, name),
        JSON.stringify(normalizeCanonicalJson(raw), null, 2),
      );
      selected += 1;
    }

    if (requestedCourse && selected === 0) {
      throw new Error(`Course ${requestedCourse} was not found in ${input}`);
    }

    const forwarded = argv.filter(
      (arg, index) => index !== argv.indexOf(input) && !arg.startsWith("--course="),
    );

    const child = spawn({
      cmd: ["bun", "scripts/course-spec-import.ts", temp, ...forwarded],
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    });
    const exitCode = await child.exited;
    process.exitCode = exitCode;
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
