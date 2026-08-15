import { ApiError } from "./errors";

/**
 * File signatures for the formats the OCR engine accepts.
 *
 * The multipart Content-Type is supplied by the client and is therefore not
 * evidence of anything. Checking the leading bytes means a renamed script or
 * executable is rejected before it reaches the decoder, which both closes the
 * obvious upload hole and prevents malformed input from crashing the OCR
 * worker.
 */
const SIGNATURES: { name: string; bytes: number[]; offset?: number }[] = [
  { name: "png", bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { name: "jpeg", bytes: [0xff, 0xd8, 0xff] },
  { name: "bmp", bytes: [0x42, 0x4d] },
  { name: "tiff-le", bytes: [0x49, 0x49, 0x2a, 0x00] },
  { name: "tiff-be", bytes: [0x4d, 0x4d, 0x00, 0x2a] },
  // WebP is "RIFF....WEBP": check both halves, skipping the 4-byte length.
  { name: "webp-riff", bytes: [0x52, 0x49, 0x46, 0x46] },
];

const MAX_IMAGE_PIXELS = 12_000_000;

function startsWith(buffer: Buffer, bytes: number[], offset = 0): boolean {
  if (buffer.length < offset + bytes.length) return false;
  return bytes.every((byte, index) => buffer[offset + index] === byte);
}

export function detectImageFormat(buffer: Buffer): string | null {
  for (const signature of SIGNATURES) {
    if (!startsWith(buffer, signature.bytes, signature.offset)) continue;

    if (signature.name === "webp-riff") {
      const isWebp = startsWith(buffer, [0x57, 0x45, 0x42, 0x50], 8);
      if (!isWebp) continue;
      return "webp";
    }

    return signature.name;
  }

  return null;
}

export interface ImageDimensions {
  width: number;
  height: number;
}

function readUInt16(buffer: Buffer, offset: number, littleEndian: boolean): number | null {
  if (offset < 0 || offset + 2 > buffer.length) return null;
  return littleEndian ? buffer.readUInt16LE(offset) : buffer.readUInt16BE(offset);
}

function readUInt32(buffer: Buffer, offset: number, littleEndian: boolean): number | null {
  if (offset < 0 || offset + 4 > buffer.length) return null;
  return littleEndian ? buffer.readUInt32LE(offset) : buffer.readUInt32BE(offset);
}

function pngDimensions(buffer: Buffer): ImageDimensions | null {
  if (buffer.length < 24 || buffer.toString("ascii", 12, 16) !== "IHDR") return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function bmpDimensions(buffer: Buffer): ImageDimensions | null {
  if (buffer.length < 26) return null;
  return {
    width: Math.abs(buffer.readInt32LE(18)),
    height: Math.abs(buffer.readInt32LE(22)),
  };
}

function jpegDimensions(buffer: Buffer): ImageDimensions | null {
  let offset = 2;

  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    while (buffer[offset] === 0xff) offset += 1;
    const marker = buffer[offset++];
    if (marker === undefined || marker === 0xd8 || marker === 0xd9) continue;
    if (offset + 2 > buffer.length) return null;

    const segmentLength = buffer.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > buffer.length) return null;

    const isStartOfFrame =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);

    if (isStartOfFrame && segmentLength >= 7) {
      return {
        height: buffer.readUInt16BE(offset + 3),
        width: buffer.readUInt16BE(offset + 5),
      };
    }

    offset += segmentLength;
  }

  return null;
}

