import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

export const MAX_EVIDENCE_BYTES = 5 * 1024 * 1024;
export const EVIDENCE_BUCKET = "assessment-evidence-private";
export class EvidenceStorageError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
export type EvidenceAttachment = {
  objectKey: string; filename: string; mimeType: string; sizeBytes: number; sha256: string;
};
export function validateEvidenceFile(encoded: string | undefined, mime: string | undefined, body: unknown) {
  let filename = "";
  try { filename = decodeURIComponent(encoded ?? "").trim(); } catch { /* invalid */ }
  if (!filename || filename.length > 180 || /[\\/\u0000-\u001f\u007f]/u.test(filename) || filename === "." || filename === "..")
    throw new EvidenceStorageError(400, "Invalid evidence filename");
  if (!Buffer.isBuffer(body) || body.length < 8 || body.length > MAX_EVIDENCE_BYTES)
    throw new EvidenceStorageError(400, "Evidence file must be at most 5 MiB");
  const type = mime?.trim().toLowerCase();
  const lower = filename.toLowerCase();
  const pdf = type === "application/pdf" && lower.endsWith(".pdf") && body.subarray(0, 5).toString("ascii") === "%PDF-";
  const jpeg = type === "image/jpeg" && /\.jpe?g$/.test(lower) && body[0] === 255 && body[1] === 216 && body[2] === 255;
  const png = type === "image/png" && lower.endsWith(".png") && body.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if (!pdf && !jpeg && !png) throw new EvidenceStorageError(400, "Only matching PDF, JPG and PNG files are accepted");
  return { bytes: body, filename, mimeType: type!, extension: pdf ? "pdf" : jpeg ? "jpg" : "png" };
}
export function parseEvidenceAttachment(value: unknown): EvidenceAttachment | null {
  if (!value || typeof value !== "object") return null;
  const a = value as Partial<EvidenceAttachment>;
  if (typeof a.objectKey !== "string" || !/^v1\/[0-9a-f-]{36}\.(pdf|jpg|png)$/.test(a.objectKey) ||
      typeof a.filename !== "string" || !a.filename || a.filename.length > 180 || /[\\/\u0000-\u001f\u007f]/u.test(a.filename) ||
      typeof a.mimeType !== "string" || !["application/pdf","image/jpeg","image/png"].includes(a.mimeType) ||
      typeof a.sizeBytes !== "number" || !Number.isInteger(a.sizeBytes) || a.sizeBytes < 8 || a.sizeBytes > MAX_EVIDENCE_BYTES ||
      typeof a.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(a.sha256)) return null;
  return a as EvidenceAttachment;
}
export function publicAttachment(value: unknown) {
  const a = parseEvidenceAttachment(value);
  return a ? { filename: a.filename, mimeType: a.mimeType, sizeBytes: a.sizeBytes, sha256: a.sha256 } : null;
}
let scanning = false;
async function scan(bytes: Buffer): Promise<void> {
  // Operator must install clamscan with current signatures. No shell or user-supplied arguments.
  if (process.env.ASSESSMENT_EVIDENCE_UPLOADS_ENABLED !== "true" || process.env.ASSESSMENT_EVIDENCE_CLAMSCAN_READY !== "true")
    throw new EvidenceStorageError(503, "Private evidence uploads are not configured");
  if (scanning) throw new EvidenceStorageError(429, "Scanner busy; try again shortly");
  scanning = true;
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn("clamscan", ["--no-summary", "--alert-encrypted=yes", "-"], { stdio: ["pipe", "ignore", "ignore"] });
      let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, 30000);
      child.stdin.on("error", () => { child.kill("SIGKILL"); });
      child.once("error", () => { clearTimeout(timer); reject(new EvidenceStorageError(503, "Evidence scanner unavailable")); });
      child.once("close", code => {
        clearTimeout(timer);
        if (!timedOut && code === 0) resolve();
        else reject(new EvidenceStorageError(code === 1 ? 400 : 503, code === 1 ? "File rejected by evidence scanner" : "Evidence scanner unavailable"));
      });
      child.stdin.end(bytes);
    });
  } finally { scanning = false; }
}
async function bucket() {
  if (process.env.ASSESSMENT_EVIDENCE_UPLOADS_ENABLED !== "true" || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)
    throw new EvidenceStorageError(503, "Private evidence storage is not configured");
  const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const info = await admin.storage.getBucket(EVIDENCE_BUCKET);
  if (info.error || !info.data || info.data.public !== false) throw new EvidenceStorageError(503, "Private evidence bucket unavailable");
  return admin.storage.from(EVIDENCE_BUCKET);
}
export async function storeEvidenceFile(file: ReturnType<typeof validateEvidenceFile>): Promise<EvidenceAttachment> {
  await scan(file.bytes);
  const storage = await bucket();
  const objectKey = "v1/" + randomUUID() + "." + file.extension;
  const result = await storage.upload(objectKey, file.bytes, { upsert: false, contentType: file.mimeType, cacheControl: "0" });
  if (result.error) throw new EvidenceStorageError(503, "Private evidence upload failed");
  return { objectKey, filename: file.filename, mimeType: file.mimeType, sizeBytes: file.bytes.length, sha256: createHash("sha256").update(file.bytes).digest("hex") };
}
export async function removeUnlinkedEvidence(a: EvidenceAttachment) {
  const storage = await bucket();
  const result = await storage.remove([a.objectKey]);
  if (result.error) throw new EvidenceStorageError(503, "Private evidence cleanup failed");
}
export async function signEvidenceDownload(a: EvidenceAttachment) {
  const storage = await bucket();
  const { data, error } = await storage.createSignedUrl(a.objectKey, 60, { download: true });
  if (error || !data) throw new EvidenceStorageError(503, "Private evidence download unavailable");
  return { url: data.signedUrl, expiresInSeconds: 60 };
}
