// artifacts/api-server/src/services/ai-discovery.service.ts
// AI-powered job discovery engine.
// When traditional scrapers fail or for specialized roles, this service:
//   1. Uses AI to generate optimized, targeted search queries
//   2. Searches the web via DuckDuckGo (no CAPTCHA, no API key needed)
//   3. Uses AI to extract structured job data from page content
//   4. Validates all URLs before emitting results

import { logger } from "../lib/logger.js";
import { type ScrapedJob } from "./scrapers/types.js";
import { isJobRelevant } from "./scrapers/relevance.js";
import { AIService } from "./ai.service.js";
import { getBrowser, newStealthContext, humanDelay, incrementActiveTasks, decrementActiveTasks } from "./scrapers/browser.js";
import { type Page } from "patchright";
import { db } from "@workspace/db";
import { discoveryLogsTable } from "@workspace/db/schema/discovery-logs";

// Coordination signal: when one engine triggers CAPTCHA-forced headful mode,
// others await this promise before their next context creation so they don't
// race against a mid-switch browser singleton.
let headfulModeActive = false;
let headfulSwitchResolve: (() => void) | null = null;
let headfulSwitchPromise: Promise<void> = Promise.resolve();

function activateHeadfulMode() {
  if (headfulModeActive) return;
  headfulModeActive = true;
  headfulSwitchPromise = new Promise<void>((resolve) => {
    headfulSwitchResolve = resolve;
  });
}

function resolveHeadfulSwitch() {
  headfulModeActive = false;
  if (headfulSwitchResolve) {
    headfulSwitchResolve();
    headfulSwitchResolve = null;
  }
  headfulSwitchPromise = Promise.resolve();
}

/** Classify errors that are caused by a concurrent context restart, not a real failure. */
function isContextClosedError(err: any): boolean {
  const msg: string = err?.message ?? "";
  return (
    msg.includes("closed") ||
    msg.includes("Target page") ||
    msg.includes("context or browser has been closed")
  );
}

export interface AIDiscoveryOptions {
  role: string;
  region: string;
  dateFilter?: string;
  maxResults?: number;
  aiBackend?: "Ollama" | "Claude" | "OpenAI";
  sessionId?: string;
}

export interface AIDiscoveryProgress {
  type: "job" | "log" | "done" | "error";
  job?: ScrapedJob;
  level?: "info" | "success" | "error";
  message?: string;
  total?: number;
}

type ProgressEmitter = (p: AIDiscoveryProgress) => void;

const SOURCE = "AI Discovery";
const BASE_COLOR = "#818cf8";

// ─── Query Generation ─────────────────────────────────────────────────────────

/**
 * Generate smart, targeted job search queries using role expansion.
 * Produces queries that search engines will resolve to actual job listing pages.
 */
function generateSearchQueries(
  role: string,
  region: string,
  expansion: { variations: string[] },
  dateFilter?: string
): string[] {
  const queries: string[] = [];
  const regionAliases = buildRegionAliases(region);
  const currentYear = new Date().getFullYear();

  // Primary + top 2 AI-expanded variants
  const variants = [role, ...expansion.variations.slice(0, 2)];

  // ── Gulf / MENA job boards (highest value for UAE searches) ──
  const gulfBoards = ["bayt.com", "naukrigulf.com", "gulftalent.com"];
  for (const board of gulfBoards) {
    queries.push(`"${role}" "${region}" site:${board}`);
  }

  // ── LinkedIn (most structured results) ──
  for (const alias of regionAliases.slice(0, 2)) {
    queries.push(`"${role}" "${alias}" site:linkedin.com/jobs`);
  }

  // ── Global boards ──
  queries.push(`"${role}" "${region}" site:indeed.com`);
  queries.push(`"${role}" "${region}" site:glassdoor.com`);

  // ── ATS portals ──
  for (const ats of ["greenhouse.io", "lever.co", "workable.com", "smartrecruiters.com"]) {
    queries.push(`"${role}" "${region}" site:${ats}`);
  }

  // ── AI-expanded variant queries (focused on job boards, no filler words) ──
  for (const rv of variants.slice(1)) {
    queries.push(`"${rv}" "${region}" site:linkedin.com/jobs`);
    queries.push(`"${rv}" "${region}" site:indeed.com OR site:glassdoor.com`);
  }

  return [...new Set(queries)].slice(0, 16);
}

/**
 * Build location aliases for a region to broaden search coverage.
 * e.g. "Dubai" → ["Dubai", "UAE", "United Arab Emirates"]
 */
function buildRegionAliases(region: string): string[] {
  const r = region.toLowerCase();
  const aliases: string[] = [region];

  if (r.includes("dubai") || r.includes("uae") || r.includes("abu dhabi") || r.includes("sharjah")) {
    aliases.push("UAE", "United Arab Emirates", "Dubai");
  } else if (r.includes("bangalore") || r.includes("bengaluru")) {
    aliases.push("Bengaluru", "Bangalore", "India");
  } else if (r.includes("mumbai")) {
    aliases.push("Mumbai", "India");
  } else if (r.includes("singapore")) {
    aliases.push("Singapore", "SG");
  } else if (r.includes("london")) {
    aliases.push("London", "UK", "United Kingdom");
  }

  return [...new Set(aliases)];
}

