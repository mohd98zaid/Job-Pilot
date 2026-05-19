// artifacts/api-server/src/services/scrapers/bayt.scraper.ts
// Bayt.com — the #1 job board in Dubai/UAE and the wider Middle East.
// Uses Bayt's public search page (no login required for listings).

import { getBrowser, newStealthContext, humanDelay, humanScroll } from "./browser.js";
import { type ScrapedJob, type SearchOptions, type JobEmitter, type LogEmitter } from "./types.js";
import { buildLocationTerms } from "./relevance.js";
import { logger } from "../../lib/logger.js";

const SOURCE = "Bayt";
const BASE_COLOR = "#e8441c"; // Bayt's brand orange

function dateFilterToDays(dateFilter?: string): number {
  if (!dateFilter) return 7;
  if (dateFilter.includes("24") || dateFilter.includes("1 day")) return 1;
  if (dateFilter.includes("3")) return 3;
  if (dateFilter.includes("7")) return 7;
  if (dateFilter.includes("14")) return 14;
  if (dateFilter.includes("30")) return 30;
  return 7;
}

export async function scrapeBayt(
  opts: SearchOptions,
  onJob: JobEmitter,
  onLog: LogEmitter
): Promise<ScrapedJob[]> {
  const browser = await getBrowser();
  const ctx = await newStealthContext(browser);
  const page = await ctx.newPage();
  const results: ScrapedJob[] = [];

  try {
    onLog("info", `Bayt: searching for "${opts.role}" in "${opts.region}"...`);

    // Bayt uses ?q= for query and &l= for location in their search
    // e.g. https://www.bayt.com/en/uae/jobs/agentic-ai-jobs/
    // Better: use the search endpoint
    const days = dateFilterToDays(opts.dateFilter);
    const searchUrl = `https://www.bayt.com/en/international/jobs/?q=${encodeURIComponent(opts.role)}&l=${encodeURIComponent(opts.region)}&durationSinceCreated=${days}`;

    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 20000 });
    await humanDelay(2000, 3500);
    await humanScroll(page, 4);
    await humanDelay(1000, 2000);

    // Scrape up to 3 pages
    for (let pageNum = 1; pageNum <= 3; pageNum++) {
      const pageJobs = await page.evaluate((args: { source: string; pageNum: number }) => {
        const cards = document.querySelectorAll(
          "[class*='job-card'], [class*='media-list-item'], li[data-job-id], .has-pointer-d"
        );
        const extracted: any[] = [];

        cards.forEach((card) => {
          try {
            const titleEl = card.querySelector(
              "h2.t-default a, [class*='job-title'] a, .jb-header a, h2 a"
            );
            const companyEl = card.querySelector(
              "[class*='t-mute'], [class*='company'], span.jb-company, b.t-default"
            );
            const locationEl = card.querySelector(
              "[class*='location'], [class*='jb-loc'], span[class*='prm-wr']"
            );
            const salaryEl = card.querySelector("[class*='salary'], [class*='jb-sal']");
            const dateEl = card.querySelector("[class*='date'], time, [class*='t-mute']:last-child");

            const titleText = titleEl?.textContent?.trim();
            const href = (titleEl as HTMLAnchorElement)?.href || "";
            const company = companyEl?.textContent?.trim();

            if (titleText && href) {
              extracted.push({
                title: titleText,
                company: company || "Unknown",
                location: locationEl?.textContent?.trim() || "",
                salary: salaryEl?.textContent?.trim() || "Not listed",
                url: href.startsWith("http") ? href : `https://www.bayt.com${href}`,
                postedAt: dateEl?.textContent?.trim(),
                source: args.source,
                externalId: `bayt-${href.split("/").filter(Boolean).pop() || Date.now()}`,
              });
            }
          } catch (_) {}
        });

        return extracted;
      }, { source: SOURCE, pageNum });

      const regionTerms = buildLocationTerms(opts.region.toLowerCase());

      for (const job of pageJobs) {
        const locLower = (job.location || "").toLowerCase();
        const isRemote = locLower.includes("remote") || locLower.includes("anywhere") || locLower.includes("worldwide");
        const matchesRegion = isRemote || 
          locLower === "" || 
          regionTerms.some((term) => locLower.includes(term)) ||
          locLower.includes("middle east") || locLower.includes("gcc") || locLower.includes("mena");

        if (!matchesRegion) continue;

        // Use relaxed relevance check for Bayt — the search URL already filtered by role,
        // so we only need to verify the title is somewhat related (not an exact keyword match)
        const titleLower = job.title.toLowerCase();
        const roleWords = opts.role.toLowerCase().split(/\s+/).filter(w => w.length > 2);
        const allAliases = [...(opts.aliases || []), opts.role];
        
        // Accept if title contains ANY of the role keywords or aliases
        const isRelevant = roleWords.some(w => titleLower.includes(w)) ||
          allAliases.some(alias => titleLower.includes(alias.toLowerCase())) ||
          titleLower.includes("ai") || titleLower.includes("engineer") || titleLower.includes("developer");

        if (!isRelevant) continue;

        const scrapedJob: ScrapedJob = { ...job, logo: "BY", color: BASE_COLOR };
        results.push(scrapedJob);
        onJob(scrapedJob);
      }

      onLog("info", `Bayt: page ${pageNum} — ${pageJobs.length} jobs found`);

      // Check for next page
      if (pageNum < 3) {
        const nextBtn = await page.$("a[rel='next'], .pager-next a, [class*='next'] a");
        if (!nextBtn) break;

        // Wait for any loading overlay to disappear before clicking
        await page.waitForSelector("[class*='is-loading']", { state: "hidden", timeout: 10000 }).catch(() => {});
        await page.waitForSelector("[data-bayt-loader]", { state: "hidden", timeout: 5000 }).catch(() => {});
        
        // Scroll the next button into view and use force click to bypass intercepting elements
        try {
          await nextBtn.scrollIntoViewIfNeeded();
          await humanDelay(500, 1000);
          await nextBtn.click({ force: true, timeout: 10000 });
        } catch {
          // If click still fails, try navigating directly via href
          const href = await nextBtn.getAttribute("href").catch(() => null);
          if (href) {
            const nextUrl = href.startsWith("http") ? href : `https://www.bayt.com${href}`;
            await page.goto(nextUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
          } else break;
        }
        
        await humanDelay(2000, 3500);
        await humanScroll(page, 3);
      }
    }

    onLog("success", `Bayt: found ${results.length} listings`);
  } catch (err: any) {
    onLog("error", `Bayt error: ${err.message}`);
    logger.error({ err }, "Bayt scraper failed");
  } finally {
    await page.close().catch(() => {});
    await ctx.close().catch(() => {});
  }

  return results;
}
