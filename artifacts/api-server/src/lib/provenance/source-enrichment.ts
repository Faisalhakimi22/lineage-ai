import { createHash } from "node:crypto";
import {
  acquireSourceDocuments,
  type AcquiredSourceDocument,
  type SourceAcquisitionOptions,
} from "./source-acquisition";
import {
  normalizedUrlKey,
  selectSourcesForAcquisition,
  textRelevance,
} from "./source-ranking";
import type {
  EvidenceDateSource,
  EvidenceDateType,
  EvidencePassage,
  EvidenceSnapshot,
  EvidenceSourceType,
} from "./types";

const MAX_INTERNAL_TEXT = 100_000;
const MAX_PASSAGES = 6;
const MAX_PASSAGE_LENGTH = 1_200;

export interface EnrichableSearchSource {
  title: string;
  url: string;
  description: string;
  publisher: string | null;
  published_date: string | null;
  provider_result_id: string | null;
  provider_score: number | null;
  domain: string;
  discovered_by_queries: string[];
}

export interface AcquireTopSourcesOptions extends SourceAcquisitionOptions {
  limit?: number;
  concurrency?: number;
}

function environmentInteger(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value >= minimum && value <= maximum
    ? value
    : fallback;
}

interface MetadataEntry {
  key: string;
  value: string;
}

interface DateCandidate {
  value: string;
  raw: string;
  type: EvidenceDateType;
  confidence: number;
  evidence: string;
  source: EvidenceDateSource;
}

interface PageMetadata {
  title: string | null;
  canonicalUrl: string | null;
  publisher: string | null;
  author: string | null;
  published: DateCandidate | null;
  modified: DateCandidate | null;
  fallbackDate: DateCandidate | null;
  articleLike: boolean;
}

function stableId(prefix: string, value: string): string {
  return `${prefix}_${createHash("sha256").update(value).digest("hex").slice(0, 16)}`;
}

function cleanText(value: unknown, maximum = MAX_INTERNAL_TEXT): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return cleaned ? cleaned.slice(0, maximum) : null;
}

function decodeEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    hellip: "…",
    ldquo: "“",
    lsquo: "‘",
    lt: "<",
    mdash: "—",
    nbsp: " ",
    ndash: "–",
    quot: '"',
    rdquo: "”",
    rsquo: "’",
  };
  return value.replace(
    /&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]+);/gi,
    (match, entity: string) => {
      if (entity.startsWith("#x")) {
        const code = Number.parseInt(entity.slice(2), 16);
        return Number.isFinite(code) ? String.fromCodePoint(code) : match;
      }
      if (entity.startsWith("#")) {
        const code = Number.parseInt(entity.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : match;
      }
      return named[entity.toLowerCase()] ?? match;
    },
  );
}

function parseAttributes(tag: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const pattern =
    /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  for (const match of tag.matchAll(pattern)) {
    const key = match[1]?.toLowerCase();
    if (!key || key === "meta" || key === "link" || key === "time") continue;
    attributes[key] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attributes;
}

function metadataEntries(html: string): MetadataEntry[] {
  const entries: MetadataEntry[] = [];
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attributes = parseAttributes(match[0]);
    const key =
      attributes["property"] ??
      attributes["name"] ??
      attributes["itemprop"] ??
      attributes["http-equiv"];
    const value = attributes["content"];
    if (key && value) entries.push({ key: key.toLowerCase(), value });
  }
  return entries;
}

function firstMetadata(
  entries: readonly MetadataEntry[],
  keys: readonly string[],
): string | null {
  const wanted = new Set(keys.map((key) => key.toLowerCase()));
  return entries.find((entry) => wanted.has(entry.key))?.value ?? null;
}