// ─── DuckDuckGo Search ────────────────────────────────────────────────────────

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

// ─── Search Orchestration ──────────────────────────────────────────────────

// Simple circuit breaker to skip engines that keep hitting CAPTCHAs
const engineHealth = {
  Google: { fails: 0, lastFail: 0 },
  Bing: { fails: 0, lastFail: 0 },
  DuckDuckGo: { fails: 0, lastFail: 0 },
};

// Track CAPTCHA solves per engine — after solving once, limit further queries
// to avoid repeated CAPTCHA prompts that annoy the user.
const captchaTracker: Record<string, { solvedAt: number; queriesSince: number }> = {
  Google: { solvedAt: 0, queriesSince: 0 },
  Bing: { solvedAt: 0, queriesSince: 0 },
};
const MAX_QUERIES_AFTER_CAPTCHA = 3; // Allow 3 queries after solving, then skip

/**
 * Persistent Bing session — reuse the same browser context & page across all
 * queries so Bing cookies/session survive between searches (no per-query CAPTCHA).
 */
let bingSessionCtx: Awaited<ReturnType<typeof newStealthContext>> | null = null;
let bingSessionPage: import("patchright").Page | null = null;
const BING_COOLDOWN_MS = 4000;     // Delay between Bing queries to avoid re-triggering

async function getBingPage(headless: boolean): Promise<import("patchright").Page> {
  // Reuse existing page if healthy
  if (bingSessionPage && !bingSessionPage.isClosed()) return bingSessionPage;

  // Clean up stale session
  if (bingSessionPage && bingSessionPage.isClosed()) {
    await bingSessionCtx?.close().catch(() => {});
    bingSessionCtx = null;
    bingSessionPage = null;
  }

  const browser = await getBrowser(headless);
  bingSessionCtx = await newStealthContext(browser);
  bingSessionPage = await bingSessionCtx.newPage();
  return bingSessionPage;
}

async function closeBingSession() {
  if (bingSessionPage && !bingSessionPage.isClosed()) await bingSessionPage.close().catch(() => {});
  if (bingSessionCtx) await bingSessionCtx.close().catch(() => {});
  bingSessionCtx = null;
  bingSessionPage = null;
}

/**
 * Execute a single search attempt for one engine.
 * Bing reuses a persistent session to avoid per-query CAPTCHA storms.
 */
async function attemptEngineSearch(
  engine: { name: string; url: (q: string) => string },
  query: string,
  log: (level: "info" | "success" | "error", msg: string) => void
): Promise<{ results: SearchResult[]; captchaDetected: boolean }> {
  // Wait if another engine is mid headful-switch so we don't race
  await headfulSwitchPromise;

  // ── Bing: use persistent session ──────────────────────────────────────────
  if (engine.name === "Bing") {
    const bingTracker = captchaTracker["Bing"]!;
    
    // Skip Bing if we've exhausted our post-CAPTCHA quota
    if (bingTracker.solvedAt > 0 && bingTracker.queriesSince >= MAX_QUERIES_AFTER_CAPTCHA) {
      if (Date.now() - bingTracker.solvedAt < 600_000) {
        return { results: [], captchaDetected: false };
      } else {
        bingTracker.solvedAt = 0;
        bingTracker.queriesSince = 0;
      }
    }

    // Add cooldown between Bing queries to avoid triggering CAPTCHA
    if (bingTracker.solvedAt > 0 && bingTracker.queriesSince > 0) {
      await new Promise(r => setTimeout(r, BING_COOLDOWN_MS));
    }

    const page = await getBingPage(!headfulModeActive);
    await page.goto(engine.url(query), { waitUntil: "domcontentloaded", timeout: 25000 });
    
    // Wait a bit for page to fully settle (reduces CAPTCHA triggers)
    await new Promise(r => setTimeout(r, 1500 + Math.random() * 1000));
    
    const isCaptcha = await detectCaptcha(page);
    if (isCaptcha) {
      // If we already solved CAPTCHA recently and it's back, just skip
      if (bingTracker.solvedAt > 0 && Date.now() - bingTracker.solvedAt < 600_000) {
        log("info", `Bing CAPTCHA re-triggered — skipping (already solved recently)`);
        bingTracker.queriesSince = MAX_QUERIES_AFTER_CAPTCHA; // Exhaust quota
        return { results: [], captchaDetected: false }; // Don't trigger HITL again
      }
      return { results: [], captchaDetected: true };
    }
    
    bingTracker.queriesSince++;
    const scraped = await scrapeBing(page);
    return { results: scraped, captchaDetected: false };
  }

  // ── DuckDuckGo: use direct fetch (no browser needed for HTML endpoint) ────
  if (engine.name === "DuckDuckGo") {
    try {
      // DDG blocks most fetch requests with anomaly detection.
      // Try fetch first — if blocked, report as failed (no Playwright fallback
      // since DDG also CAPTCHAs Playwright consistently).
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 8000);
      const ddgRes = await fetch(engine.url(query), {
        signal: ctrl.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });
      clearTimeout(timeout);
      if (!ddgRes.ok) return { results: [], captchaDetected: false };
      const html = await ddgRes.text();
      
      // Check for anomaly/CAPTCHA/block (DDG returns 202 with anomaly modal)
      if (html.includes("anomaly") || html.includes("captcha") || html.includes("blocked") || !html.includes("uddg=")) {
        // DDG is blocking us — trip the circuit breaker so we don't waste time
        return { results: [], captchaDetected: false };
      }

      const results = parseDDGHtml(html);
      return { results, captchaDetected: false };
    } catch {
      return { results: [], captchaDetected: false };
    }
  }

  // ── Other engines: ephemeral context per query ────────────────────────────
  incrementActiveTasks();
  let ctx: Awaited<ReturnType<typeof newStealthContext>> | null = null;
  let page: import("patchright").Page | null = null;

  try {
    const browser = await getBrowser(!headfulModeActive);
    ctx = await newStealthContext(browser);
    page = await ctx.newPage();

    await page.goto(engine.url(query), { waitUntil: "domcontentloaded", timeout: 25000 });

    // DDG HTML endpoint can be slow to render results — wait for content
    if (engine.name === "DuckDuckGo") {
      await page.waitForSelector(".result, .web-result, .result__body, article, .results--main", { timeout: 8000 }).catch(() => {});
    }

    const isCaptcha = await detectCaptcha(page);
    if (isCaptcha) {
      return { results: [], captchaDetected: true };
    }

    const scraped = engine.name === "Google" ? await scrapeGoogle(page) : await scrapeDDG(page);
    return { results: scraped, captchaDetected: false };
  } finally {
    if (page && !page.isClosed()) await page.close().catch(() => {});
    if (ctx) await ctx.close().catch(() => {});
    decrementActiveTasks();
  }
}

