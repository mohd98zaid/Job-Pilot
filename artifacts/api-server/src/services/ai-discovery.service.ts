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
import { type Page } from "playwright";
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

  // Primary + top 2 AI-expanded variants
  const variants = [role, ...expansion.variations.slice(0, 2)];

  // ── Gulf / MENA job boards (highest value for UAE searches) ──
  const gulfBoards = ["bayt.com", "naukrigulf.com", "gulftalent.com"];
  for (const board of gulfBoards) {
    queries.push(`"${role}" site:${board}`);
  }

  // ── LinkedIn (most structured results) ──
  for (const alias of regionAliases.slice(0, 2)) {
    queries.push(`"${role}" "${alias}" 2025 site:linkedin.com/jobs`);
  }

  // ── Global boards ──
  queries.push(`"${role}" "${region}" site:indeed.com`);
  queries.push(`"${role}" "${region}" site:glassdoor.com`);

  // ── ATS portals ──
  for (const ats of ["greenhouse.io", "lever.co", "workable.com", "smartrecruiters.com"]) {
    queries.push(`${role} ${region} site:${ats}`);
  }

  // ── AI-expanded variant queries ──
  for (const rv of variants.slice(1)) {
    queries.push(`"${rv}" "${region}" jobs 2025 apply`);
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

/**
 * Execute a single search attempt for one engine.
 * Returns the results or throws. Owns the full lifecycle of its ctx+page
 * so there is no double-decrement when the outer loop retries.
 */
async function attemptEngineSearch(
  engine: { name: string; url: (q: string) => string },
  query: string,
  log: (level: "info" | "success" | "error", msg: string) => void
): Promise<{ results: SearchResult[]; captchaDetected: boolean }> {
  // Wait if another engine is mid headful-switch so we don't race
  await headfulSwitchPromise;

  incrementActiveTasks();
  let ctx: Awaited<ReturnType<typeof newStealthContext>> | null = null;
  let page: import("playwright").Page | null = null;

  try {
    const browser = await getBrowser(!headfulModeActive);
    ctx = await newStealthContext(browser);
    page = await ctx.newPage();

    await page.goto(engine.url(query), { waitUntil: "domcontentloaded", timeout: 25000 });

    const isCaptcha = await detectCaptcha(page);
    if (isCaptcha) {
      return { results: [], captchaDetected: true };
    }

    const scraped = engine.name === "Google" ? await scrapeGoogle(page)
                  : engine.name === "Bing"   ? await scrapeBing(page)
                  : await scrapeDDG(page);

    return { results: scraped, captchaDetected: false };
  } finally {
    // Always clean up — page first, then context, then counter.
    // This runs exactly once per call (no continue/break interference).
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
    { name: "DuckDuckGo",url: (q: string) => `https://duckduckgo.com/html/?q=${encodeURIComponent(q)}` },
  ];

  const results: SearchResult[] = [];

  for (const engine of engines) {
    // ── Circuit breaker ────────────────────────────────────────────────
    const health = (engineHealth as Record<string, { fails: number; lastFail: number }>)[engine.name];
    if (health && health.fails >= 2 && Date.now() - health.lastFail < 300_000) {
      log("info", `AI Discovery: skipping ${engine.name} (circuit breaker active)`);
      continue;
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
          incrementActiveTasks();
          let headfulCtx: Awaited<ReturnType<typeof newStealthContext>> | null = null;
          let headfulPage: import("playwright").Page | null = null;

          try {
            const headfulBrowser = await getBrowser(false);
            headfulCtx = await newStealthContext(headfulBrowser);
            headfulPage = await headfulCtx.newPage();

            await headfulPage.goto(engine.url(query), { waitUntil: "domcontentloaded" });
            await headfulPage.bringToFront();

            log("info", `Please solve the CAPTCHA in the visible window for ${engine.name}. Waiting 60 s...`);
            await humanDelay(45_000, 60_000);

            if (await detectCaptcha(headfulPage)) {
              log("error", `${engine.name} CAPTCHA still present after timeout.`);
              health.fails++;
              health.lastFail = Date.now();
              break; // give up on this engine
            }

            const hitlResults = engine.name === "Google" ? await scrapeGoogle(headfulPage)
                               : engine.name === "Bing"   ? await scrapeBing(headfulPage)
                               : await scrapeDDG(headfulPage);

            health.fails = 0;
            log("success", `${engine.name} (HITL) returned ${hitlResults.length} results`);
            results.push(...hitlResults);
            succeeded = true;
          } finally {
            if (headfulPage && !headfulPage.isClosed()) await headfulPage.close().catch(() => {});
            if (headfulCtx) await headfulCtx.close().catch(() => {});
            decrementActiveTasks();
            resolveHeadfulSwitch(); // unblock other engines waiting on the switch
          }
          break; // CAPTCHA path handled — exit retry loop
        }

        // ── Happy path ──────────────────────────────────────────────────
        health.fails = 0;
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
    document.querySelectorAll("div.g").forEach((el) => {
      const titleEl = el.querySelector("h3");
      const linkEl = el.querySelector("a");
      const snippetEl = el.querySelector("div[style*='-webkit-line-clamp']");
      if (titleEl && linkEl) {
        results.push({
          title: titleEl.textContent?.trim(),
          url: (linkEl as HTMLAnchorElement).href,
          snippet: snippetEl?.textContent?.trim() || "",
        });
      }
    });
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
        results.push({
          title: titleEl.textContent?.trim(),
          url: (titleEl as HTMLAnchorElement).href,
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
    document.querySelectorAll(".result__body").forEach((el) => {
      const titleEl = el.querySelector(".result__a");
      const snippetEl = el.querySelector(".result__snippet");
      if (titleEl) {
        results.push({
          title: titleEl.textContent?.trim(),
          url: (titleEl as HTMLAnchorElement).href,
          snippet: snippetEl?.textContent?.trim() || "",
        });
      }
    });
    return results;
  });
}

// ─── ATS Job Extractors ───────────────────────────────────────────────────────

/**
 * Determines if a URL is a known, direct job listing page (ATS portal).
 */
function isNotNoiseListing(url: string): boolean {
  return !isRejectedDomain(url);
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

      for (const sr of searchResults) {
        if (results.length >= maxResults) break;
        if (seenUrls.has(sr.url)) continue;

        // Quick URL validation & redirect resolution
        const { isValid, finalUrl } = await quickValidateUrl(sr.url);
        if (!isValid) {
          log("info", `AI Discovery: skipped dead/invalid URL — ${sr.url.substring(0, 60)}`);
          continue;
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
 */
async function quickValidateUrl(url: string): Promise<{ isValid: boolean; finalUrl: string }> {
  if (!url || !url.startsWith("http")) return { isValid: false, finalUrl: url };
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
    return { isValid: false, finalUrl: url };
  }
}
