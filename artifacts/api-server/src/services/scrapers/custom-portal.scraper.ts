// artifacts/api-server/src/services/scrapers/custom-portal.scraper.ts
// Generic scraper for any company career page or custom URL

import { getBrowser, newStealthContext, humanDelay, humanScroll } from "./browser.js";
import { type ScrapedJob, type JobEmitter, type LogEmitter } from "./types.js";
import { logger } from "../../lib/logger.js";

interface CustomPortalOpts {
  name: string;
  url: string;
  role: string;
  color?: string;
}

// Common job listing CSS selectors across ATS platforms
const JOB_CARD_SELECTORS = [
  // Generic
  "[class*='job-card']", "[class*='job_card']", "[class*='jobCard']",
  "[class*='job-listing']", "[class*='job-item']", "[class*='opening']",
  // Greenhouse
  ".opening", ".job_link",
  // Lever
  ".posting", ".posting-title",
  // Workday
  "[data-automation-id='jobFoundDescription']",
  // Taleo
  ".oracleListItem",
  // SmartRecruiters
  "[class*='smartrecruiters']",
  // BambooHR
  "li.ResListItem",
  // ICIMS
  ".iCIMS_JobsTable tr",
  // Fallback
  "article", "li:has(a[href*='job']):has(h2, h3)", "li:has(a[href*='career']):has(h2, h3)",
];

const TITLE_SELECTORS = [
  "h1", "h2", "h3", "h4",
  "[class*='title']", "[class*='role']", "[class*='position']",
  ".job_link", ".posting-title",
];

const COMPANY_FROM_PAGE = (portalName: string) => portalName; // company = portal name

export async function scrapeCustomPortal(
  opts: CustomPortalOpts,
  onJob: JobEmitter,
  onLog: LogEmitter
): Promise<ScrapedJob[]> {
  const browser = await getBrowser();
  const ctx = await newStealthContext(browser);
  const page = await ctx.newPage();
  const results: ScrapedJob[] = [];
  const colors = ["#e11d48", "#7c3aed", "#0891b2", "#059669", "#d97706", "#dc2626"];
  const color = opts.color || colors[Math.floor(Math.random() * colors.length)];
  const logo = opts.name.substring(0, 2).toUpperCase();

  try {
    onLog("info", `${opts.name}: opening ${opts.url}...`);

    await page.goto(opts.url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await humanDelay(1500, 3000);

    // Try to search within the portal if a search input exists
    try {
      const searchInput = page.locator("input[type='search'], input[placeholder*='search'], input[placeholder*='Search'], input[name*='keyword'], input[name*='search']").first();
      if (await searchInput.isVisible({ timeout: 2000 })) {
        await searchInput.fill(opts.role);
        await humanDelay(300, 600);
        await searchInput.press("Enter");
        await humanDelay(2000, 3000);
        onLog("info", `${opts.name}: searched for "${opts.role}"`);
      }
    } catch (_) {}

    await humanScroll(page, 3);
    await humanDelay(800, 1500);

    // Try each selector to find job cards
    let jobs: any[] = [];
    for (const selector of JOB_CARD_SELECTORS) {
      try {
        const count = await page.locator(selector).count();
        if (count > 0) {
          jobs = await page.evaluate((args: { selector: string; source: string; company: string }) => {
            const cards = document.querySelectorAll(args.selector);
            const extracted: any[] = [];
            cards.forEach((card) => {
              try {
                const titleEl = card.querySelector("h1,h2,h3,h4,a,[class*='title'],[class*='role'],[class*='position']");
                const locationEl = card.querySelector("[class*='location'],[class*='city'],[class*='country']");
                const linkEl = card.querySelector("a") || (card.tagName === "A" ? card : null);
                const href = (linkEl as HTMLAnchorElement)?.href;
                const title = titleEl?.textContent?.trim();
                if (title && title.length > 3 && title.length < 120) {
                  extracted.push({
                    title,
                    company: args.company,
                    location: locationEl?.textContent?.trim() || "Not specified",
                    url: href || window.location.href,
                    source: args.source,
                    externalId: href || title,
                  });
                }
              } catch (_) {}
            });
            return extracted;
          }, { selector, source: opts.name, company: COMPANY_FROM_PAGE(opts.name) });

          if (jobs.length > 0) break;
        }
      } catch (_) {}
    }

    // Filter by role keyword relevance
    const roleKeywords = opts.role.toLowerCase().split(/\s+/);
    const filtered = jobs.filter(j => {
      const titleLower = j.title.toLowerCase();
      return roleKeywords.some(kw => kw.length > 2 && titleLower.includes(kw));
    });
    const finalJobs = filtered.length > 0 ? filtered : jobs.slice(0, 10);

    for (const job of finalJobs) {
      const scrapedJob: ScrapedJob = { ...job, salary: "See listing", logo, color };
      results.push(scrapedJob);
      onJob(scrapedJob);
    }

    onLog("success", `${opts.name}: found ${results.length} matching listings`);
  } catch (err: any) {
    onLog("error", `${opts.name} portal error: ${err.message}`);
    logger.error({ err, url: opts.url }, "Custom portal scraper failed");
  } finally {
    await page.close();
    await ctx.close();
  }

  return results;
}