/**
 * Perform a web search using multiple engines sequentially.
 * Running sequentially (not Promise.all) eliminates browser-singleton race
 * conditions when one engine triggers a headful-mode switch.
 */
async function searchWeb(
  query: string,
  log: (level: "info" | "success" | "error", msg: string) => void
): Promise<SearchResult[]> {
  const engines = [
    { name: "Google",    url: (q: string) => `https://www.google.com/search?q=${encodeURIComponent(q)}` },
    { name: "Bing",      url: (q: string) => `https://www.bing.com/search?q=${encodeURIComponent(q)}` },
    { name: "DuckDuckGo",url: (q: string) => `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}` },
  ];

  const results: SearchResult[] = [];

  for (const engine of engines) {
    // ── Circuit breaker ────────────────────────────────────────────────
    const health = (engineHealth as Record<string, { fails: number; lastFail: number }>)[engine.name];
    if (health && health.fails >= 2 && Date.now() - health.lastFail < 300_000) {
      log("info", `AI Discovery: skipping ${engine.name} (circuit breaker active)`);
      continue;
    }

    // ── CAPTCHA quota check — skip if we've used up post-solve queries ──
    const tracker = (captchaTracker as Record<string, { solvedAt: number; queriesSince: number }>)[engine.name];
    if (tracker && tracker.solvedAt > 0 && tracker.queriesSince >= MAX_QUERIES_AFTER_CAPTCHA) {
      // Only skip if the solve was recent (within 10 minutes)
      if (Date.now() - tracker.solvedAt < 600_000) {
        continue; // Silently skip — don't spam logs
      } else {
        // Reset tracker after 10 minutes (session may have cooled down)
        tracker.solvedAt = 0;
        tracker.queriesSince = 0;
      }
    }

    let succeeded = false;

    for (let attempt = 1; attempt <= 2; attempt++) {
      log("info", `AI Discovery: launching ${engine.name} search (attempt ${attempt})...`);

      try {
        const { results: engineResults, captchaDetected } = await attemptEngineSearch(engine, query, log);

        if (captchaDetected) {
          log("error", `⚠️ ${engine.name} CAPTCHA detected! Switching to visible browser for HITL...`);

          // ── Headful CAPTCHA resolution ──────────────────────────────
          activateHeadfulMode();

          // For Bing: switch the persistent session page to headful and reuse it.
          // This way the solved cookies remain for all future queries.
          if (engine.name === "Bing") {
            try {
              await closeBingSession(); // close headless session
              const headfulPage = await getBingPage(false); // open headful session
              await headfulPage.goto(engine.url(query), { waitUntil: "domcontentloaded" });
              await headfulPage.bringToFront();

              log("info", `Please solve the CAPTCHA in the visible window for Bing. Waiting 20 s...`);
              await humanDelay(15_000, 20_000);

              if (await detectCaptcha(headfulPage)) {
                log("error", `Bing CAPTCHA still present after timeout.`);
                health.fails++;
                health.lastFail = Date.now();
                resolveHeadfulSwitch();
                break;
              }

              // CAPTCHA solved — record timestamp and reset counter
              captchaTracker["Bing"]!.solvedAt = Date.now();
              captchaTracker["Bing"]!.queriesSince = 0;

              const hitlResults = await scrapeBing(headfulPage);
              health.fails = 0;
              captchaTracker["Bing"]!.queriesSince = 1;
              log("success", `Bing (HITL) returned ${hitlResults.length} results`);
              results.push(...hitlResults);
              succeeded = true;
            } finally {
              resolveHeadfulSwitch();
            }
            break;
          }

          // Other engines: ephemeral headful context
          incrementActiveTasks();
          let headfulCtx: Awaited<ReturnType<typeof newStealthContext>> | null = null;
          let headfulPage: import("patchright").Page | null = null;

          try {
            const headfulBrowser = await getBrowser(false);
            headfulCtx = await newStealthContext(headfulBrowser);
            headfulPage = await headfulCtx.newPage();

            await headfulPage.goto(engine.url(query), { waitUntil: "domcontentloaded" });
            await headfulPage.bringToFront();

            log("info", `Please solve the CAPTCHA in the visible window for ${engine.name}. Waiting 20 s...`);
            await humanDelay(15_000, 20_000);

            if (await detectCaptcha(headfulPage)) {
              log("error", `${engine.name} CAPTCHA still present after timeout.`);
              health.fails++;
              health.lastFail = Date.now();
              break;
            }

            const hitlResults = engine.name === "Google" ? await scrapeGoogle(headfulPage)
                               : await scrapeDDG(headfulPage);

            health.fails = 0;
            // Record CAPTCHA solve for this engine
            if (tracker) {
              tracker.solvedAt = Date.now();
              tracker.queriesSince = 1;
            }
            log("success", `${engine.name} (HITL) returned ${hitlResults.length} results`);
            results.push(...hitlResults);
            succeeded = true;
          } finally {
            if (headfulPage && !headfulPage.isClosed()) await headfulPage.close().catch(() => {});
            if (headfulCtx) await headfulCtx.close().catch(() => {});
            decrementActiveTasks();
            resolveHeadfulSwitch();
          }
          break;
        }

        // ── Happy path ──────────────────────────────────────────────────
        health.fails = 0;
        // Track successful query (for CAPTCHA quota management)
        if (tracker) tracker.queriesSince++;
        log("success", `${engine.name} returned ${engineResults.length} results`);
        results.push(...engineResults);
        succeeded = true;
        break;

      } catch (err: any) {
        // Context-closed errors are a race artifact, NOT a real engine failure.
        // Do NOT trip the circuit breaker for them.
        if (isContextClosedError(err)) {
          if (attempt === 1) {
            log("info", `${engine.name} context closed (mid-switch), retrying after delay...`);
            await humanDelay(2_000, 4_000);
            continue; // true retry — no finally double-cleanup because attemptEngineSearch already cleaned up
          }
          // attempt 2 also closed — just move on silently
          log("info", `${engine.name} context still closed on attempt 2, skipping.`);
          break;
        }

        // Real failure (network, timeout, parse error) — trip circuit breaker
        log("error", `${engine.name} failed: ${err.message}`);
        health.fails++;
        health.lastFail = Date.now();
        break;
      }
    }

    if (!succeeded) {
      log("info", `${engine.name} produced no results for this query.`);
    }
  }

  // Deduplicate by URL
  return Array.from(new Map(results.map((r) => [r.url, r])).values());
}

