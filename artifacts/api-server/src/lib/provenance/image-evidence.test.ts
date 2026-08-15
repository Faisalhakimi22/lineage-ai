import { describe, expect, it } from "vitest";
import { buildImageEvidence } from "./image-evidence";

describe("image evidence", () => {
  it("retains stable upload metadata without claiming reverse-image provenance", () => {
    const png = Buffer.alloc(24);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png);
    png.write("IHDR", 12, "ascii");
    png.writeUInt32BE(640, 16);
    png.writeUInt32BE(480, 20);

    const evidence = buildImageEvidence({
      buffer: png,
      extractedText: "A screenshot caption",
      mediaType: "image/png",
      originalFilename: "claim.png",
    });

    expect(evidence.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(evidence.width).toBe(640);
    expect(evidence.height).toBe(480);
    expect(evidence.byteLength).toBe(24);
    expect(evidence.extractedText).toBe("A screenshot caption");
    expect(evidence.perceptualHash).toBeNull();
    expect(evidence.reverseImageSearchStatus).toBe("not_implemented");
  });
});
