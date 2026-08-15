import { createHash } from "node:crypto";
import { inspectImage } from "../image-validation";
import type { ImageEvidence } from "./types";

export interface UploadedImageContext {
  buffer: Buffer;
  extractedText: string;
  mediaType: string | null;
  originalFilename: string | null;
}

/**
 * Produces stable evidence metadata for an uploaded screenshot. The original
 * bytes remain available to the request while analysis runs, but are not
 * placed in the API response or persisted in history. Reverse-image provenance
 * is explicitly not claimed until a real provider is connected.
 */
export function buildImageEvidence(
  upload: UploadedImageContext,
): ImageEvidence {
  const sha256 = createHash("sha256").update(upload.buffer).digest("hex");
  const inspection = inspectImage(upload.buffer);
  const id = `image:${sha256.slice(0, 24)}`;

  return {
    id,
    sha256,
    perceptualHash: null,
    width: inspection.width,
    height: inspection.height,
    mediaType: upload.mediaType,
    byteLength: upload.buffer.byteLength,
    originalFilename: upload.originalFilename,
    extractedText: upload.extractedText,
    evidenceIds: [id, `${id}:ocr`],
    reverseImageSearchStatus: "not_implemented",
  };
}