async function detectCaptcha(page: Page): Promise<boolean> {
  const content = await page.content();
  return (
    content.includes("unusual traffic from your computer") || // Google
    content.includes("verify you're a human") || // Bing
    content.includes("g-recaptcha") ||
    content.includes("captcha")
  );
}

async function scrapeGoogle(page: Page): Promise<SearchResult[]> {
  return page.evaluate(() => {
    const results: any[] = [];
    // Google uses multiple container classes depending on layout/experiment
    const containers = [
      ...Array.from(document.querySelectorAll("div.g")),
      ...Array.from(document.querySelectorAll("div.tF2Cxc")),
      ...Array.from(document.querySelectorAll("div[data-hveid] h3")),
    ];
    const seen = new Set<string>();
    for (const el of containers) {
      // If this is an h3 (from data-hveid fallback), walk up
      const root = el.tagName === "H3" ? el.closest("[data-hveid]") || el.parentElement! : el;
      const titleEl = root.querySelector("h3") || (el.tagName === "H3" ? el : null);
      // Find the nearest <a> that has an http href (not Google internal)
      const links = Array.from(root.querySelectorAll("a")) as HTMLAnchorElement[];
      const linkEl = links.find((a) => a.href && a.href.startsWith("http") && !a.href.includes("google.com"));
      const snippetEl =
        root.querySelector("div[style*='-webkit-line-clamp']") ||
        root.querySelector(".VwiC3b") ||
        root.querySelector("[data-sncf]");
      if (titleEl && linkEl && !seen.has(linkEl.href)) {
        seen.add(linkEl.href);
        results.push({
          title: titleEl.textContent?.trim() || "",
          url: linkEl.href,
          snippet: snippetEl?.textContent?.trim() || "",
        });
      }
    }
    return results;
  });
}

