import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { AcquisitionStatus } from "./types";

const DEFAULT_TIMEOUT_MS = 8_000;
const MAX_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_RESPONSE_BYTES = 1_500_000;
const MAX_RESPONSE_BYTES = 5_000_000;
const DEFAULT_MAX_REDIRECTS = 4;
const MAX_REDIRECTS = 6;
const DEFAULT_CONCURRENCY = 3;
const MAX_CONCURRENCY = 5;

export interface DnsAddress {
  address: string;
  family: number;
}

export type DnsLookup = (hostname: string) => Promise<DnsAddress[]>;

export interface SourceAcquisitionOptions {
  fetchImpl?: typeof fetch;
  lookup?: DnsLookup;
  timeoutMs?: number;
  maxResponseBytes?: number;
  maxRedirects?: number;
  userAgent?: string;
}

export interface AcquiredSourceDocument {
  originalUrl: string;
  finalUrl: string | null;
  redirectChain: string[];
  status: AcquisitionStatus;
  httpStatus: number | null;
  contentType: string | null;
  html: string;
  byteLength: number;
  truncated: boolean;
  error: string | null;
}

export interface SourceUrlInput {
  url: string;
}

export interface AcquiredSource<T extends SourceUrlInput> {
  source: T;
  document: AcquiredSourceDocument;
}

function boundedInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  return Number.isInteger(value)
    ? Math.max(minimum, Math.min(maximum, value as number))
    : fallback;
}

function ipv4Number(address: string): number | null {
  const parts = address.split(".").map(Number);
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return null;
  }
  return (
    (((parts[0]! << 24) >>> 0) |
      (parts[1]! << 16) |
      (parts[2]! << 8) |
      parts[3]!) >>>
    0
  );
}

function inIpv4Range(value: number, base: string, prefix: number): boolean {
  const baseValue = ipv4Number(base);
  if (baseValue === null) return false;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (value & mask) === (baseValue & mask);
}

function isPublicIpv4(address: string): boolean {
  const value = ipv4Number(address);
  if (value === null) return false;
  const blocked: Array<[string, number]> = [
    ["0.0.0.0", 8],
    ["10.0.0.0", 8],
    ["100.64.0.0", 10],
    ["127.0.0.0", 8],
    ["169.254.0.0", 16],
    ["172.16.0.0", 12],
    ["192.0.0.0", 24],
    ["192.0.2.0", 24],
    ["192.88.99.0", 24],
    ["192.168.0.0", 16],
    ["198.18.0.0", 15],
    ["198.51.100.0", 24],
    ["203.0.113.0", 24],
    ["224.0.0.0", 4],
    ["240.0.0.0", 4],
  ];
  return !blocked.some(([base, prefix]) => inIpv4Range(value, base, prefix));
}

function expandIpv6(address: string): string[] | null {
  let normalized = address.toLowerCase().split("%")[0] ?? "";
  const ipv4Tail = normalized.match(/(?:^|:)(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (ipv4Tail) {
    const numeric = ipv4Number(ipv4Tail);
    if (numeric === null) return null;
    const high = ((numeric >>> 16) & 0xffff).toString(16);
    const low = (numeric & 0xffff).toString(16);
    normalized = normalized.slice(0, -ipv4Tail.length) + `${high}:${low}`;
  }

  const pieces = normalized.split("::");
  if (pieces.length > 2) return null;
  const left = pieces[0] ? pieces[0]!.split(":").filter(Boolean) : [];
  const right = pieces[1] ? pieces[1]!.split(":").filter(Boolean) : [];
  const missing = 8 - left.length - right.length;
  if (missing < 0 || (pieces.length === 1 && missing !== 0)) return null;
  const groups = [...left, ...Array(missing).fill("0"), ...right];
  if (
    groups.length !== 8 ||
    groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))
  ) {
    return null;
  }
  return groups.map((group) => group.padStart(4, "0"));
}

