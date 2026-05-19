// artifacts/api-server/src/services/scrapers/linkedin-guest.scraper.ts
// Uses LinkedIn's public guest JSON API — no login, no Playwright required.
// This is the same endpoint LinkedIn uses on its public job listing pages.

import { type ScrapedJob, type SearchOptions, type JobEmitter, type LogEmitter } from "./types.js";
import { logger } from "../../lib/logger.js";

const SOURCE = "LinkedIn";
const BASE_COLOR = "#0A66C2";

function toTimeParam(dateFilter?: string): string {
  if (!dateFilter) return "r604800"; // default: 7 days
  if (dateFilter.includes("24")) return "r86400";
  if (dateFilter.includes("7")) return "r604800";
  if (dateFilter.includes("14")) return "r1209600";
  if (dateFilter.includes("30")) return "r2592000";
  return "r604800";
}

interface LinkedInGuestJob {
  title?: string;
  companyName?: string;
  location?: string;
  listedAt?: number;
  jobState?: string;
  entityUrn?: string;
  trackingUrn?: string;
}

export async function scrapeLinkedInGuest(
  opts: SearchOptions,
  onJob: JobEmitter,
  onLog: LogEmitter
): Promise<ScrapedJob[]> {
  const results: ScrapedJob[] = [];
  const tpr = toTimeParam(opts.dateFilter);
  const seen = new Set<string>();

  try {
    onLog("info", `LinkedIn (guest API): searching for "${opts.role}" in "${opts.region}"...`);

    const maxPages = 5;   // 5 pages × 25 results = up to 125 candidates
    const pageSize = 25;
    let consecutiveEmpty = 0;

    for (let page = 0; page < maxPages; page++) {
      const start = page * pageSize;

      // LinkedIn guest API — two endpoints (try both for resilience)
      const primaryUrl =
        `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search` +
        `?keywords=${encodeURIComponent(opts.role)}` +
        `&location=${encodeURIComponent(opts.region)}` +
        `&f_TPR=${tpr}` +
        `&f_JT=F,P,C` + // Full-time, Part-time, Contract
        `&start=${start}`;

      let res = await fetch(primaryUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml",
          "Accept-Language": "en-US,en;q=0.9",
          "Referer": "https://www.linkedin.com/jobs/search/",
          "X-Li-Lang": "en_US",
          "X-Requested-With": "XMLHttpRequest",
        },
      });

      if (res.status === 429) {
        onLog("info", `LinkedIn guest: rate limited on page ${page + 1} — waiting 3s then retrying once`);
        await new Promise((r) => setTimeout(r, 3000));
        res = await fetch(primaryUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
        if (res.status === 429) { onLog("info", "LinkedIn guest: still rate limited — stopping"); break; }
      }

      if (!res.ok) {
        // Try without job type filter as fallback
        if (page === 0) {
          const fallbackUrl =
            `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search` +
            `?keywords=${encodeURIComponent(opts.role)}` +
            `&location=${encodeURIComponent(opts.region)}` +
            `&f_TPR=${tpr}` +
            `&start=${start}`;
          res = await fetch(fallbackUrl, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
              "Accept": "text/html,application/xhtml+xml",
              "Accept-Language": "en-US,en;q=0.9",
            },
          });
          if (!res.ok) {
            onLog("error", `LinkedIn guest: HTTP ${res.status} on page ${page + 1}`);
            break;
          }
        } else {
          onLog("error", `LinkedIn guest: HTTP ${res.status} on page ${page + 1}`);
          break;
        }
      }

      const html = await res.text();

      // Parse job cards card-by-card (not via global regex arrays)
      let extracted = parseLinkedInHtml(html, opts.region);

      // If primary parser found nothing, try alternative extraction
      if (extracted.length === 0 && html.length > 200) {
        extracted = parseLinkedInHtmlFallback(html, opts.region);
      }

      if (extracted.length === 0) {
        consecutiveEmpty++;
        if (consecutiveEmpty >= 2) break; // Stop if two pages in a row are empty
        continue;
      }
      consecutiveEmpty = 0;

      for (const job of extracted) {
        if (seen.has(job.externalId || job.url)) continue;
        seen.add(job.externalId || job.url);

        // LinkedIn's search already filtered by keywords, so use relaxed relevance.
        // Only reject if the title is completely unrelated.
        const titleLower = job.title.toLowerCase();
        const roleWords = opts.role.toLowerCase().split(/\s+/).filter(w => w.length > 2);
        const allTerms = [...roleWords, ...(opts.aliases || []).map(a => a.toLowerCase())];
        
        const isRelevant = allTerms.some(term => titleLower.includes(term)) ||
          titleLower.includes("ai") || titleLower.includes("engineer") ||
          titleLower.includes("developer") || titleLower.includes("architect") ||
          titleLower.includes("scientist") || titleLower.includes("machine learning");

        if (!isRelevant) continue;

        results.push(job);
        onJob(job);
      }

      // Respectful delay (800–1500ms)
      await new Promise((r) => setTimeout(r, 800 + Math.random() * 700));
    }

    onLog("success", `LinkedIn (guest): found ${results.length} listings`);
  } catch (err: any) {
    onLog("error", `LinkedIn guest error: ${err.message}`);
    logger.error({ err }, "LinkedIn guest scraper failed");
  }

  return results;
}

