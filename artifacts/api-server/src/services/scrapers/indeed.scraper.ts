// artifacts/api-server/src/services/scrapers/indeed.scraper.ts
import { getBrowser, newStealthContext, humanDelay, humanScroll } from "./browser.js";
import { type ScrapedJob, type SearchOptions, type JobEmitter, type LogEmitter } from "./types.js";
import { buildLocationTerms } from "./relevance.js";
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
    // Route to the correct Indeed regional domain
    const regionLower = opts.region.toLowerCase();
    const isIndia = (regionLower.includes("india") || regionLower === "in") &&
                    !regionLower.includes("dubai") && !regionLower.includes("uae") &&
                    !regionLower.includes("abu dhabi") && !regionLower.includes("sharjah");
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
              // Fixed: ternary precedence bug — location must be evaluated before OR
              location: locationEl?.textContent?.trim() || (args.base.includes("in.") ? "India" : "Remote"),
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

    // ── Location filter ──────────────────────────────────────────────────────
    // STRICT: Only accept jobs that match the target region.
    // Indeed's search URL filters by location, but sometimes returns nearby/remote jobs.
    const regionTerms = buildLocationTerms(opts.region.toLowerCase());

    for (const job of jobs) {
      const jobLocLower = (job.location || "").toLowerCase();
      // Empty location → trust the search URL (pass through)
      if (!jobLocLower || jobLocLower === "not listed") {
        const scrapedJob: ScrapedJob = { ...job, logo: "IN", color: BASE_COLOR };
        results.push(scrapedJob);
        onJob(scrapedJob);
        continue;
      }

      const isRemote = jobLocLower.includes("remote") || jobLocLower.includes("anywhere") || jobLocLower.includes("worldwide");
      const matchesRegion = isRemote || regionTerms.some((term) => jobLocLower.includes(term));

      // Also allow generic Gulf terms for Gulf searches
      const isGenericGulf = (jobLocLower.includes("middle east") || jobLocLower.includes("gcc") || jobLocLower.includes("mena"));
      const targetIsGulf = regionTerms.some(t => ["dubai", "uae", "abu dhabi", "saudi", "qatar", "bahrain", "kuwait", "oman", "gulf"].includes(t));

      if (!matchesRegion && !(isGenericGulf && targetIsGulf)) continue; // STRICT reject

      const scrapedJob: ScrapedJob = { ...job, logo: "IN", color: BASE_COLOR };
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
