// artifacts/api-server/src/services/scrapers/browser.ts
// Shared browser instance manager with stealth configuration

import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { logger } from "../../lib/logger.js";

let browserInstance: Browser | null = null;

const STEALTH_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-blink-features=AutomationControlled",
  "--disable-features=IsolateOrigins,site-per-process",
  "--disable-dev-shm-usage",
  "--no-first-run",
  "--no-default-browser-check",
];

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
];

function randomUA(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

export async function getBrowser(): Promise<Browser> {
  if (browserInstance && browserInstance.isConnected()) {
    return browserInstance;
  }
  logger.info("Launching Playwright browser...");
  browserInstance = await chromium.launch({
    headless: true,
    args: STEALTH_ARGS,
  });
  return browserInstance;
}

export async function newStealthContext(browser: Browser): Promise<BrowserContext> {
  const ctx = await browser.newContext({
    userAgent: randomUA(),
    viewport: { width: 1366, height: 768 },
    locale: "en-US",
    timezoneId: "Asia/Kolkata",
    extraHTTPHeaders: {
      "Accept-Language": "en-US,en;q=0.9",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    },
    // Mask playwright fingerprint
    javaScriptEnabled: true,
  });

  // Override navigator.webdriver
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
