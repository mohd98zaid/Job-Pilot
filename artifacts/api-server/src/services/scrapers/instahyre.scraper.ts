// artifacts/api-server/src/services/scrapers/instahyre.scraper.ts
import { getBrowser, newStealthContext, humanDelay, humanScroll } from "./browser.js";
import { type ScrapedJob, type SearchOptions, type JobEmitter, type LogEmitter } from "./types.js";
import { logger } from "../../lib/logger.js";

const SOURCE = "InstaHyre";
const BASE_COLOR = "#00b386";

export async function scrapeInstaHyre(
  opts: SearchOptions,
  onJob: JobEmitter,
  onLog: LogEmitter
): Promise<ScrapedJob[]> {
  const browser = await getBrowser();
  const ctx = await newStealthContext(browser);
  const page = await ctx.newPage();
  const results: ScrapedJob[] = [];

  try {
    onLog("info", `InstaHyre: searching for "${opts.role}"...`);
    const searchUrl = `https://www.instahyre.com/search-jobs/?q=${encodeURIComponent(opts.role)}&l=${encodeURIComponent(opts.region)}`;
    await page.goto(searchUrl, { waitUntil: "networkidle", timeout: 30000 });
    await humanDelay(2000, 3500);
    await humanScroll(page, 3);
    await humanDelay(1000, 2000);

    const jobs = await page.evaluate((source: string) => {
      const cards = document.querySelectorAll(".opportunity-card, [class*='job-card'], [class*='opportunity']");
      const extracted: any[] = [];
      cards.forEach((card) => {
        try {
          const titleEl = card.querySelector("h2, h3, [class*='title'], [class*='designation']");
          const companyEl = card.querySelector("[class*='company'], [class*='employer']");
          const locationEl = card.querySelector("[class*='location']");
          const salaryEl = card.querySelector("[class*='salary'], [class*='ctc']");
          const linkEl = card.querySelector("a");
          const href = (linkEl as HTMLAnchorElement)?.href || "";
          const title = titleEl?.textContent?.trim();
          const company = companyEl?.textContent?.trim();
          if (title && company) {
            extracted.push({ title, company, location: locationEl?.textContent?.trim() || "India", salary: salaryEl?.textContent?.trim() || "Not disclosed", url: href || "https://www.instahyre.com", source, externalId: href });
          }
        } catch (_) {}
      });
      return extracted;
    }, SOURCE);

    for (const job of jobs) {
      const scrapedJob: ScrapedJob = { ...job, logo: "IH", color: BASE_COLOR };
      results.push(scrapedJob);
      onJob(scrapedJob);
    }
    onLog("success", `InstaHyre: found ${results.length} listings`);
  } catch (err: any) {
    onLog("error", `InstaHyre error: ${err.message}`);
    logger.error({ err }, "InstaHyre scraper failed");
  } finally {
    await page.close();
    await ctx.close();
  }
  return results;
}
