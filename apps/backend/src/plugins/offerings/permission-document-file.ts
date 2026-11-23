/** Strict permission-letter content checks, independent of untrusted client MIME metadata. */
export const MAX_PERMISSION_DOCUMENT_BYTES = 5 * 1024 * 1024;
export const PERMISSION_DOCUMENT_BUCKET = "student-leave-documents";

export class PermissionDocumentValidationError extends Error {
  readonly status = 400;
  constructor(message: string) {
    super(message);
    this.name = "PermissionDocumentValidationError";
  }
}

export function validatePermissionDocument(
  encodedFileName: string | undefined,
  contentType: string | undefined,
  value: unknown,
): { filename: string; contentType: string; extension: "pdf" | "jpg" | "png"; bytes: Buffer } {
  if (!encodedFileName || encodedFileName.length > 700) {
    throw new PermissionDocumentValidationError("A filename is required");
  }
  let filename: string;
  try {
    filename = decodeURIComponent(encodedFileName).trim();
  } catch {
    throw new PermissionDocumentValidationError("Invalid filename encoding");
  }
  if (!filename || filename.length > 180 || /[\\/\u0000-\u001f\u007f]/u.test(filename) ||
      filename === "." || filename === "..") {
    throw new PermissionDocumentValidationError("Invalid permission document filename");
  }
  if (!Buffer.isBuffer(value) || value.length < 5 || value.length > MAX_PERMISSION_DOCUMENT_BYTES) {
    throw new PermissionDocumentValidationError("Permission document must be between 5 bytes and 5 MB");
  }
  const extension = filename.match(/\.([a-z0-9]+)$/iu)?.[1]?.toLowerCase();
  const type = contentType?.toLowerCase().trim();
  if (!type || !["application/pdf", "image/jpeg", "image/png"].includes(type)) {
    throw new PermissionDocumentValidationError("Only PDF, JPG and PNG permission letters are accepted");
  }

  let canonical: "pdf" | "jpg" | "png";
  if (type === "application/pdf") {
    if (extension !== "pdf" || value.subarray(0, 5).toString("ascii") !== "%PDF-") {
      throw new PermissionDocumentValidationError("The file is not a valid PDF");
    }
    canonical = "pdf";
  } else if (type === "image/jpeg") {
    if (!["jpg", "jpeg"].includes(extension ?? "") ||
        value[0] !== 0xff || value[1] !== 0xd8 || value[2] !== 0xff) {
      throw new PermissionDocumentValidationError("The file is not a valid JPG");
    }
    canonical = "jpg";
  } else {
    if (extension !== "png" ||
        !value.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) {
      throw new PermissionDocumentValidationError("The file is not a valid PNG");
    }
    canonical = "png";
  }
  return { filename, contentType: type, extension: canonical, bytes: value };
}