/**
 * Parse LinkedIn's server-rendered HTML fragments (returned by the guest API).
 * Parses CARD-BY-CARD to prevent array misalignment from missing fields in some cards.
 * Handles multiple LinkedIn HTML layouts (they A/B test frequently).
 */
function parseLinkedInHtml(html: string, defaultRegion: string): ScrapedJob[] {
  const jobs: ScrapedJob[] = [];

  // If the response is empty or too short, bail early
  if (!html || html.length < 100) return jobs;

  // Split HTML into individual job cards using the data-entity-urn boundary
  // LinkedIn wraps each job in a <li> or <div class="base-card">
  // We split on job card boundaries then extract from each chunk independently
  const cardBoundary = html.split(/(?=<(?:li|div)[^>]*(?:class="[^"]*base-card[^"]*"|data-entity-urn|class="[^"]*job-search-card[^"]*"))/i);

  for (const chunk of cardBoundary) {
    // Skip header/footer chunks that don't contain job data
    if (!chunk.includes("base-search-card__title") && 
        !chunk.includes("data-entity-urn") &&
        !chunk.includes("job-search-card__title") &&
        !chunk.includes("base-card__full-link")) continue;

    // Extract each field from within this single card chunk — try multiple selector patterns
    const titleMatch = chunk.match(/<h3[^>]*class="[^"]*(?:base-search-card__title|job-search-card__title)[^"]*"[^>]*>\s*([\s\S]*?)\s*<\/h3>/) ||
                       chunk.match(/<span[^>]*class="[^"]*sr-only[^"]*"[^>]*>\s*([\s\S]*?)\s*<\/span>/);
    
    const companyMatch = chunk.match(/<h4[^>]*class="[^"]*base-search-card__subtitle[^"]*"[^>]*>[\s\S]*?<a[^>]*>\s*([\s\S]*?)\s*<\/a>/) ||
                         chunk.match(/<a[^>]*class="[^"]*hidden-nested-link[^"]*"[^>]*>\s*([\s\S]*?)\s*<\/a>/) ||
                         chunk.match(/<h4[^>]*class="[^"]*base-search-card__subtitle[^"]*"[^>]*>\s*([\s\S]*?)\s*<\/h4>/);
    
    const locationMatch = chunk.match(/<span[^>]*class="[^"]*job-search-card__location[^"]*"[^>]*>\s*([\s\S]*?)\s*<\/span>/) ||
                          chunk.match(/<span[^>]*class="[^"]*base-search-card__metadata[^"]*"[^>]*>\s*([\s\S]*?)\s*<\/span>/);
    
    const linkMatch = chunk.match(/href="(https:\/\/[^"]*linkedin\.com\/jobs\/view\/[^"]*)"/) ||
                      chunk.match(/href="(\/jobs\/view\/[^"]*)"/);
    
    const timeMatch = chunk.match(/<time[^>]*datetime="([^"]*)"/);
    const jobIdMatch = chunk.match(/data-entity-urn="urn:li:jobPosting:(\d+)"/) ||
                       chunk.match(/\/jobs\/view\/[^"]*?(\d{8,})/) ||
                       chunk.match(/data-tracking-id="([^"]+)"/);
    const listDateMatch = chunk.match(/job-search-card__listdate[^>]*>\s*([\s\S]*?)\s*<\/time>/);

    const title = titleMatch ? cleanHtml(titleMatch[1]) : "";
    const company = companyMatch ? cleanHtml(companyMatch[1]) : "";

    if (!title || !company) continue;

    const jobId = jobIdMatch?.[1];
    let url = linkMatch?.[1] || "";
    if (url && !url.startsWith("http")) url = `https://www.linkedin.com${url}`;
    url = url.split("?")[0]; // Remove tracking params
    if (!url && jobId) url = `https://www.linkedin.com/jobs/view/${jobId}`;

    if (!url) continue;

    const location = locationMatch ? cleanHtml(locationMatch[1]) : defaultRegion;
    const postedAt = timeMatch?.[1] || listDateMatch?.[1];

    jobs.push({
      title,
      company,
      location,
      salary: "Not listed",
      url,
      postedAt,
      source: SOURCE,
      externalId: jobId ? `li-${jobId}` : url,
      logo: "LI",
      color: BASE_COLOR,
    });
  }

  return jobs;
}

