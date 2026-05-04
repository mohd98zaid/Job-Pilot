// artifacts/api-server/src/services/scrapers/indeed.scraper.ts
import { getBrowser, newStealthContext, humanDelay, humanScroll } from "./browser.js";
import { type ScrapedJob, type SearchOptions, type JobEmitter, type LogEmitter } from "./types.js";
import { logger } from "../../lib/logger.js";

const SOURCE = "Indeed";
const BASE_COLOR = "#003a9b";

function dateFilterToParam(dateFilter?: string): string {
  if (!dateFilter) return "7";
  if (dateFilter.includes("24")) return "1";
  if (dateFilter.includes("7")) return "7";
  if (dateFilter.includes("14")) return "14";
  if (dateFilter.includes("30")) return "30";
  return "7";
}

export async function scrapeIndeed(
  opts: SearchOptions,
  onJob: JobEmitter,
  onLog: LogEmitter
): Promise<ScrapedJob[]> {
  const browser = await getBrowser();
  const ctx = await newStealthContext(browser);
  const page = await ctx.newPage();
  const results: ScrapedJob[] = [];

  try {
    onLog("info", `Indeed: searching for "${opts.role}" in "${opts.region}"...`);

    const days = dateFilterToParam(opts.dateFilter);
    // Use in.indeed.com for India/Gulf region, otherwise indeed.com
    const isIndia = opts.region.toLowerCase().includes("india") || opts.region.toLowerCase().includes("in");
    const baseUrl = isIndia ? "https://in.indeed.com" : "https://www.indeed.com";
    const searchUrl = `${baseUrl}/jobs?q=${encodeURIComponent(opts.role)}&l=${encodeURIComponent(opts.region)}&fromage=${days}&sort=date`;

    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await humanDelay(2000, 3500);

    // Handle "I'm not a robot" if shown
    const captcha = await page.$("iframe[src*='recaptcha'], .g-recaptcha");
    if (captcha) {
      onLog("error", "Indeed: CAPTCHA detected — skipping");
      return results;
    }

    await humanScroll(page, 3);
    await humanDelay(800, 1500);

    const jobs = await page.evaluate((args: { source: string; base: string }) => {
      const cards = document.querySelectorAll(
        ".job_seen_beacon, .tapItem, [data-testid='job-result-card'], .resultContent"
      );
      const extracted: any[] = [];

      cards.forEach((card) => {
        try {
          const titleEl = card.querySelector(
            "h2.jobTitle a, [data-testid='job-title'], .jcs-JobTitle"
          );
          const companyEl = card.querySelector(
            "[data-testid='company-name'], .companyName, span[class*='company']"
          );
          const locationEl = card.querySelector(
            "[data-testid='text-location'], .companyLocation"
          );
          const salaryEl = card.querySelector(
            "[data-testid='attribute_snippet_testid'], .salary-snippet, .metadata"
          );
          const postedEl = card.querySelector(
            "[data-testid='myJobsStateDate'], .date, span[class*='Date']"
          );

          const title = titleEl?.textContent?.trim();
          const company = companyEl?.textContent?.trim();
          const href = (titleEl as HTMLAnchorElement)?.href ||
            (card.querySelector("a") as HTMLAnchorElement)?.href;
          const url = href ? (href.startsWith("http") ? href : `${args.base}${href}`) : "";

          if (title && company) {
            extracted.push({
              title, company,
              location: locationEl?.textContent?.trim() || args.base.includes("in.") ? "India" : "Remote",
              salary: salaryEl?.textContent?.trim() || "Not listed",
              url,
              postedAt: postedEl?.textContent?.trim(),
              source: args.source,
              externalId: url || `${title}-${company}`,
            });
          }
        } catch (_) {}
      });

      return extracted;
    }, { source: SOURCE, base: baseUrl });

    for (const job of jobs) {
      const scrapedJob: ScrapedJob = {
        ...job,
        logo: "IN",
        color: BASE_COLOR,
      };
      results.push(scrapedJob);
      onJob(scrapedJob);
    }

    onLog("success", `Indeed: found ${results.length} listings`);
  } catch (err: any) {
    onLog("error", `Indeed scraper error: ${err.message}`);
    logger.error({ err }, "Indeed scraper failed");
  } finally {
    await page.close();
    await ctx.close();
  }

  return results;
}