function webpDimensions(buffer: Buffer): ImageDimensions | null {
  if (buffer.length < 30) return null;
  const chunkType = buffer.toString("ascii", 12, 16);

  if (chunkType === "VP8X") {
    return {
      width: 1 + buffer.readUIntLE(24, 3),
      height: 1 + buffer.readUIntLE(27, 3),
    };
  }

  if (chunkType === "VP8 " && buffer.length >= 30) {
    return {
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff,
    };
  }

  if (chunkType === "VP8L" && buffer.length >= 25 && buffer[20] === 0x2f) {
    const b1 = buffer[21]!;
    const b2 = buffer[22]!;
    const b3 = buffer[23]!;
    const b4 = buffer[24]!;
    return {
      width: 1 + (b1 | ((b2 & 0x3f) << 8)),
      height: 1 + ((b2 >> 6) | (b3 << 2) | ((b4 & 0x0f) << 10)),
    };
  }

  return null;
}

function tiffDimensions(buffer: Buffer): ImageDimensions | null {
  if (buffer.length < 10) return null;
  const byteOrder = buffer.toString("ascii", 0, 2);
  const littleEndian = byteOrder === "II";
  if (!littleEndian && byteOrder !== "MM") return null;
  if (readUInt16(buffer, 2, littleEndian) !== 42) return null;

  const ifdOffset = readUInt32(buffer, 4, littleEndian);
  if (ifdOffset === null) return null;
  const entryCount = readUInt16(buffer, ifdOffset, littleEndian);
  if (entryCount === null) return null;

  let width: number | null = null;
  let height: number | null = null;

  for (let index = 0; index < entryCount; index += 1) {
    const entryOffset = ifdOffset + 2 + index * 12;
    const tag = readUInt16(buffer, entryOffset, littleEndian);
    const type = readUInt16(buffer, entryOffset + 2, littleEndian);
    const count = readUInt32(buffer, entryOffset + 4, littleEndian);
    if (tag === null || type === null || count !== 1 || (tag !== 256 && tag !== 257)) continue;

    const value =
      type === 3
        ? readUInt16(buffer, entryOffset + 8, littleEndian)
        : type === 4
          ? readUInt32(buffer, entryOffset + 8, littleEndian)
          : null;

    if (value === null) continue;
    if (tag === 256) width = value;
    if (tag === 257) height = value;
  }

  return width !== null && height !== null ? { width, height } : null;
}

export function imageDimensions(
  buffer: Buffer,
  format: string,
): ImageDimensions | null {
  switch (format) {
    case "png":
      return pngDimensions(buffer);
    case "jpeg":
      return jpegDimensions(buffer);
    case "bmp":
      return bmpDimensions(buffer);
    case "webp":
      return webpDimensions(buffer);
    case "tiff-le":
    case "tiff-be":
      return tiffDimensions(buffer);
    default:
      return null;
  }
}

export interface ImageInspection {
  format: string | null;
  width: number | null;
  height: number | null;
}

/**
 * Returns bounded metadata derived from the bytes themselves. This is useful to
 * retain image evidence without persisting or exposing the uploaded pixels.
 */
export function inspectImage(buffer: Buffer): ImageInspection {
  const format = detectImageFormat(buffer);
  const dimensions = format ? imageDimensions(buffer, format) : null;
  return {
    format,
    width: dimensions?.width ?? null,
    height: dimensions?.height ?? null,
  };
}

/** Throws a specific, user-facing error when the bytes are not a real image. */
export function assertDecodableImage(buffer: Buffer): void {
  if (buffer.length === 0) {
    throw new ApiError("VALIDATION_ERROR", "That file was empty.");
  }

  const format = detectImageFormat(buffer);
  if (format === null) {
    throw new ApiError(
      "UNSUPPORTED_MEDIA_TYPE",
      "That file isn't a readable image. Upload a PNG, JPEG, WebP, BMP or TIFF screenshot, or paste the text directly.",
    );
  }

  const dimensions = imageDimensions(buffer, format);
  if (
    dimensions &&
    (dimensions.width < 1 ||
      dimensions.height < 1 ||
      dimensions.width * dimensions.height > MAX_IMAGE_PIXELS)
  ) {
    throw new ApiError(
      "FILE_TOO_LARGE",
      "That image is too large to process safely. Upload a smaller screenshot or paste the text directly.",
    );
  }
}
