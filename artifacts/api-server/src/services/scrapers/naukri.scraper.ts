// artifacts/api-server/src/services/scrapers/naukri.scraper.ts
import { getBrowser, newStealthContext, humanDelay, humanScroll } from "./browser.js";
import { type ScrapedJob, type SearchOptions, type JobEmitter, type LogEmitter } from "./types.js";
import { logger } from "../../lib/logger.js";

const SOURCE = "Naukri";
const BASE_COLOR = "#ff7555";

export async function scrapeNaukri(
  opts: SearchOptions,
  onJob: JobEmitter,
  onLog: LogEmitter
): Promise<ScrapedJob[]> {
  const browser = await getBrowser();
  const ctx = await newStealthContext(browser);
  const page = await ctx.newPage();
  const results: ScrapedJob[] = [];

  try {
    onLog("info", `Naukri: searching for "${opts.role}" in "${opts.region}"...`);

    // Build Naukri search URL
    const roleSlug = opts.role.toLowerCase().replace(/\s+/g, "-");
    const regionSlug = opts.region.toLowerCase().replace(/[\s/,]+/g, "-");
    const searchUrl = `https://www.naukri.com/${roleSlug}-jobs-in-${regionSlug}`;

    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await humanDelay(2000, 3500);

    // Accept cookies if prompted
    try {
      const cookieBtn = page.locator("button:has-text('Accept'), button:has-text('OK')").first();
      if (await cookieBtn.isVisible({ timeout: 2000 })) {
        await cookieBtn.click();
        await humanDelay(500, 1000);
      }
    } catch (_) {}

    await humanScroll(page, 3);
    await humanDelay(1000, 2000);

    // Extract job articles
    const jobs = await page.evaluate((source: string) => {
      const cards = document.querySelectorAll(
        "article.jobTuple, .jobTupleHeader, .cust-job-tuple, [data-job-id], .srp-jobtuple-wrapper"
      );
      const extracted: any[] = [];

      cards.forEach((card) => {
        try {
          const titleEl = card.querySelector(
            ".title, a.title, .jobTitle, [class*='title']"
          );
          const companyEl = card.querySelector(
            ".companyInfo a, .comp-name, [class*='company']"
          );
          const locationEl = card.querySelector(
            ".locWdth, .loc, [class*='location']"
          );
          const salaryEl = card.querySelector(
            ".salary, [class*='salary'], .salaryWdth"
          );
          const linkEl = card.querySelector("a[href*='naukri.com']") || titleEl;
          const postedEl = card.querySelector(".job-post-day, [class*='posted'], time");

          const title = titleEl?.textContent?.trim();
          const company = companyEl?.textContent?.trim();
          const url =
            (linkEl as HTMLAnchorElement)?.href ||
            `https://www.naukri.com/jobs/search?q=${encodeURIComponent(title || "")}`;

          if (title && company) {
            extracted.push({
              title,
              company,
              location: locationEl?.textContent?.trim() || "India",
              salary: salaryEl?.textContent?.trim() || "Not disclosed",
              url,
              postedAt: postedEl?.textContent?.trim(),
              source,
              externalId: card.getAttribute("data-job-id") || url,
            });
          }
        } catch (_) {}
      });

      return extracted;
    }, SOURCE);

    for (const job of jobs) {
      const scrapedJob: ScrapedJob = {
        ...job,
        logo: "NA",
        color: BASE_COLOR,
      };
      results.push(scrapedJob);
      onJob(scrapedJob);
    }

    onLog("success", `Naukri: found ${results.length} listings`);
  } catch (err: any) {
    onLog("error", `Naukri scraper error: ${err.message}`);
    logger.error({ err }, "Naukri scraper failed");
  } finally {
    await page.close();
    await ctx.close();
  }

  return results;
}