function stripMarkup(html: string): string {
  const withoutNoise = html
    .replace(/<!--[^]*?-->/g, " ")
    .replace(
      /<(script|style|noscript|svg|canvas|form|nav|footer|aside)\b[^>]*>[^]*?<\/\1\s*>/gi,
      " ",
    )
    .replace(/<(?:br|\/p|\/div|\/li|\/h[1-6]|\/section|\/article)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return cleanText(decodeEntities(withoutNoise)) ?? "";
}

export function extractReadableText(html: string): string {
  const article = html.match(/<article\b[^>]*>([^]*?)<\/article\s*>/i)?.[1];
  const main = html.match(/<main\b[^>]*>([^]*?)<\/main\s*>/i)?.[1];
  const body = html.match(/<body\b[^>]*>([^]*?)<\/body\s*>/i)?.[1];
  return stripMarkup(article ?? main ?? body ?? html).slice(
    0,
    MAX_INTERNAL_TEXT,
  );
}

function jsonLdValues(html: string): unknown[] {
  const values: unknown[] = [];
  for (const match of html.matchAll(
    /<script\b([^>]*)>([^]*?)<\/script\s*>/gi,
  )) {
    const attributes = parseAttributes(match[1] ?? "");
    if (attributes["type"]?.toLowerCase() !== "application/ld+json") continue;
    const raw = (match[2] ?? "")
      .trim()
      .replace(/^<!--|-->$/g, "")
      .trim();
    if (!raw || raw.length > 500_000) continue;
    try {
      values.push(JSON.parse(raw) as unknown);
    } catch {
      // Invalid publisher JSON-LD is ignored; no metadata is fabricated.
    }
  }
  return values;
}

function flattenJsonObjects(
  values: readonly unknown[],
): Record<string, unknown>[] {
  const output: Record<string, unknown>[] = [];
  const queue = [...values];
  let visited = 0;
  while (queue.length > 0 && visited < 250) {
    visited += 1;
    const value = queue.shift();
    if (Array.isArray(value)) {
      queue.push(...value);
    } else if (value && typeof value === "object") {
      const object = value as Record<string, unknown>;
      output.push(object);
      if (Array.isArray(object["@graph"])) queue.push(...object["@graph"]);
    }
  }
  return output;
}

function scalar(value: unknown): string | null {
  if (typeof value === "string") return cleanText(value, 1_000);
  if (Array.isArray(value)) {
    for (const item of value) {
      const result = scalar(item);
      if (result) return result;
    }
  }
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return scalar(object["name"] ?? object["headline"] ?? object["value"]);
  }
  return null;
}

function validCalendarDate(year: number, month: number, day: number): boolean {
  if (year < 1900 || year > new Date().getUTCFullYear() + 1) return false;
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const value = new Date(Date.UTC(year, month - 1, day));
  return (
    value.getUTCFullYear() === year &&
    value.getUTCMonth() === month - 1 &&
    value.getUTCDate() === day
  );
}