function isPublicIpv6(address: string): boolean {
  const groups = expandIpv6(address);
  if (!groups) return false;

  // IPv4-mapped addresses must satisfy the IPv4 rules too.
  if (
    groups.slice(0, 5).every((group) => group === "0000") &&
    groups[5] === "ffff"
  ) {
    const high = Number.parseInt(groups[6]!, 16);
    const low = Number.parseInt(groups[7]!, 16);
    return isPublicIpv4(
      `${high >>> 8}.${high & 255}.${low >>> 8}.${low & 255}`,
    );
  }

  const first = Number.parseInt(groups[0]!, 16);
  const second = Number.parseInt(groups[1]!, 16);
  // Only globally routable 2000::/3 addresses are accepted. Explicitly deny
  // the documentation prefix even though it lies within that range.
  const globalUnicast = first >= 0x2000 && first <= 0x3fff;
  const documentation = first === 0x2001 && second === 0x0db8;
  return globalUnicast && !documentation;
}

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isPublicIpv4(address);
  if (family === 6) return isPublicIpv6(address);
  return false;
}

async function defaultLookup(hostname: string): Promise<DnsAddress[]> {
  return dnsLookup(hostname, { all: true, verbatim: true });
}

export interface ValidatedAcquisitionUrl {
  ok: boolean;
  url: URL | null;
  reason: string | null;
}

/** Validates both URL syntax and every currently resolved address. */
export async function validateAcquisitionUrl(
  value: string,
  lookup: DnsLookup = defaultLookup,
): Promise<ValidatedAcquisitionUrl> {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, url: null, reason: "The source URL is invalid." };
  }

  if (!(["http:", "https:"] as string[]).includes(url.protocol)) {
    return {
      ok: false,
      url: null,
      reason: "Only HTTP and HTTPS source URLs can be acquired.",
    };
  }
  if (url.username || url.password) {
    return {
      ok: false,
      url: null,
      reason: "Source URLs containing credentials are blocked.",
    };
  }
  const hostname = url.hostname
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "")
    .toLowerCase();
  if (
    hostname === "localhost" ||
    /\.(?:localhost|local|internal|home|lan)$/i.test(hostname)
  ) {
    return {
      ok: false,
      url: null,
      reason: "Local and private hostnames are blocked.",
    };
  }
  if (
    url.port &&
    !(
      (url.protocol === "http:" && url.port === "80") ||
      (url.protocol === "https:" && url.port === "443")
    )
  ) {
    return {
      ok: false,
      url: null,
      reason: "Non-standard source ports are blocked.",
    };
  }

  const literalFamily = isIP(hostname);
  if (literalFamily > 0) {
    return isPublicAddress(hostname)
      ? { ok: true, url, reason: null }
      : {
          ok: false,
          url: null,
          reason: "Private or reserved network addresses are blocked.",
        };
  }

  try {
    const addresses = await lookup(hostname);
    if (
      addresses.length === 0 ||
      addresses.some((item) => !isPublicAddress(item.address))
    ) {
      return {
        ok: false,
        url: null,
        reason:
          "The source hostname resolves to a private or reserved address.",
      };
    }
  } catch {
    return {
      ok: false,
      url: null,
      reason: "The source hostname could not be resolved safely.",
    };
  }

  return { ok: true, url, reason: null };
}

function redirectStatus(status: number): boolean {
  return [301, 302, 303, 307, 308].includes(status);
}

function htmlContentType(value: string | null): boolean {
  if (!value) return false;
  const mediaType = value.split(";", 1)[0]?.trim().toLowerCase();
  return mediaType === "text/html" || mediaType === "application/xhtml+xml";
}

export interface HtmlIntegrityAssessment {
  accepted: boolean;
  status: "blocked" | "failed" | null;
  kind:
    | "content"
    | "captcha"
    | "cloudflare_challenge"
    | "bot_verification"
    | "access_denied"
    | "login_wall"
    | "consent_interstitial"
    | "error_page"
    | "empty_application_shell";
  reason: string | null;
}