async function scrapeBing(page: Page): Promise<SearchResult[]> {
  return page.evaluate(() => {
    const results: any[] = [];
    document.querySelectorAll("li.b_algo").forEach((el) => {
      const titleEl = el.querySelector("h2 a");
      const snippetEl = el.querySelector(".b_caption p");
      if (titleEl) {
        const anchor = titleEl as HTMLAnchorElement;
        // Bing wraps hrefs in tracking redirects (bing.com/ck/a?...).
        // The actual destination URL is in the <cite> element or can be
        // extracted from the 'u' parameter in the redirect URL.
        let url = anchor.href;

        // Strategy 1: Extract from <cite> element
        const citeEl = el.querySelector("cite") || el.querySelector(".b_attribution cite");
        if (citeEl) {
          let citeUrl = citeEl.textContent?.trim() || "";
          // Bing shows breadcrumb-style URLs with "›" separators like:
          // "https://www.bayt.com › en › uae › jobs › ai-jobs"
          // Convert these back to proper URLs by replacing " › " with "/"
          if (citeUrl.includes("›")) {
            citeUrl = citeUrl.replace(/\s*›\s*/g, "/");
          }
          // Skip truncated URLs with "…" or "..."
          if (citeUrl && !citeUrl.includes("…") && !citeUrl.includes("...")) {
            if (!citeUrl.startsWith("http")) citeUrl = "https://" + citeUrl;
            // Validate it looks like a real URL (has a dot in the domain)
            try {
              const parsed = new URL(citeUrl);
              if (parsed.hostname.includes(".")) {
                url = citeUrl;
              }
            } catch { /* not a valid URL, skip */ }
          }
        }

        // Strategy 2: If still a bing redirect, try to decode the 'u' param
        if (url.includes("bing.com/ck/a")) {
          try {
            const urlObj = new URL(url);
            const uParam = urlObj.searchParams.get("u");
            if (uParam) {
              // Bing base64-encodes the destination with a prefix "a1" 
              const decoded = atob(uParam.replace(/^a1/, ""));
              if (decoded.startsWith("http")) url = decoded;
            }
          } catch { /* keep original */ }
        }

        // Strategy 3: If still a bing redirect, try the data-u attribute on the link
        if (url.includes("bing.com/ck/a")) {
          const dataU = anchor.getAttribute("data-u") || "";
          if (dataU) {
            try {
              // data-u format varies: sometimes it's a pipe-separated value
              const parts = dataU.split("|");
              for (const part of parts) {
                if (part.startsWith("http") && !part.includes("bing.com")) {
                  url = part;
                  break;
                }
              }
            } catch { /* keep original */ }
          }
        }

        results.push({
          title: titleEl.textContent?.trim(),
          url,
          snippet: snippetEl?.textContent?.trim() || "",
        });
      }
    });
    return results;
  });
}

async function scrapeDDG(page: Page): Promise<SearchResult[]> {
  return page.evaluate(() => {
    const results: any[] = [];

    // DDG HTML endpoint uses multiple possible selectors depending on version
    // Try the modern selectors first, then fall back to legacy
    const selectors = [
      // Modern DDG HTML layout (2024+)
      { container: ".web-result", title: ".result__a, a.result-link", snippet: ".result__snippet, .snippet" },
      // Legacy DDG HTML layout
      { container: ".result__body", title: ".result__a", snippet: ".result__snippet" },
      // Alternative DDG layout
      { container: ".results_links_deep", title: ".result__a", snippet: ".result__snippet" },
      // Newer DDG layout with article elements
      { container: "article", title: "h2 a", snippet: "[data-result='snippet'], .OgdwYG6P5Uil9n0TMQ_b" },
    ];

    for (const sel of selectors) {
      const containers = document.querySelectorAll(sel.container);
      if (containers.length === 0) continue;

      containers.forEach((el) => {
        const titleEl = el.querySelector(sel.title);
        const snippetEl = el.querySelector(sel.snippet);
        if (titleEl) {
          let url = (titleEl as HTMLAnchorElement).href || "";
          // DDG sometimes wraps URLs in a redirect: //duckduckgo.com/l/?uddg=ENCODED_URL
          if (url.includes("duckduckgo.com/l/")) {
            try {
              const urlObj = new URL(url);
              const uddg = urlObj.searchParams.get("uddg");
              if (uddg) url = decodeURIComponent(uddg);
            } catch { /* keep original */ }
          }
          if (url && url.startsWith("http")) {
            results.push({
              title: titleEl.textContent?.trim(),
              url,
              snippet: snippetEl?.textContent?.trim() || "",
            });
          }
        }
      });

      if (results.length > 0) break; // Found results with this selector set
    }

    return results;
  });
}

/**
 * Parse DuckDuckGo HTML response without Playwright (direct fetch).
 * DDG's HTML endpoint returns static HTML with result links.
 */
function parseDDGHtml(html: string): SearchResult[] {
  const results: SearchResult[] = [];

  // DDG HTML endpoint wraps results in various patterns depending on version.
  // Try multiple extraction approaches.

  // Pattern 1: result__a links (classic DDG HTML)
  const linkRe1 = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = linkRe1.exec(html))) {
    let url = m[1];
    const title = m[2].replace(/<[^>]*>/g, "").trim();
    // Decode DDG redirect
    if (url.includes("//duckduckgo.com/l/") || url.includes("uddg=")) {
      const uddgMatch = url.match(/[?&]uddg=([^&]+)/);
      if (uddgMatch) url = decodeURIComponent(uddgMatch[1]);
    }
    if (url.startsWith("http") && title) {
      results.push({ title, url, snippet: "" });
    }
  }

  // Pattern 2: result-link class (newer DDG)
  if (results.length === 0) {
    const linkRe2 = /<a[^>]*class="[^"]*result-link[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    while ((m = linkRe2.exec(html))) {
      let url = m[1];
      const title = m[2].replace(/<[^>]*>/g, "").trim();
      if (url.includes("uddg=")) {
        const uddgMatch = url.match(/[?&]uddg=([^&]+)/);
        if (uddgMatch) url = decodeURIComponent(uddgMatch[1]);
      }
      if (url.startsWith("http") && title) {
        results.push({ title, url, snippet: "" });
      }
    }
  }

  // Pattern 3: Any link with uddg parameter (most generic)
  if (results.length === 0) {
    const linkRe3 = /href="([^"]*uddg=[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    while ((m = linkRe3.exec(html))) {
      let url = m[1];
      const title = m[2].replace(/<[^>]*>/g, "").trim();
      const uddgMatch = url.match(/[?&]uddg=([^&]+)/);
      if (uddgMatch) url = decodeURIComponent(uddgMatch[1]);
      if (url.startsWith("http") && title && title.length > 3) {
        results.push({ title, url, snippet: "" });
      }
    }
  }

  // Extract snippets for results that have them
  const snippetRe = /<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
  let idx = 0;
  while ((m = snippetRe.exec(html)) && idx < results.length) {
    results[idx].snippet = m[1].replace(/<[^>]*>/g, "").trim();
    idx++;
  }

  return results;
}