function calendarDate(year: number, month: number, day: number): string | null {
  return validCalendarDate(year, month, day)
    ? `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    : null;
}

/**
 * Normalizes publisher dates without ever round-tripping a date-only value
 * through the server's local timezone.
 */
export function normalizeEvidenceDate(raw: string): string | null {
  const value = cleanText(raw, 120);
  if (!value) return null;
  // Relative/provider indexing ages are deliberately rejected.
  if (/\b(?:ago|today|yesterday|hours?|minutes?)\b/i.test(value)) return null;
  if (!/\b(?:19|20)\d{2}\b/.test(value)) return null;

  const isoDate = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoDate) {
    return calendarDate(
      Number(isoDate[1]),
      Number(isoDate[2]),
      Number(isoDate[3]),
    );
  }

  const months = new Map(
    [
      "january",
      "february",
      "march",
      "april",
      "may",
      "june",
      "july",
      "august",
      "september",
      "october",
      "november",
      "december",
    ].map((month, index) => [month, index + 1]),
  );
  const monthFirst = value.match(
    /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})$/i,
  );
  if (monthFirst) {
    return calendarDate(
      Number(monthFirst[3]),
      months.get(monthFirst[1]!.toLowerCase()) ?? 0,
      Number(monthFirst[2]),
    );
  }
  const dayFirst = value.match(
    /^(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})$/i,
  );
  if (dayFirst) {
    return calendarDate(
      Number(dayFirst[3]),
      months.get(dayFirst[2]!.toLowerCase()) ?? 0,
      Number(dayFirst[1]),
    );
  }

  const isoDateTime = value.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](.+)$/);
  if (
    isoDateTime &&
    !validCalendarDate(
      Number(isoDateTime[1]),
      Number(isoDateTime[2]),
      Number(isoDateTime[3]),
    )
  ) {
    return null;
  }
  const hasClock = /(?:T|\s)\d{1,2}:\d{2}/.test(value);
  if (!hasClock) return null;
  // ISO timestamps without an explicit offset are interpreted as UTC so
  // identical evidence produces identical normalized output in every TZ.
  const deterministic =
    isoDateTime && !/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)
      ? `${value}Z`
      : value;
  const parsed = new Date(deterministic);
  if (!Number.isFinite(parsed.getTime())) return null;
  const year = parsed.getUTCFullYear();
  if (year < 1900 || year > new Date().getUTCFullYear() + 1) return null;
  return parsed.toISOString();
}

function dateCandidate(
  raw: string | null,
  type: EvidenceDateType,
  confidence: number,
  location: string,
  source: EvidenceDateSource,
): DateCandidate | null {
  if (!raw) return null;
  const value = normalizeEvidenceDate(raw);
  return value
    ? {
        value,
        raw,
        type,
        confidence,
        evidence: `${location}: ${raw.slice(0, 120)}`,
        source,
      }
    : null;
}

function safeResolvedUrl(value: string | null, baseUrl: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value, baseUrl);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function extractCanonical(html: string, baseUrl: string): string | null {
  let baseHostname: string;
  try {
    baseHostname = new URL(baseUrl).hostname.toLowerCase();
  } catch {
    return null;
  }
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const attributes = parseAttributes(match[0]);
    const rel = attributes["rel"]?.toLowerCase().split(/\s+/) ?? [];
    if (rel.includes("canonical")) {
      const resolved = safeResolvedUrl(attributes["href"] ?? null, baseUrl);
      // Canonical metadata is publisher-controlled and is not a redirect that
      // passed the acquisition SSRF checks. Limit it to the acquired host.
      if (
        resolved &&
        new URL(resolved).hostname.toLowerCase() === baseHostname
      ) {
        return resolved;
      }
    }
  }
  return null;
}

function findTimeDate(
  html: string,
  requested: "publication" | "modified",
): DateCandidate | null {
  for (const match of html.matchAll(/<time\b([^>]*)>([^]*?)<\/time\s*>/gi)) {
    const attributes = parseAttributes(match[1] ?? "");
    const itemProp = attributes["itemprop"]?.toLowerCase() ?? "";
    const className = attributes["class"]?.toLowerCase() ?? "";
    const start = match.index ?? 0;
    const nearby = stripMarkup(
      html.slice(
        Math.max(0, start - 180),
        Math.min(html.length, start + match[0].length + 180),
      ),
    );
    const publicationContext =
      itemProp === "datepublished" ||
      itemProp === "uploaddate" ||
      /(?:^|[-_\s])(?:published|publication|publish-date|posted|post-date|entry-date)(?:$|[-_\s])/.test(
        className,
      ) ||
      /\b(?:published|publication date|posted|uploaded)\b/i.test(nearby);
    const modifiedContext =
      itemProp === "datemodified" ||
      /(?:^|[-_\s])(?:modified|updated|last-modified)(?:$|[-_\s])/.test(
        className,
      ) ||
      /\b(?:modified|last updated|updated)\b/i.test(nearby);

    if (
      (requested === "publication" && !publicationContext) ||
      (requested === "modified" && !modifiedContext)
    ) {
      continue;
    }
    const type: EvidenceDateType =
      requested === "modified"
        ? "modified"
        : itemProp === "uploaddate" || /\buploaded\b/i.test(nearby)
          ? "upload"
          : "publication";
    const candidate = dateCandidate(
      attributes["datetime"] ?? stripMarkup(match[2] ?? ""),
      type,
      0.74,
      `contextual HTML <time> (${requested})`,
      "article_metadata",
    );
    if (candidate) return candidate;
  }
  return null;
}

function findVisibleDate(text: string): DateCandidate | null {
  const patterns = [
    /\b(?:published|posted|publication date)\s*(?:on|:)?\s*((?:19|20)\d{2}-\d{1,2}-\d{1,2})\b/i,
    /\b(?:published|posted|publication date)\s*(?:on|:)?\s*((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+(?:19|20)\d{2})\b/i,
    /\b(?:published|posted|publication date)\s*(?:on|:)?\s*(\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+(?:19|20)\d{2})\b/i,
  ];
  for (const pattern of patterns) {
    const raw = text.match(pattern)?.[1] ?? null;
    const candidate = dateCandidate(
      raw,
      "publication",
      0.52,
      "visible publication label",
      "visible_text",
    );
    if (candidate) return candidate;
  }
  return null;
}

function extractPageMetadata(
  html: string,
  baseUrl: string,
  providerPublishedDate: string | null,
): PageMetadata {
  const entries = metadataEntries(html);
  const objects = flattenJsonObjects(jsonLdValues(html));
  const articleTypes = new Set([
    "article",
    "newsarticle",
    "report",
    "analysisnewsarticle",
    "blogposting",
    "scholarlyarticle",
  ]);
  const articleObject =
    objects.find((object) => {
      const type = scalar(object["@type"]);
      return type ? articleTypes.has(type.toLowerCase()) : false;
    }) ??
    objects.find(
      (object) =>
        object["datePublished"] !== undefined ||
        object["uploadDate"] !== undefined ||
        object["dateModified"] !== undefined,
    );

  const jsonPublishedRaw = scalar(articleObject?.["datePublished"]);
  const jsonUploadRaw = scalar(articleObject?.["uploadDate"]);
  const jsonModifiedRaw = scalar(articleObject?.["dateModified"]);
  const published =
    dateCandidate(
      jsonPublishedRaw,
      "publication",
      0.96,
      "JSON-LD datePublished",
      "json_ld",
    ) ??
    dateCandidate(
      jsonUploadRaw,
      "upload",
      0.9,
      "JSON-LD uploadDate",
      "json_ld",
    ) ??
    dateCandidate(
      firstMetadata(entries, ["article:published_time", "og:published_time"]),
      "publication",
      0.91,
      "OpenGraph article:published_time",
      "opengraph",
    ) ??
    dateCandidate(
      firstMetadata(entries, [
        "datepublished",
        "date",
        "pubdate",
        "publishdate",
        "dc.date",
        "dc.date.issued",
        "citation_publication_date",
      ]),
      "publication",
      0.84,
      "HTML publication metadata",
      "html_metadata",
    ) ??
    findTimeDate(html, "publication") ??
    findVisibleDate(extractReadableText(html).slice(0, 8_000));
  const modified =
    dateCandidate(
      jsonModifiedRaw,
      "modified",
      0.94,
      "JSON-LD dateModified",
      "json_ld",
    ) ??
    dateCandidate(
      firstMetadata(entries, [
        "article:modified_time",
        "og:updated_time",
        "datemodified",
        "last-modified",
      ]),
      "modified",
      0.88,
      "HTML modification metadata",
      "html_metadata",
    ) ??
    findTimeDate(html, "modified");
  const fallbackDate = dateCandidate(
    providerPublishedDate,
    "crawl_index",
    0.25,
    "search-provider date (not publication evidence)",
    "provider",
  );

  const htmlTitle = decodeEntities(
    html.match(/<title\b[^>]*>([^]*?)<\/title\s*>/i)?.[1] ?? "",
  );
  return {
    title:
      scalar(articleObject?.["headline"] ?? articleObject?.["name"]) ??
      firstMetadata(entries, ["og:title", "twitter:title"]) ??
      cleanText(htmlTitle, 300),
    canonicalUrl: extractCanonical(html, baseUrl),
    publisher:
      scalar(articleObject?.["publisher"]) ??
      firstMetadata(entries, ["og:site_name", "application-name"]),
    author:
      scalar(articleObject?.["author"] ?? articleObject?.["creator"]) ??
      firstMetadata(entries, [
        "author",
        "article:author",
        "byl",
        "dc.creator",
        "citation_author",
      ]),
    published,
    modified,
    fallbackDate,
    articleLike: Boolean(articleObject) || /<article\b/i.test(html),
  };
}

function inferSourceType(
  domain: string,
  title: string,
  articleLike: boolean,
): EvidenceSourceType {
  const value = `${domain} ${title}`.toLowerCase();
  if (
    /\.(?:gov|gov\.[a-z]{2}|int)$/.test(domain) ||
    /\b(?:who|unicef|cdc)\b/.test(value)
  ) {
    return "official";
  }
  if (
    /(?:doi\.org|pubmed|ncbi\.nlm\.nih\.gov|arxiv\.org|journals?\.|\.edu$|\.ac\.)/.test(
      domain,
    )
  ) {
    return "academic";
  }
  if (
    /\b(?:factcheck|fact-check|snopes|politifact|fullfact|afp-fact-check)\b/.test(
      value,
    )
  ) {
    return "fact_check";
  }
  if (
    /^(?:www\.)?(?:x|twitter|facebook|instagram|reddit|tiktok)\.com$/.test(
      domain,
    )
  ) {
    return "social";
  }
  if (/(?:^|\.)wikipedia\.org$/.test(domain)) {
    return "reference";
  }
  return articleLike ? "news" : "other";
}

function passageCandidates(text: string): string[] {
  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 40);
  const candidates: string[] = [];
  for (const line of lines) {
    if (line.length <= MAX_PASSAGE_LENGTH) {
      candidates.push(line);
      continue;
    }
    for (const part of line.split(/(?<=[.!?])\s+/)) {
      const cleaned = part.trim();
      if (cleaned.length >= 40)
        candidates.push(cleaned.slice(0, MAX_PASSAGE_LENGTH));
    }
  }
  return candidates;
}

function passageKind(passage: string): EvidencePassage["kind"] {
  if (
    /\b(?:originally|originated|first\s+(?:posted|published|uploaded)|created\s+by|uploaded\s+by|source\s+of)\b/i.test(
      passage,
    )
  ) {
    return "provenance";
  }
  if (
    /\b(?:context|however|although|according\s+to|ai[- ]generated|generated\s+(?:by|with|using)|captioned|in\s+fact)\b/i.test(
      passage,
    )
  ) {
    return "context";
  }
  return "claim";
}

function relevantPassages(
  sourceId: string,
  claim: string,
  text: string,
  fallback: string,
): EvidencePassage[] {
  const candidates = passageCandidates(text);
  if (candidates.length === 0 && fallback.trim())
    candidates.push(fallback.trim());
  return candidates
    .map((passage, index) => ({
      passage: passage.slice(0, MAX_PASSAGE_LENGTH),
      relevance: textRelevance(claim, passage),
      kind: passageKind(passage),
      index,
    }))
    .filter(
      (item) => item.relevance > 0 || item.index === 0 || item.kind !== "claim",
    )
    .sort((a, b) => b.relevance - a.relevance || a.index - b.index)
    .slice(0, MAX_PASSAGES)
    .map((item) => ({
      id: stableId("ev", `${sourceId}\u0000${item.passage}`),
      sourceId,
      text: item.passage,
      kind: item.kind,
      relevance: item.relevance,
    }));
}

function withDatePassage(
  sourceId: string,
  passages: EvidencePassage[],
  date: DateCandidate | null,
): EvidencePassage[] {
  if (!date) return passages;
  const text = date.evidence.slice(0, MAX_PASSAGE_LENGTH);
  const datePassage: EvidencePassage = {
    id: stableId("ev", `${sourceId}\u0000date\u0000${text}`),
    sourceId,
    text,
    kind: "date",
    relevance: date.confidence,
  };
  return [datePassage, ...passages].slice(0, MAX_PASSAGES);
}

function domainFor(value: string, fallback: string): string {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return fallback.toLowerCase();
  }
}

export function enrichSourceDocument(
  source: EnrichableSearchSource,
  document: AcquiredSourceDocument,
  claim: string,
  retrievalRelevance: number | null = null,
): EvidenceSnapshot {
  const baseUrl = document.finalUrl ?? source.url;
  const metadata = document.html
    ? extractPageMetadata(document.html, baseUrl, source.published_date)
    : {
        title: null,
        canonicalUrl: null,
        publisher: null,
        author: null,
        published: null,
        modified: null,
        fallbackDate: dateCandidate(
          source.published_date,
          "crawl_index",
          0.25,
          "search-provider date (not publication evidence)",
          "provider",
        ),
        articleLike: false,
      };
  const contentUsable =
    document.status === "acquired" || document.status === "partial";
  const text =
    contentUsable && document.html ? extractReadableText(document.html) : "";
  const identityUrl = metadata.canonicalUrl ?? document.finalUrl ?? source.url;
  const id = stableId("src", normalizedUrlKey(identityUrl));
  const domain = domainFor(identityUrl, source.domain);
  const title = cleanText(metadata.title, 300) ?? source.title;
  const publisher = cleanText(metadata.publisher, 200) ?? source.publisher;
  const author = cleanText(metadata.author, 200);
  const sourceType = inferSourceType(domain, title, metadata.articleLike);
  const effectiveDate =
    metadata.published ?? metadata.modified ?? metadata.fallbackDate;
  const passages = contentUsable
    ? withDatePassage(
        id,
        // Provider snippets remain discovery diagnostics. They are never
        // promoted into an acquired page's evidence passages.
        relevantPassages(id, claim, text, ""),
        effectiveDate,
      )
    : [];
  const acquiredTextConfidence =
    document.status === "acquired"
      ? text.length >= 1_000
        ? 0.82
        : text.length >= 200
          ? 0.68
          : 0.45
      : document.status === "partial"
        ? text.length >= 500
          ? 0.62
          : 0.42
        : 0;
  const extractionConfidence = Math.min(
    1,
    acquiredTextConfidence +
      (metadata.published ? 0.06 : 0) +
      (metadata.canonicalUrl ? 0.04 : 0) +
      (author ? 0.03 : 0),
  );
  const claimRelevance = contentUsable
    ? textRelevance(claim, `${title}\n${text.slice(0, 20_000)}`)
    : null;
  const evidenceRelevance = contentUsable
    ? passages.reduce(
        (maximum, passage) =>
          passage.kind === "date"
            ? maximum
            : Math.max(maximum, passage.relevance),
        0,
      )
    : null;

  return {
    id,
    providerResultId: source.provider_result_id,
    originalUrl: source.url,
    finalUrl: document.finalUrl,
    canonicalUrl: metadata.canonicalUrl,
    title,
    domain,
    publisher,
    author,
    publishedAt: metadata.published?.value ?? null,
    modifiedAt: metadata.modified?.value ?? null,
    dateType: effectiveDate?.type ?? "unknown",
    dateConfidence: effectiveDate?.confidence ?? 0,
    dateEvidence: effectiveDate?.evidence ?? null,
    dateSource: effectiveDate?.source ?? "unknown",
    dateEvidencePassageId:
      passages.find((passage) => passage.kind === "date")?.id ?? null,
    text,
    relevantPassages: passages,
    sourceType,
    providerScore: source.provider_score,
    retrievalRelevance,
    claimRelevance,
    evidenceRelevance,
    acquisitionStatus: document.status,
    acquisitionError: document.error,
    extractionConfidence,
    discoveredByQueries: [...new Set(source.discovered_by_queries)],
  };
}

function acquisitionQuality(snapshot: EvidenceSnapshot): number {
  const status =
    snapshot.acquisitionStatus === "acquired"
      ? 3
      : snapshot.acquisitionStatus === "partial"
        ? 2
        : 1;
  return (
    status + snapshot.extractionConfidence + (snapshot.providerScore ?? 0) / 10
  );
}

/** Deduplicates redirect/canonical aliases while retaining the best snapshot. */
export function deduplicateEvidenceSnapshots(
  snapshots: readonly EvidenceSnapshot[],
): EvidenceSnapshot[] {
  const values = new Map<
    string,
    { snapshot: EvidenceSnapshot; index: number }
  >();
  snapshots.forEach((snapshot, index) => {
    const key = normalizedUrlKey(
      snapshot.canonicalUrl ?? snapshot.finalUrl ?? snapshot.originalUrl,
    );
    const previous = values.get(key);
    if (
      !previous ||
      acquisitionQuality(snapshot) > acquisitionQuality(previous.snapshot)
    ) {
      if (previous) {
        snapshot.discoveredByQueries = [
          ...new Set([
            ...previous.snapshot.discoveredByQueries,
            ...snapshot.discoveredByQueries,
          ]),
        ];
      }
      values.set(key, { snapshot, index });
      return;
    }
    previous.snapshot.discoveredByQueries = [
      ...new Set([
        ...previous.snapshot.discoveredByQueries,
        ...snapshot.discoveredByQueries,
      ]),
    ];
  });
  return [...values.values()]
    .sort((a, b) => a.index - b.index)
    .map((item) => item.snapshot);
}

/**
 * End-to-end bounded acquisition helper used by the provenance orchestrator.
 * Blocked/failed/unsupported sources remain in the returned evidence set so
 * downstream stages can distinguish failed acquisition from missing code.
 */
export async function acquireTopSourceDocuments<
  T extends EnrichableSearchSource,
>(
  claim: string,
  sources: readonly T[],
  options: AcquireTopSourcesOptions = {},
): Promise<EvidenceSnapshot[]> {
  const limit =
    options.limit ?? environmentInteger("PROVENANCE_MAX_SOURCES", 6, 1, 10);
  const concurrency =
    options.concurrency ??
    environmentInteger("PROVENANCE_ACQUISITION_CONCURRENCY", 3, 1, 5);
  const timeoutMs =
    options.timeoutMs ??
    environmentInteger("PROVENANCE_SOURCE_TIMEOUT_MS", 8_000, 500, 20_000);
  const maxResponseBytes =
    options.maxResponseBytes ??
    environmentInteger(
      "PROVENANCE_SOURCE_MAX_BYTES",
      1_500_000,
      1_024,
      5_000_000,
    );
  const ranked = selectSourcesForAcquisition(claim, sources, limit);
  const acquired = await acquireSourceDocuments(
    ranked.map((item) => item.source),
    { ...options, concurrency, timeoutMs, maxResponseBytes },
  );
  return deduplicateEvidenceSnapshots(
    acquired.map(({ source, document }) => {
      const retrieval =
        ranked.find((item) => item.source === source)?.relevance ?? null;
      return enrichSourceDocument(source, document, claim, retrieval);
    }),
  );
}