function pageText(html: string): string {
  return html
    .replace(/<!--[^]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|canvas)\b[^>]*>[^]*?<\/\1\s*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(?:nbsp|#160);/gi, " ")
    .replace(/&(?:amp|#38);/gi, "&")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 20_000);
}

function articleTextLength(html: string): number {
  const article = html.match(/<article\b[^>]*>([^]*?)<\/article\s*>/i)?.[1];
  const main = html.match(/<main\b[^>]*>([^]*?)<\/main\s*>/i)?.[1];
  return pageText(article ?? main ?? "").length;
}

/**
 * Rejects HTML access barriers and non-evidence shells before enrichment.
 * Signals are deliberately structural/contextual so an article that merely
 * discusses a CAPTCHA or login wall is not itself rejected.
 */
export function assessHtmlIntegrity(html: string): HtmlIntegrityAssessment {
  const raw = html.slice(0, 750_000);
  const text = pageText(raw);
  const bodyText = pageText(
    raw.match(/<body\b[^>]*>([^]*?)<\/body\s*>/i)?.[1] ?? raw,
  );
  const title = pageText(
    raw.match(/<title\b[^>]*>([^]*?)<\/title\s*>/i)?.[1] ?? "",
  );
  const articleLength = articleTextLength(raw);

  if (
    (/(?:g-recaptcha|recaptcha\/api|google\.com\/recaptcha|hcaptcha(?:\.com)?\/|cf-turnstile)/i.test(
      raw,
    ) &&
      articleLength < 300 &&
      text.length < 3_000) ||
    (/\b(?:complete|solve) (?:the )?(?:captcha|security check)\b|\bverify (?:that )?you are human\b/i.test(
      text,
    ) &&
      articleLength < 300)
  ) {
    return {
      accepted: false,
      status: "blocked",
      kind: "captcha",
      reason:
        "The source returned a CAPTCHA or human-verification interstitial.",
    };
  }

  if (
    /(?:cf-chl-|__cf_chl|challenge-platform|cloudflare-static\/challenge)/i.test(
      raw,
    ) ||
    (/\b(?:just a moment|checking your browser|attention required)\b/i.test(
      title,
    ) &&
      /\bcloudflare\b/i.test(raw))
  ) {
    return {
      accepted: false,
      status: "blocked",
      kind: "cloudflare_challenge",
      reason:
        "The source returned a Cloudflare challenge instead of article content.",
    };
  }

  if (
    (/\b(?:verify(?:ing)? (?:your )?browser|automated requests?|bot verification|unusual traffic)\b/i.test(
      text,
    ) ||
      /(?:id|class)=["'][^"']*(?:bot-check|challenge-page|human-verification)[^"']*["']/i.test(
        raw,
      )) &&
    articleLength < 300
  ) {
    return {
      accepted: false,
      status: "blocked",
      kind: "bot_verification",
      reason:
        "The source returned bot verification instead of article content.",
    };
  }

  if (
    /^(?:access denied|request blocked|forbidden|permission denied)$/i.test(
      title,
    ) ||
    (/(?:id|class)=["'][^"']*(?:access-denied|request-blocked)[^"']*["']/i.test(
      raw,
    ) &&
      articleLength < 300) ||
    (/\b(?:access denied|you do not have permission to access|request (?:has been )?blocked)\b/i.test(
      text,
    ) &&
      text.length < 2_500 &&
      articleLength < 300)
  ) {
    return {
      accepted: false,
      status: "blocked",
      kind: "access_denied",
      reason: "The source returned an access-denied page instead of evidence.",
    };
  }

  const hasPasswordForm =
    /<input\b[^>]*type\s*=\s*["']?password\b/i.test(raw) ||
    /<(?:form|section|div)\b[^>]*(?:id|class)=["'][^"']*(?:login|sign-in|signin|paywall)[^"']*["']/i.test(
      raw,
    );
  if (
    articleLength < 300 &&
    text.length < 3_000 &&
    (/^(?:sign in|log in|login|subscribe)(?:\s|$)/i.test(title) ||
      (hasPasswordForm &&
        /\b(?:sign in|log in|login|subscribe|register)\b[\s\S]{0,80}\b(?:continue|read|access|view)\b/i.test(
          text,
        )))
  ) {
    return {
      accepted: false,
      status: "blocked",
      kind: "login_wall",
      reason:
        "The source returned a login or subscription wall instead of article content.",
    };
  }

  if (
    articleLength < 300 &&
    text.length < 3_000 &&
    (/^(?:privacy|cookie|consent|before you continue)/i.test(title) ||
      (/\b(?:before you continue|we value your privacy|manage (?:your )?consent)\b/i.test(
        text,
      ) &&
        /\b(?:accept|agree|consent|cookies?)\b/i.test(text)))
  ) {
    return {
      accepted: false,
      status: "blocked",
      kind: "consent_interstitial",
      reason:
        "The source returned a consent interstitial without article content.",
    };
  }

  if (
    (/^(?:404|403|500|error|page not found|not found|service unavailable|something went wrong)(?:\s|$)/i.test(
      title,
    ) ||
      /\b(?:page (?:could not be found|is unavailable)|internal server error|something went wrong)\b/i.test(
        text,
      )) &&
    text.length < 3_000 &&
    articleLength < 300
  ) {
    return {
      accepted: false,
      status: "failed",
      kind: "error_page",
      reason: "The source returned a generic error page instead of evidence.",
    };
  }

  if (
    bodyText.length < 80 &&
    articleLength === 0 &&
    (/<(?:div|main)\b[^>]*(?:id|class)=["'][^"']*(?:root|app|__next|application)[^"']*["'][^>]*>\s*<\/(?:div|main)>/i.test(
      raw,
    ) ||
      /<script\b/i.test(raw))
  ) {
    return {
      accepted: false,
      status: "failed",
      kind: "empty_application_shell",
      reason:
        "The source returned an empty application shell without readable evidence.",
    };
  }

  return {
    accepted: true,
    status: null,
    kind: "content",
    reason: null,
  };
}

async function readBoundedBody(
  response: Response,
  maximumBytes: number,
): Promise<{ bytes: Uint8Array; truncated: boolean }> {
  if (!response.body) return { bytes: new Uint8Array(), truncated: false };
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  let truncated = false;

  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      const remaining = maximumBytes - length;
      if (remaining <= 0) {
        truncated = true;
        break;
      }
      const chunk = item.value;
      if (chunk.byteLength > remaining) {
        chunks.push(chunk.subarray(0, remaining));
        length += remaining;
        truncated = true;
        break;
      }
      chunks.push(chunk);
      length += chunk.byteLength;
    }
  } finally {
    if (truncated) await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }

  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { bytes: output, truncated };
}

function failedDocument(
  originalUrl: string,
  status: AcquisitionStatus,
  error: string,
  finalUrl: string | null = null,
  redirectChain: string[] = [],
  httpStatus: number | null = null,
  contentType: string | null = null,
): AcquiredSourceDocument {
  return {
    originalUrl,
    finalUrl,
    redirectChain,
    status,
    httpStatus,
    contentType,
    html: "",
    byteLength: 0,
    truncated: false,
    error,
  };
}

/**
 * Acquires one HTML document under strict network and response-size bounds.
 * Redirects are manual so every destination is checked before it is fetched.
 */
export async function acquireSourceDocument(
  originalUrl: string,
  options: SourceAcquisitionOptions = {},
): Promise<AcquiredSourceDocument> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const lookup = options.lookup ?? defaultLookup;
  const timeoutMs = boundedInteger(
    options.timeoutMs,
    DEFAULT_TIMEOUT_MS,
    500,
    MAX_TIMEOUT_MS,
  );
  const maximumBytes = boundedInteger(
    options.maxResponseBytes,
    DEFAULT_MAX_RESPONSE_BYTES,
    1_024,
    MAX_RESPONSE_BYTES,
  );
  const maximumRedirects = boundedInteger(
    options.maxRedirects,
    DEFAULT_MAX_REDIRECTS,
    0,
    MAX_REDIRECTS,
  );
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const redirectChain: string[] = [];
  let currentUrl = originalUrl;

  try {
    for (let redirectCount = 0; ; redirectCount += 1) {
      const validated = await validateAcquisitionUrl(currentUrl, lookup);
      if (!validated.ok || !validated.url) {
        return failedDocument(
          originalUrl,
          "blocked",
          validated.reason ?? "The source URL was blocked.",
          redirectChain.at(-1) ?? null,
          redirectChain,
        );
      }
      const safeUrl = validated.url.toString();
      if (redirectChain.includes(safeUrl)) {
        return failedDocument(
          originalUrl,
          "failed",
          "The source returned a redirect loop.",
          safeUrl,
          redirectChain,
        );
      }
      redirectChain.push(safeUrl);

      const response = await fetchImpl(safeUrl, {
        method: "GET",
        redirect: "manual",
        headers: {
          Accept: "text/html,application/xhtml+xml;q=0.9",
          "User-Agent":
            options.userAgent ??
            "LINEAGE-Provenance/1.0 (+evidence acquisition; bounded)",
        },
        signal: controller.signal,
      });

      if (redirectStatus(response.status)) {
        const location = response.headers.get("location");
        if (!location) {
          await response.body?.cancel().catch(() => undefined);
          return failedDocument(
            originalUrl,
            "failed",
            "The source returned a redirect without a destination.",
            safeUrl,
            redirectChain,
            response.status,
          );
        }
        if (redirectCount >= maximumRedirects) {
          await response.body?.cancel().catch(() => undefined);
          return failedDocument(
            originalUrl,
            "failed",
            "The source exceeded the redirect limit.",
            safeUrl,
            redirectChain,
            response.status,
          );
        }
        try {
          currentUrl = new URL(location, safeUrl).toString();
        } catch {
          await response.body?.cancel().catch(() => undefined);
          return failedDocument(
            originalUrl,
            "failed",
            "The source returned an invalid redirect destination.",
            safeUrl,
            redirectChain,
            response.status,
          );
        }
        await response.body?.cancel().catch(() => undefined);
        continue;
      }

      const contentType = response.headers.get("content-type");
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        return failedDocument(
          originalUrl,
          [401, 403, 407, 429].includes(response.status) ? "blocked" : "failed",
          `The source returned HTTP ${response.status}.`,
          safeUrl,
          redirectChain,
          response.status,
          contentType,
        );
      }
      if (!htmlContentType(contentType)) {
        await response.body?.cancel().catch(() => undefined);
        return failedDocument(
          originalUrl,
          "unsupported",
          "The source response is not an HTML document.",
          safeUrl,
          redirectChain,
          response.status,
          contentType,
        );
      }

      const declaredLength = Number(response.headers.get("content-length"));
      const { bytes, truncated } = await readBoundedBody(
        response,
        maximumBytes,
      );
      const wasTruncated =
        truncated ||
        (Number.isFinite(declaredLength) && declaredLength > maximumBytes);
      const html = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
      const integrity = assessHtmlIntegrity(html);
      if (!integrity.accepted && integrity.status) {
        return {
          originalUrl,
          finalUrl: safeUrl,
          redirectChain,
          status: integrity.status,
          httpStatus: response.status,
          contentType,
          // Access barriers must never flow into passage/version extraction.
          html: "",
          byteLength: bytes.byteLength,
          truncated: wasTruncated,
          error: integrity.reason,
        };
      }

      return {
        originalUrl,
        finalUrl: safeUrl,
        redirectChain,
        status: wasTruncated ? "partial" : "acquired",
        httpStatus: response.status,
        contentType,
        html,
        byteLength: bytes.byteLength,
        truncated: wasTruncated,
        error: wasTruncated
          ? `The source exceeded ${maximumBytes} bytes and was truncated.`
          : null,
      };
    }
  } catch {
    const timedOut = controller.signal.aborted;
    return failedDocument(
      originalUrl,
      "failed",
      timedOut
        ? `The source acquisition exceeded ${timeoutMs} ms.`
        : "The source could not be acquired.",
      redirectChain.at(-1) ?? null,
      redirectChain,
    );
  } finally {
    clearTimeout(timeout);
  }
}

/** Maps a bounded number of fetch workers over an already-ranked source list. */
export async function acquireSourceDocuments<T extends SourceUrlInput>(
  sources: readonly T[],
  options: SourceAcquisitionOptions & { concurrency?: number } = {},
): Promise<Array<AcquiredSource<T>>> {
  if (sources.length === 0) return [];
  const concurrency = boundedInteger(
    options.concurrency,
    DEFAULT_CONCURRENCY,
    1,
    MAX_CONCURRENCY,
  );
  const results = new Array<AcquiredSource<T>>(sources.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      const source = sources[index];
      if (!source) return;
      results[index] = {
        source,
        document: await acquireSourceDocument(source.url, options),
      };
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, sources.length) }, () =>
      worker(),
    ),
  );
  return results;
}