// ─── ATS Job Extractors ───────────────────────────────────────────────────────

/**
 * Determines if a URL is likely a job listing (not noise/informational content).
 * Rejects known non-job domains AND URLs that don't look like job pages.
 */
function isNotNoiseListing(url: string): boolean {
  if (isRejectedDomain(url)) return false;
  
  // If it's a known job board, always accept
  if (isKnownJobBoardUrl(url)) return true;
  
  // For unknown domains, check if the URL path suggests a job listing
  const lower = url.toLowerCase();
  const jobSignals = ["/jobs", "/job/", "/careers", "/career/", "/hiring", "/vacancy", 
                      "/position", "/opening", "/apply", "/recruitment"];
  const hasJobPath = jobSignals.some(s => lower.includes(s));
  
  // Accept if URL path suggests jobs, otherwise reject unknown domains
  return hasJobPath;
}

/**
 * Extract company name from ATS URL patterns.
 */
function extractCompanyFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    // greenhouse.io: boards.greenhouse.io/companyname/jobs/xxx
    if (url.includes("greenhouse.io")) {
      const parts = u.pathname.split("/");
      return parts[1] ? toTitleCase(parts[1].replace(/-/g, " ")) : null;
    }
    // lever.co: jobs.lever.co/companyname/xxx
    if (url.includes("lever.co")) {
      const parts = u.pathname.split("/");
      return parts[1] ? toTitleCase(parts[1].replace(/-/g, " ")) : null;
    }
    return u.hostname.replace(/^(www\.|jobs\.|careers\.)/, "").split(".")[0];
  } catch {
    return null;
  }
}

function toTitleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── Job Board Allowlist ──────────────────────────────────────────────────────
// Only emit jobs from these domains. This prevents search-engine result pages
// (bing.com, google.com) from being classified as job listings.
const JOB_BOARD_DOMAINS = [
  // Global
  "linkedin.com", "indeed.com", "glassdoor.com", "monster.com", "ziprecruiter.com",
  "simplyhired.com", "careerbuilder.com", "dice.com", "wellfound.com", "angel.co",
  // ATS portals
  "greenhouse.io", "lever.co", "workable.com", "smartrecruiters.com",
  "jobs.ashbyhq.com", "boards.greenhouse.io", "apply.workable.com",
  "careers.icims.com", "talentacquisition.", "taleo.net",
  // Gulf / MENA
  "bayt.com", "naukrigulf.com", "gulftalent.com", "monstergulf.com",
  "dubizzle.com/jobs", "jobsindubai.com", "khaleejtimes.com/jobs",
  "gitex.com/careers", "careers.emiratesnbd.com", "careers.du.ae",
  // Company careers pages
  "careers.", "/careers/", "/jobs/", "jobs.", "recruitment.",
  // Tech job boards
  "remoteok.com", "weworkremotely.com", "hackernews.com/jobs",
  "stackoverflow.com/jobs", "github.com/jobs",
];

function isKnownJobBoardUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return JOB_BOARD_DOMAINS.some((d) => lower.includes(d));
}

/** Domains that are definitely NOT job listings — search engines, social media, etc. */
const REJECT_DOMAINS = [
  "bing.com", "google.com", "duckduckgo.com", "yahoo.com",
  "youtube.com", "wikipedia.org", "facebook.com", "twitter.com", "x.com",
  "instagram.com", "tiktok.com", "reddit.com", "quora.com",
  "medium.com", "substack.com", "techcrunch.com", "theverge.com",
  "wired.com", "forbes.com", "businessinsider.com",
  "merriam-webster.com", "cambridge.org", "dictionary.com",
  "amazon.com", "ebay.com", "walmart.com",
  // Educational / informational sites (not job boards)
  "geeksforgeeks.org", "ibm.com/think", "ibm.com/topics",
  "mitsloan.mit.edu", "cloud.google.com/discover", "techtarget.com",
  "aimultiple.com", "agentic.ai", "openai.com/blog",
  "arxiv.org", "towardsdatascience.com", "analyticsvidhya.com",
  "coursera.org", "udemy.com", "edx.org",
];

function isRejectedDomain(url: string): boolean {
  const lower = url.toLowerCase();
  return REJECT_DOMAINS.some((d) => lower.includes(d));
}

// ─── Main Discovery Engine ────────────────────────────────────────────────────