function cleanHtml(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Fallback LinkedIn HTML parser — handles cases where the primary parser's
 * selectors don't match (LinkedIn frequently changes their HTML structure).
 * Uses more generic patterns to extract job data.
 */
function parseLinkedInHtmlFallback(html: string, defaultRegion: string): ScrapedJob[] {
  const jobs: ScrapedJob[] = [];

  // Strategy 1: Extract all LinkedIn job view links and their surrounding context
  const linkRe = /href="(https?:\/\/[^"]*linkedin\.com\/jobs\/view\/[^"]*)"/g;
  const allLinks: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(html))) {
    const url = m[1].split("?")[0];
    if (!allLinks.includes(url)) allLinks.push(url);
  }

  // Strategy 2: Try to extract structured data from JSON-LD if present
  const ldRe = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi;
  while ((m = ldRe.exec(html))) {
    try {
      const d = JSON.parse(m[1]);
      if (d["@type"] === "JobPosting") {
        jobs.push({
          title: d.title || "",
          company: d.hiringOrganization?.name || "Unknown",
          location: d.jobLocation?.address?.addressLocality || defaultRegion,
          salary: "Not listed",
          url: d.url || allLinks[0] || "",
          postedAt: d.datePosted,
          source: SOURCE,
          externalId: `li-${d.identifier?.value || d.url || Date.now()}`,
          logo: "LI",
          color: BASE_COLOR,
        });
      }
    } catch { /* ignore */ }
  }

  if (jobs.length > 0) return jobs;

  // Strategy 3: Generic card extraction — look for any element with job title + link patterns
  // LinkedIn's guest API returns <li> elements with job data
  const cardRe = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  while ((m = cardRe.exec(html))) {
    const card = m[1];
    // Must contain a LinkedIn jobs link
    const cardLinkMatch = card.match(/href="(https?:\/\/[^"]*linkedin\.com\/jobs\/view\/[^"]*)"/);
    if (!cardLinkMatch) continue;

    // Extract title — look for any heading or strong text
    const titleMatch = card.match(/<(?:h[1-6]|strong|span)[^>]*>\s*([^<]{5,100})\s*<\/(?:h[1-6]|strong|span)>/);
    // Extract company — usually in a smaller text element after the title
    const companyMatch = card.match(/<(?:h4|span|a)[^>]*>\s*([^<]{2,60})\s*<\/(?:h4|span|a)>/);
    // Extract location
    const locMatch = card.match(/(?:location|loc)[^>]*>\s*([^<]{3,50})\s*</i);

    const title = titleMatch ? cleanHtml(titleMatch[1]) : "";
    if (!title || title.length < 3) continue;

    const url = cardLinkMatch[1].split("?")[0];
    const jobIdMatch = url.match(/\/view\/[^/]*?(\d{8,})/);

    jobs.push({
      title,
      company: companyMatch ? cleanHtml(companyMatch[1]) : "Unknown",
      location: locMatch ? cleanHtml(locMatch[1]) : defaultRegion,
      salary: "Not listed",
      url,
      source: SOURCE,
      externalId: jobIdMatch ? `li-${jobIdMatch[1]}` : url,
      logo: "LI",
      color: BASE_COLOR,
    });
  }

  return jobs;
}
