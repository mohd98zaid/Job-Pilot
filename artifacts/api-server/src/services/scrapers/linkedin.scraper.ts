// artifacts/api-server/src/services/scrapers/linkedin.scraper.ts
import { type Browser } from "patchright";
import { getBrowser, newStealthContext, humanDelay, humanScroll } from "./browser.js";
import { type ScrapedJob, type SearchOptions, type JobEmitter, type LogEmitter } from "./types.js";
import { logger } from "../../lib/logger.js";

const SOURCE = "LinkedIn";
const BASE_COLOR = "#0A66C2";

function dateFilterToDays(dateFilter?: string): number {
  if (!dateFilter) return 7;
  if (dateFilter.includes("24")) return 1;
  if (dateFilter.includes("7")) return 7;
  if (dateFilter.includes("14")) return 14;
  if (dateFilter.includes("30")) return 30;
  return 7;
}

function toTimeParam(days: number): string {
  // LinkedIn: r86400 = last 24h, r604800 = last 7d, r2592000 = last 30d
  if (days <= 1) return "r86400";
  if (days <= 7) return "r604800";
  return "r2592000";
}

export async function scrapeLinkedIn(
  opts: SearchOptions,
  onJob: JobEmitter,
  onLog: LogEmitter
): Promise<ScrapedJob[]> {
  const browser = await getBrowser();
  const ctx = await newStealthContext(browser);
  const page = await ctx.newPage();
  const results: ScrapedJob[] = [];

  try {
    onLog("info", `LinkedIn: opening job search for "${opts.role}" in "${opts.region}"...`);

    const days = dateFilterToDays(opts.dateFilter);
    const timeParam = toTimeParam(days);
    const searchUrl = `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(opts.role)}&location=${encodeURIComponent(opts.region)}&f_TPR=${timeParam}&sortBy=DD`;

    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await humanDelay(1500, 3000);

    // Check if redirected to login
    const isLoginPage = page.url().includes("/login") || page.url().includes("/authwall");
    if (isLoginPage) {
      onLog("info", "LinkedIn: requires login — showing public results only (limited)");
      // Try the public jobs page instead
      const publicUrl = `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=${encodeURIComponent(opts.role)}&location=${encodeURIComponent(opts.region)}&f_TPR=${timeParam}&start=0`;
      await page.goto(publicUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      await humanDelay(1000, 2000);
    }

    // Scroll to load more results
    await humanScroll(page, 4);
    await humanDelay(800, 1500);

    // Extract job cards
    const jobs = await page.evaluate((source: string) => {
      const cards = document.querySelectorAll(
        ".job-search-card, .jobs-search__results-list li, .base-card, .job-card-container"
      );

      const extracted: any[] = [];
      cards.forEach((card) => {
        try {
          const titleEl = card.querySelector(
            ".base-search-card__title, .job-card-list__title, h3, .job-card-container__link"
          );
          const companyEl = card.querySelector(
            ".base-search-card__subtitle, .job-card-container__company-name, h4"
          );
          const locationEl = card.querySelector(
            ".job-search-card__location, .job-card-container__metadata-item"
          );
          const linkEl = card.querySelector("a[href*='/jobs/view/'], a[href*='linkedin.com/jobs']");
          const postedEl = card.querySelector("time, .job-search-card__listdate");

          const title = titleEl?.textContent?.trim();
          const company = companyEl?.textContent?.trim();
          const location = locationEl?.textContent?.trim();
          const url = linkEl?.getAttribute("href");
          const postedAt = postedEl?.getAttribute("datetime") || postedEl?.textContent?.trim();

          if (title && company && url) {
            extracted.push({
              title, company,
              location: location || "Not specified",
              url: url.startsWith("http") ? url : `https://www.linkedin.com${url}`,
              postedAt,
              source,
              externalId: url.match(/\/(\d+)\/?/)?.[1],
            });
          }
        } catch (_) {}
      });
      return extracted;
    }, SOURCE);

    for (const job of jobs) {
      const scrapedJob: ScrapedJob = {
        ...job,
        salary: "Not listed",
        logo: "LI",
        color: BASE_COLOR,
      };
      results.push(scrapedJob);
      onJob(scrapedJob);
    }

    onLog("success", `LinkedIn: found ${results.length} listings`);
  } catch (err: any) {
    onLog("error", `LinkedIn scraper error: ${err.message}`);
    logger.error({ err }, "LinkedIn scraper failed");
  } finally {
    await page.close();
    await ctx.close();
  }

  return results;
}
