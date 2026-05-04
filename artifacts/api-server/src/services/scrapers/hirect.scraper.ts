// artifacts/api-server/src/services/scrapers/hirect.scraper.ts
import { getBrowser, newStealthContext, humanDelay, humanScroll } from "./browser.js";
import { type ScrapedJob, type SearchOptions, type JobEmitter, type LogEmitter } from "./types.js";
import { logger } from "../../lib/logger.js";

const SOURCE = "Hirect";
const BASE_COLOR = "#6c47ff";

export async function scrapeHirect(
  opts: SearchOptions,
  onJob: JobEmitter,
  onLog: LogEmitter
): Promise<ScrapedJob[]> {
  const browser = await getBrowser();
  const ctx = await newStealthContext(browser);
  const page = await ctx.newPage();
  const results: ScrapedJob[] = [];

  try {
    onLog("info", `Hirect: searching for "${opts.role}"...`);

    // Hirect has a web app at hirect.in
    const searchUrl = `https://hirect.in/job-search?keyword=${encodeURIComponent(opts.role)}&location=${encodeURIComponent(opts.region)}`;
    await page.goto(searchUrl, { waitUntil: "networkidle", timeout: 30000 });
    await humanDelay(2500, 4000);

    await humanScroll(page, 3);
    await humanDelay(1000, 2000);

    const jobs = await page.evaluate((source: string) => {
      // Hirect job cards
      const cards = document.querySelectorAll(
        ".job-card, [class*='jobCard'], [class*='job_card'], .job-listing-item"
      );
      const extracted: any[] = [];

      cards.forEach((card) => {
        try {
          const titleEl = card.querySelector("h2, h3, [class*='title'], [class*='role']");
          const companyEl = card.querySelector("[class*='company'], [class*='employer']");
          const locationEl = card.querySelector("[class*='location'], [class*='city']");
          const salaryEl = card.querySelector("[class*='salary'], [class*='ctc'], [class*='pay']");
          const linkEl = card.querySelector("a") || card.closest("a");
          const href = (linkEl as HTMLAnchorElement)?.href || "";

          const title = titleEl?.textContent?.trim();
          const company = companyEl?.textContent?.trim();

          if (title && company) {
            extracted.push({
              title,
              company,
              location: locationEl?.textContent?.trim() || "India",
              salary: salaryEl?.textContent?.trim() || "Not disclosed",
              url: href || "https://hirect.in",
              source,
              externalId: href || `${title}-${company}`,
            });
          }
        } catch (_) {}
      });

      return extracted;
    }, SOURCE);

    for (const job of jobs) {
      const scrapedJob: ScrapedJob = {
        ...job,
        logo: "HI",
        color: BASE_COLOR,
      };
      results.push(scrapedJob);
      onJob(scrapedJob);
    }

    onLog("success", `Hirect: found ${results.length} listings`);
  } catch (err: any) {
    onLog("error", `Hirect scraper error: ${err.message}`);
    logger.error({ err }, "Hirect scraper failed");
  } finally {
    await page.close();
    await ctx.close();
  }

  return results;
}
