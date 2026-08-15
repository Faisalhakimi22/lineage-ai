import { describe, expect, it } from "vitest";
import { buildSubmittedOccurrence } from "./submitted-occurrence";
import type { ImageEvidence } from "./types";

describe("buildSubmittedOccurrence", () => {
  it("does not turn plain submitted wording into occurrence evidence", () => {
    expect(
      buildSubmittedOccurrence({
        claim: "5G caused COVID-19",
        rawText: "5G caused COVID-19",
      }),
    ).toBeNull();
  });

  it("retains a supplied URL as request-specific evidence without inferring a relationship", () => {
    const occurrence = buildSubmittedOccurrence({
      claim: "A claim",
      rawText: "A claim",
      occurrence: { sourceUrl: "https://example.test/post/123" },
    });

    expect(occurrence).toMatchObject({
      evidenceType: "supplied_url",
      sourceUrl: "https://example.test/post/123",
      sourceRelationship: null,
    });
    expect(occurrence?.evidence[0]?.exactText).toContain(
      "URL: https://example.test/post/123",
    );
  });

  it("requires source context before an exact quote qualifies as an occurrence", () => {
    expect(
      buildSubmittedOccurrence({
        claim: "A claim",
        rawText: "A claim",
        occurrence: { exactQuote: "A claim" },
      }),
    ).toBeNull();

    expect(
      buildSubmittedOccurrence({
        claim: "A claim",
        rawText: "A claim",
        occurrence: { exactQuote: "A claim", sourceName: "Example post" },
      })?.evidenceType,
    ).toBe("quoted_context");
  });

  it("retains an uploaded image as an occurrence but never claims reverse provenance", () => {
    const image: ImageEvidence = {
      id: "image:abc",
      sha256: "abc",
      perceptualHash: null,
      width: 100,
      height: 50,
      mediaType: "image/png",
      byteLength: 1000,
      originalFilename: "capture.png",
      extractedText: "A claim in a screenshot",
      evidenceIds: ["image:abc"],
      reverseImageSearchStatus: "not_implemented",
    };

    expect(
      buildSubmittedOccurrence({
        claim: "A claim in a screenshot",
        rawText: image.extractedText,
        imageEvidence: image,
      }),
    ).toMatchObject({
      evidenceType: "screenshot",
      sourceIdentifier: "image:abc",
      confidence: 1,
      sourceRelationship: null,
    });
  });
});
