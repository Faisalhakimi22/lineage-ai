import { describe, expect, it } from "vitest";
import type { AcquiredSourceDocument } from "./source-acquisition";
import {
  enrichSourceDocument,
  extractReadableText,
  normalizeEvidenceDate,
  type EnrichableSearchSource,
} from "./source-enrichment";

const source: EnrichableSearchSource = {
  title: "Search title",
  url: "https://news.example/story?utm_source=search",
  description: "The provider snippet describes the claim.",
  publisher: null,
  published_date: null,
  provider_result_id: "provider-1",
  provider_score: 0.88,
  domain: "news.example",
  discovered_by_queries: ["example claim", '"example claim" context'],
};

function document(html: string): AcquiredSourceDocument {
  return {
    originalUrl: source.url,
    finalUrl: "https://news.example/story",
    redirectChain: [source.url, "https://news.example/story"],
    status: "acquired",
    httpStatus: 200,
    contentType: "text/html",
    html,
    byteLength: Buffer.byteLength(html),
    truncated: false,
    error: null,
  };
}

describe("source enrichment", () => {
  it("extracts readable text and prioritizes JSON-LD publication evidence", () => {
    const html = `<!doctype html>
      <html><head>
        <title>Fallback page title</title>
        <link rel="canonical" href="/canonical-story">
        <meta property="article:published_time" content="2023-03-26">
        <script type="application/ld+json">{
          "@context":"https://schema.org",
          "@type":"NewsArticle",
          "headline":"Structured headline",
          "datePublished":"2023-03-24T10:30:00Z",
          "dateModified":"2023-03-25T12:00:00Z",
          "author":{"@type":"Person","name":"A. Reporter"},
          "publisher":{"@type":"Organization","name":"Example News"}
        }</script>
      </head><body>
        <nav>navigation should disappear</nav>
        <article>
          <p>The event happened. The original cause was unknown.</p>
          <p>It was originally posted by the creator as an AI-generated image.</p>
          <p>Later coverage added context about how the caption changed.</p>
        </article>
      </body></html>`;

    const snapshot = enrichSourceDocument(
      source,
      document(html),
      "The event happened because a known cause",
    );

    expect(snapshot).toMatchObject({
      originalUrl: source.url,
      finalUrl: "https://news.example/story",
      canonicalUrl: "https://news.example/canonical-story",
      title: "Structured headline",
      domain: "news.example",
      publisher: "Example News",
      author: "A. Reporter",
      publishedAt: "2023-03-24T10:30:00.000Z",
      modifiedAt: "2023-03-25T12:00:00.000Z",
      dateType: "publication",
      dateConfidence: 0.96,
      dateSource: "json_ld",
      providerResultId: "provider-1",
      providerScore: 0.88,
      retrievalRelevance: null,
      acquisitionStatus: "acquired",
      sourceType: "news",
    });
    expect(snapshot.dateEvidence).toContain("JSON-LD datePublished");
    expect(snapshot.dateEvidencePassageId).toMatch(/^ev_/);
    expect(snapshot.relevantPassages[0]?.id).toBe(
      snapshot.dateEvidencePassageId,
    );
    expect(snapshot.text).not.toContain("navigation should disappear");
    expect(snapshot.relevantPassages.some((item) => item.kind === "date")).toBe(
      true,
    );
    expect(
      snapshot.relevantPassages.some((item) => item.kind === "provenance"),
    ).toBe(true);
  });

  it.each(["UTC", "America/Los_Angeles", "Asia/Karachi", "Pacific/Kiritimati"])(
    "keeps a date-only publication date stable in %s",
    (timezone) => {
      const previous = process.env.TZ;
      process.env.TZ = timezone;
      try {
        expect(normalizeEvidenceDate("2023-05-22")).toBe("2023-05-22");
      } finally {
        if (previous === undefined) delete process.env.TZ;
        else process.env.TZ = previous;
      }
    },
  );

  it("keeps provider indexing dates separate from publication evidence", () => {
    const snapshot = enrichSourceDocument(
      { ...source, published_date: "2023-05-22" },
      document(
        `<html><body><article>The relevant claim is discussed in this acquired article.</article></body></html>`,
      ),
      "relevant claim",
      0.73,
    );

    expect(snapshot.publishedAt).toBeNull();
    expect(snapshot.dateType).toBe("crawl_index");
    expect(snapshot.dateSource).toBe("provider");
    expect(snapshot.retrievalRelevance).toBe(0.73);
    expect(snapshot.claimRelevance).toBeGreaterThan(0);
    expect(snapshot.evidenceRelevance).toBeGreaterThan(0);
  });

  it("distinguishes upload metadata and does not accept a generic event time as publication", () => {
    const uploaded = enrichSourceDocument(
      source,
      document(`<html><head><script type="application/ld+json">{
        "@type":"VideoObject", "name":"Claim video", "uploadDate":"2023-05-22"
      }</script></head><body><article>The relevant claim appears in this video.</article></body></html>`),
      "relevant claim",
    );
    expect(uploaded.publishedAt).toBe("2023-05-22");
    expect(uploaded.dateType).toBe("upload");
    expect(uploaded.dateSource).toBe("json_ld");

    const eventOnly = enrichSourceDocument(
      source,
      document(`<html><body><article>
        <p>The relevant claim concerns an event.</p>
        <time datetime="2023-05-22">May 22, 2023</time>
      </article></body></html>`),
      "relevant claim",
    );
    expect(eventOnly.publishedAt).toBeNull();
    expect(eventOnly.dateType).toBe("unknown");
  });

  it("rejects cross-host canonical metadata and relative provider ages", () => {
    const html = `<html><head>
      <link rel="canonical" href="http://127.0.0.1/private">
    </head><body><article>The relevant claim is discussed here.</article></body></html>`;
    const snapshot = enrichSourceDocument(
      { ...source, published_date: "3 hours ago" },
      document(html),
      "relevant claim",
    );

    expect(snapshot.canonicalUrl).toBeNull();
    expect(snapshot.publishedAt).toBeNull();
    expect(snapshot.dateType).toBe("unknown");
    expect(snapshot.dateConfidence).toBe(0);
  });

  it("uses article content instead of surrounding page chrome", () => {
    const text = extractReadableText(`
      <html><body><nav>menu</nav><main><article>
        <h1>Evidence heading</h1><p>Evidence paragraph.</p>
      </article></main><footer>footer</footer></body></html>
    `);
    expect(text).toContain("Evidence heading");
    expect(text).toContain("Evidence paragraph");
    expect(text).not.toContain("menu");
    expect(text).not.toContain("footer");
  });

  it("does not turn a blocked page's search snippet into acquired evidence", () => {
    const blocked = {
      ...document(""),
      status: "blocked" as const,
      html: "",
      error: "CAPTCHA interstitial",
    };
    const snapshot = enrichSourceDocument(
      source,
      blocked,
      "provider snippet describes claim",
      0.99,
    );

    expect(snapshot.text).toBe("");
    expect(snapshot.relevantPassages).toEqual([]);
    expect(snapshot.claimRelevance).toBeNull();
    expect(snapshot.evidenceRelevance).toBeNull();
    expect(snapshot.extractionConfidence).toBe(0);
  });
});
