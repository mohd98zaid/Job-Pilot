// artifacts/api-server/src/services/scrapers/browser.ts
// Shared browser instance manager with stealth configuration.
//
// Architecture: ONE persistent Chromium process shared across all scrapers.
// Each scraper gets its OWN ephemeral BrowserContext (isolated tab group).
// Closing a scraper's context NEVER affects other scrapers or the global browser.

import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { logger } from "../../lib/logger.js";

import path from "path";
import fs from "fs";

const USER_DATA_DIR = path.join(process.cwd(), ".browser_data");
if (!fs.existsSync(USER_DATA_DIR)) fs.mkdirSync(USER_DATA_DIR, { recursive: true });

// ── Singleton browser instance ────────────────────────────────────────────────
// ONE browser process, many ephemeral contexts. Consumers get a context and
// close it when done. The browser itself is never exposed to consumers.
let browserInstance: Browser | null = null;
let currentHeadless = true;
let isSwitching = false;
let activeTasks = 0;


const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
];

function randomUA(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}



/**
 * Increment the active task count to prevent premature browser closure.
 */
export function incrementActiveTasks() {
  activeTasks++;
}

export function decrementActiveTasks() {
  activeTasks = Math.max(0, activeTasks - 1);
}

/**
 * Returns the shared Browser instance, starting it if needed.
 * NEVER closes this — use newStealthContext() to get an isolated context.
 * Each caller gets its own context (and must close it when done).
 */
export async function getBrowser(headless = true): Promise<Browser> {
  // Wait for any in-progress mode switch to finish
  while (isSwitching) {
    await new Promise((r) => setTimeout(r, 100));
  }

  // Reuse existing browser if mode matches
  if (browserInstance && !browserInstance.isConnected()) {
    logger.warn("Browser disconnected — restarting.");
    browserInstance = null;
  }

  if (browserInstance && currentHeadless === headless) {
    return browserInstance;
  }

  // Mode switch or first launch
  if (browserInstance) {
    isSwitching = true;
    logger.info(`Switching browser to headless=${headless}. Waiting for active tasks (${activeTasks})...`);
    const deadline = Date.now() + 20_000;
    while (activeTasks > 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 200));
    }
    await browserInstance.close().catch(() => {});
    browserInstance = null;
    isSwitching = false;
  }

  logger.info(`Launching Chromium browser (headless=${headless})...`);
  browserInstance = await chromium.launch({
    headless,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
      "--disable-features=IsolateOrigins,site-per-process",
      "--disable-dev-shm-usage",
      "--no-first-run",
      "--no-default-browser-check",
    ],
  });

  currentHeadless = headless;
  return browserInstance;
}

/**
 * Creates a fresh, isolated BrowserContext from the shared browser.
 * The caller MUST close this context when done — it is safe to do so
 * because it is ephemeral and does NOT affect other scrapers.
 */
export async function newStealthContext(browser: Browser): Promise<BrowserContext> {
  const ctx = await browser.newContext({
    userAgent: randomUA(),
    ignoreHTTPSErrors: true,
    viewport: { width: 1366, height: 768 },
    locale: "en-US",
    timezoneId: "Asia/Dubai",  // Use Dubai TZ for UAE region accuracy
    extraHTTPHeaders: {
      "Accept-Language": "en-US,en;q=0.9",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    },
    javaScriptEnabled: true,
  });

  // Override navigator.webdriver fingerprint
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, "languages", { get: () => ["en-US", "en"] });
    // @ts-ignore
    window.chrome = { runtime: {} };
  });

  return ctx;
}

/** Human-like delay between min and max ms */
export function humanDelay(min = 300, max = 1200): Promise<void> {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(r => setTimeout(r, ms));
}

/** Human-like scroll on a page */
export async function humanScroll(page: Page, scrolls = 3): Promise<void> {
  for (let i = 0; i < scrolls; i++) {
    await page.evaluate(() => window.scrollBy(0, 400 + Math.random() * 200));
    await humanDelay(400, 900);
  }
}

export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}
