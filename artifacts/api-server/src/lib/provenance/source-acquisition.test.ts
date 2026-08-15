import { describe, expect, it, vi } from "vitest";
import {
  acquireSourceDocument,
  assessHtmlIntegrity,
  isPublicAddress,
  validateAcquisitionUrl,
  type DnsLookup,
} from "./source-acquisition";

const publicLookup: DnsLookup = async () => [
  { address: "93.184.216.34", family: 4 },
];

describe("source acquisition safety", () => {
  it("rejects local, private, reserved, and credential-bearing destinations", async () => {
    expect(isPublicAddress("127.0.0.1")).toBe(false);
    expect(isPublicAddress("10.2.3.4")).toBe(false);
    expect(isPublicAddress("192.168.1.1")).toBe(false);
    expect(isPublicAddress("::1")).toBe(false);
    expect(isPublicAddress("2001:db8::1")).toBe(false);
    expect(isPublicAddress("93.184.216.34")).toBe(true);
    expect(isPublicAddress("2606:4700:4700::1111")).toBe(true);

    await expect(
      validateAcquisitionUrl("http://localhost/internal", publicLookup),
    ).resolves.toMatchObject({ ok: false });
    await expect(
      validateAcquisitionUrl("https://user:secret@example.org/", publicLookup),
    ).resolves.toMatchObject({ ok: false });
    await expect(
      validateAcquisitionUrl("https://example.org:8443/", publicLookup),
    ).resolves.toMatchObject({ ok: false });
  });

  it("checks every manual redirect before fetching it", async () => {
    const lookup = vi.fn<DnsLookup>(async (hostname) =>
      hostname === "private.example"
        ? [{ address: "127.0.0.1", family: 4 }]
        : [{ address: "93.184.216.34", family: 4 }],
    );
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: "http://private.example/admin" },
      }),
    );

    const result = await acquireSourceDocument("https://public.example/start", {
      lookup,
      fetchImpl,
    });

    expect(result.status).toBe("blocked");
    expect(result.redirectChain).toEqual(["https://public.example/start"]);
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it("follows safe redirects and enforces the maximum response size", async () => {
    const largeHtml = `<html><body>${"evidence ".repeat(400)}</body></html>`;
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 301,
          headers: { location: "/article" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(largeHtml, {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
      );

    const result = await acquireSourceDocument("https://example.org/start", {
      lookup: publicLookup,
      fetchImpl,
      maxResponseBytes: 1_024,
    });

    expect(result.status).toBe("partial");
    expect(result.finalUrl).toBe("https://example.org/article");
    expect(result.redirectChain).toEqual([
      "https://example.org/start",
      "https://example.org/article",
    ]);
    expect(result.byteLength).toBe(1_024);
    expect(result.truncated).toBe(true);
  });

  it("records non-HTML responses as unsupported without parsing them", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("%PDF", {
        status: 200,
        headers: { "content-type": "application/pdf" },
      }),
    );
    const result = await acquireSourceDocument(
      "https://example.org/report.pdf",
      {
        lookup: publicLookup,
        fetchImpl,
      },
    );

    expect(result).toMatchObject({
      status: "unsupported",
      contentType: "application/pdf",
      html: "",
      byteLength: 0,
    });
  });

  it.each([
    {
      name: "reCAPTCHA",
      expected: "blocked",
      html: `<html><head><title>Verification</title><script src="https://www.google.com/recaptcha/api.js"></script></head><body><div class="g-recaptcha"></div></body></html>`,
    },
    {
      name: "Cloudflare challenge",
      expected: "blocked",
      html: `<html><head><title>Just a moment...</title></head><body><div id="cf-chl-widget">Checking your browser</div><script>window.__cf_chl_opt={}</script></body></html>`,
    },
    {
      name: "bot verification",
      expected: "blocked",
      html: `<html><head><title>Security check</title></head><body><div class="bot-check">Verify your browser to continue. Automated requests are blocked.</div></body></html>`,
    },
    {
      name: "access denied",
      expected: "blocked",
      html: `<html><head><title>Access Denied</title></head><body><div id="access-denied">You do not have permission to access this resource.</div></body></html>`,
    },
    {
      name: "login wall",
      expected: "blocked",
      html: `<html><head><title>Sign in to continue</title></head><body><form class="login"><input type="password"><button>Sign in to continue reading</button></form></body></html>`,
    },
    {
      name: "consent-only interstitial",
      expected: "blocked",
      html: `<html><head><title>Before you continue</title></head><body><div>We value your privacy. Accept cookies or manage your consent.</div></body></html>`,
    },
    {
      name: "generic error",
      expected: "failed",
      html: `<html><head><title>Something went wrong</title></head><body>Something went wrong. Please try again later.</body></html>`,
    },
    {
      name: "empty application shell",
      expected: "failed",
      html: `<html><head><title>News</title></head><body><div id="root"></div><script src="/app.js"></script></body></html>`,
    },
  ])(
    "rejects a $name before evidence extraction",
    async ({ html, expected }) => {
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
        new Response(html, {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
      );

      const result = await acquireSourceDocument("https://example.org/story", {
        lookup: publicLookup,
        fetchImpl,
      });

      expect(result.status).toBe(expected);
      expect(result.html).toBe("");
      expect(result.error).toBeTruthy();
    },
  );

  it("does not reject a real article merely because it discusses access barriers", () => {
    const html = `<html><head><title>How websites block bots</title></head><body><article>
      <h1>How websites block bots</h1>
      <p>${"This reporting examines access denied messages and browser verification without presenting an access barrier. ".repeat(12)}</p>
    </article></body></html>`;

    expect(assessHtmlIntegrity(html)).toMatchObject({
      accepted: true,
      kind: "content",
    });
  });

  it("classifies HTTP access controls as blocked rather than acquired", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("Access denied", {
        status: 403,
        headers: { "content-type": "text/html" },
      }),
    );
    const result = await acquireSourceDocument("https://example.org/story", {
      lookup: publicLookup,
      fetchImpl,
    });
    expect(result.status).toBe("blocked");
    expect(result.html).toBe("");
  });
});