/**
 * Main AI-powered discovery engine.
 * Generates queries → searches the web → extracts job data → validates links.
 */
export async function runAIDiscovery(
  opts: AIDiscoveryOptions,
  onProgress: ProgressEmitter
): Promise<ScrapedJob[]> {
  const { role, region, dateFilter, maxResults = 30 } = opts;
  const results: ScrapedJob[] = [];
  const seenUrls = new Set<string>();

  const emit = (p: AIDiscoveryProgress) => {
    onProgress(p);
    // Persist log to DB if sessionId is present
    if (opts.sessionId && p.type === "log" && p.level && p.message) {
      db.insert(discoveryLogsTable).values({
        sessionId: opts.sessionId,
        type: p.level,
        source: "ai",
        message: p.message,
        metadata: { role: opts.role, region: opts.region }
      }).catch(err => logger.error({ err }, "Failed to persist discovery log"));
    }
  };

  const log = (level: "info" | "success" | "error", msg: string) =>
    emit({ type: "log", level, message: msg });

  const ai = new AIService();

  log("info", `🤖 AI Discovery: expanding role "${role}" via AI...`);
  const expansion = await ai.expandRole(role);
  log("info", `AI expanded variations: ${expansion.variations.slice(0, 3).join(", ")}...`);

  const queries = generateSearchQueries(role, region, expansion, dateFilter);
  log("info", `AI Discovery: running ${queries.length} targeted searches...`);

  let queryCount = 0;
  for (const query of queries) {
    if (results.length >= maxResults) break;

    try {
      queryCount++;
      log("info", `AI Discovery: searching [${queryCount}/${queries.length}]...`);

      const searchResults = await searchWeb(query, log);

      // Extract the target site from the query (if using site: operator)
      const siteMatch = query.match(/site:([^\s]+)/i);
      const targetSite = siteMatch ? siteMatch[1].toLowerCase() : null;

      for (const sr of searchResults) {
        if (results.length >= maxResults) break;
        if (seenUrls.has(sr.url)) continue;

        // Resolve Bing redirect URLs (bing.com/ck/a?…) before domain gate check
        let resolvedUrl = sr.url;
        if (sr.url.includes("bing.com/ck/a")) {
          // Strategy 1: Try to decode the 'u' parameter (base64-encoded destination)
          try {
            const urlObj = new URL(sr.url);
            const uParam = urlObj.searchParams.get("u");
            if (uParam) {
              // Bing base64-encodes with a prefix like "a1"
              const cleaned = uParam.replace(/^a1/, "");
              const decoded = Buffer.from(cleaned, "base64").toString("utf-8");
              if (decoded.startsWith("http")) resolvedUrl = decoded;
            }
          } catch { /* fall through to HEAD request */ }

          // Strategy 2: If decoding failed, try HEAD request to follow redirect
          if (resolvedUrl.includes("bing.com/ck/a")) {
            try {
              const ctrl = new AbortController();
              const t = setTimeout(() => ctrl.abort(), 5000);
              const res = await fetch(sr.url, { method: "HEAD", redirect: "follow", signal: ctrl.signal,
                headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" } });
              clearTimeout(t);
              if (res.url && !res.url.includes("bing.com")) resolvedUrl = res.url;
            } catch { /* keep original — will be filtered as noise */ }
          }
        }

        // Quick URL validation & redirect resolution
        const { isValid, finalUrl } = await quickValidateUrl(resolvedUrl);
        if (!isValid) {
          log("info", `AI Discovery: skipped dead/invalid URL — ${resolvedUrl.substring(0, 60)}`);
          continue;
        }

        // If the query targeted a specific site, enforce that the result is from that site
        if (targetSite && !finalUrl.toLowerCase().includes(targetSite)) {
          continue; // Silently skip — search engine returned off-site result
        }

        // Filter out obvious noise sites
        if (!isNotNoiseListing(finalUrl)) {
          log("info", `AI Discovery: filtered noise site — ${finalUrl.substring(0, 60)}`);
          continue;
        }

        if (seenUrls.has(finalUrl)) continue;
        seenUrls.add(sr.url);
        seenUrls.add(finalUrl);

        // Extract job data from the search result
        const job = extractJobFromSearchResult({ ...sr, url: finalUrl }, role, region, expansion.variations);
        if (!job) {
          log("info", `AI Discovery: could not extract job data from — ${sr.title}`);
          continue;
        }

        results.push(job);
        emit({ type: "job", job });
        log("success", `Found: "${job.title}" at ${job.company}`);
      }

      // Respectful delay between searches
      await new Promise((r) => setTimeout(r, 800 + Math.random() * 700));
    } catch (err: any) {
      log("error", `AI Discovery: search ${queryCount} failed — ${err.message}`);
    }
  }

  log("success", `🤖 AI Discovery: completed — ${results.length} valid job listings found`);
  emit({ type: "done", total: results.length });

  return results;
}

/**
 * Extract a ScrapedJob from a web search result (title + URL + snippet).
 * Only emits jobs from known job board domains.
 * Falls back to AI extraction when regex title/company parsing fails.
 */
function extractJobFromSearchResult(
  sr: SearchResult,
  role: string,
  region: string,
  aliases: string[] = []
): ScrapedJob | null {
  try {
    // ── Domain gates ────────────────────────────────────────────────
    // Hard reject — search engine result pages, dictionaries, social media
    if (isRejectedDomain(sr.url)) return null;

    // Soft require — URL should look like a job board
    // (skips generic article/news pages even if they mention the role)
    if (!isKnownJobBoardUrl(sr.url)) {
      // Give benefit of the doubt only if the snippet strongly signals a job posting
      const jobSignals = ["apply", "hiring", "we are looking", "job description", 
                         "responsibilities", "qualifications", "experience required",
                         "salary", "full-time", "remote"];
      const snippetLower = sr.snippet.toLowerCase();
      const hasJobSignal = jobSignals.some((s) => snippetLower.includes(s));
      if (!hasJobSignal) return null;
    }

    // ── Title + Company extraction ─────────────────────────────────────────
    const patterns = [
      // "Senior AI Engineer at Microsoft | LinkedIn"
      /^(.+?)\s+at\s+([^|–-]+?)(?:\s*[|–-]|$)/i,
      // "Microsoft: Senior AI Engineer - Dubai"
      /^([A-Z][^:]+):\s*(.+?)\s*[-|]\/s/i,
      // "Senior AI Engineer - Microsoft | Dubai, UAE"
      /^(.+?)\s*[|–-]\s*(.+?)\s*[|–-]\s*(.+)?$/i,
      // "Senior AI Engineer - Microsoft"
      /^(.+?)\s*[-–]\s*(.+)$/i,
    ];

    let title = "";
    let company = "";
    let location = region;

    for (const pattern of patterns) {
      const m = sr.title.match(pattern);
      if (m && m[1] && m[2]) {
        title = m[1].trim();
        company = m[2].trim();
        if (m[3]) location = m[3].trim();
        break;
      }
    }

    // Fallback: extract company from URL, title from snippet
    if (!title || !company) {
      company = company || extractCompanyFromUrl(sr.url) || "Unknown Company";
      // Try to find job title in snippet: "We are hiring a [title]"
      const snippetTitleMatch = sr.snippet.match(
        /(?:hiring|looking for|seeking|position of|role of)\s+(?:a\s+|an\s+)?([A-Z][^.!?]+?)(?:\s+to|\.|,|$)/i
      );
      title = title || snippetTitleMatch?.[1]?.trim() || role;
    }

    // Clean up common noise appended by search engines
    title = title.replace(/\s*[|–-]\s*(linkedin|indeed|glassdoor|bayt|naukrigulf|monster).*$/i, "").trim();
    company = company.replace(/\s*[|–-]\s*(linkedin|indeed|glassdoor|bayt).*$/i, "").trim();

    // If title still equals the raw role query exactly, try harder from snippet
    if (title.toLowerCase() === role.toLowerCase()) {
      const parts = sr.title.split(/[|–-]/).map((p) => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        title = parts[0];
        company = parts[parts.length - 1];
      }
    }

    // ── Relevance gate ──────────────────────────────────────────────────
    const isRelevant = isJobRelevant(
      title, sr.snippet, [`loc:${location}`], role, aliases, [], region
    );
    if (!isRelevant) return null;

    return {
      title,
      company,
      location,
      salary: "Not listed",
      description: sr.snippet,
      url: sr.url,
      source: SOURCE,
      externalId: `ai-${Buffer.from(sr.url).toString("base64").substring(0, 16)}`,
      logo: "AI",
      color: BASE_COLOR,
    };
  } catch {
    return null;
  }
}

/**
 * Quick URL validation — HEAD request with 4s timeout.
 * For known job board domains, skip validation (they often block HEAD requests).
 */
async function quickValidateUrl(url: string): Promise<{ isValid: boolean; finalUrl: string }> {
  if (!url || !url.startsWith("http")) return { isValid: false, finalUrl: url };

  // Known job boards often block HEAD requests or require cookies.
  // Trust these domains without validation — they were found via search engines.
  const TRUSTED_DOMAINS = [
    "bayt.com", "naukrigulf.com", "gulftalent.com", "linkedin.com",
    "indeed.com", "glassdoor.com", "monster.com", "dubizzle.com",
    "greenhouse.io", "lever.co", "workable.com", "smartrecruiters.com",
    "remoteok.com", "wellfound.com", "dice.com", "ziprecruiter.com",
    "monstergulf.com", "drjobs.ae", "laimoon.com", "tanqeeb.com",
    "akhtaboot.com", "gulfjobs.com", "forasna.com", "weworkremotely.com",
  ];
  const urlLower = url.toLowerCase();
  if (TRUSTED_DOMAINS.some(d => urlLower.includes(d))) {
    return { isValid: true, finalUrl: url };
  }

  try {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(url, {
      method: "HEAD",
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      },
    });
    clearTimeout(timeout);
    const finalUrl = res.url || url;
    const isLoginWall = ["/login", "/authwall", "/checkpoint", "signin"].some(
      (p) => finalUrl.toLowerCase().includes(p)
    );
    return { 
      isValid: res.ok && !isLoginWall,
      finalUrl 
    };
  } catch {
    // On timeout/network error, give benefit of the doubt for URLs that look like job pages
    const looksLikeJobUrl = urlLower.includes("/jobs") || urlLower.includes("/job/") || 
                            urlLower.includes("careers") || urlLower.includes("hiring");
    return { isValid: looksLikeJobUrl, finalUrl: url };
  }
}
