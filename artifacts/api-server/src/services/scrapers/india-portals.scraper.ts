// india-portals.scraper.ts
// Scrapes all major Indian job portals via their JSON/AJAX APIs.
// Portals: Naukri · TimesJobs · Shine · Foundit(Monster) · Hirist · iimjobs · Cutshort · Instahyre · Hirect

import { type ScrapedJob, type SearchOptions, type JobEmitter, type LogEmitter } from "./types.js";
import { isJobRelevant } from "./relevance.js";
import { logger } from "../../lib/logger.js";

const SOURCE_PREFIX = "India";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0";
const TIMEOUT = 15000;
const SAFETY_CAP = 50;        // Never exceed 50 pages per portal (prevents infinite loops)
const PAGE_DELAY_MS = 500;    // Polite delay between pages

async function safeFetch(url: string, init?: RequestInit): Promise<Response | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const r = await fetch(url, { ...init, signal: ctrl.signal });
    clearTimeout(t); return r;
  } catch { clearTimeout(t); return null; }
}

function delay(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// ── Naukri.com ───────────────────────────────────────────────────────────────
async function scrapeNaukriPortal(role: string, region: string, onLog: LogEmitter): Promise<Partial<ScrapedJob & { source: string }>[]> {
  const results: any[] = [];
  const seen = new Set<string>();
  const regionSlug = region.toLowerCase().replace(/[\s/,]+/g, "-").replace(/[^a-z0-9-]/g, "");
  const roleSlug = role.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  let totalAvailable = Infinity;

  for (let page = 1; page <= SAFETY_CAP; page++) {
    const url = `https://www.naukri.com/jobapi/v3/search?noOfResults=20&urlType=search_by_keyword&searchType=adv&keyword=${encodeURIComponent(role)}&location=${encodeURIComponent(region)}&pageNo=${page}&sort=1&seoKey=${roleSlug}-jobs-in-${regionSlug}`;
    const res = await safeFetch(url, {
      headers: { "User-Agent": UA, "Accept": "application/json", "systemid": "Naukri", "appid": "109", "Referer": "https://www.naukri.com/" }
    });
    if (!res?.ok) break;
    let data: any; try { data = await res.json(); } catch { break; }
    const jobs: any[] = data?.jobDetails || [];
    if (!jobs.length) break;

    // Read total from first page
    if (page === 1) totalAvailable = data?.noOfJobs || data?.totalCount || Infinity;
    const fetched = (page - 1) * 20 + jobs.length;

    let newOnPage = 0;
    for (const j of jobs) {
      if (seen.has(j.jobId)) continue;
      seen.add(j.jobId);
      newOnPage++;
      results.push({
        title: j.title,
        company: j.companyName,
        location: j.placeholders?.find((p: any) => p.type === "location")?.label || region,
        salary: j.placeholders?.find((p: any) => p.type === "salary")?.label || "Not disclosed",
        description: j.jobDescription?.substring(0, 400),
        url: j.jdURL?.startsWith("http") ? j.jdURL : `https://www.naukri.com${j.jdURL || ""}`,
        externalId: `naukri-${j.jobId}`,
        postedAt: j.footerPlaceholderLabel,
        source: "Naukri",
      });
    }
    if (newOnPage === 0 || fetched >= totalAvailable) break;
    await delay(PAGE_DELAY_MS);
  }
  return results;
}

// ── TimesJobs ────────────────────────────────────────────────────────────────
async function scrapeTimesJobs(role: string, region: string, onLog: LogEmitter): Promise<any[]> {
  const results: any[] = [];
  const seen = new Set<string>();
  let page = 1;

  while (page <= SAFETY_CAP) {
    const url = `https://www.timesjobs.com/candidate/jobsearchresult.html?searchType=personalizedSearch&from=submit&txtKeywords=${encodeURIComponent(role)}&txtLocation=${encodeURIComponent(region)}&pDate=I&sequence=${page}&startPage=${page}`;
    const res = await safeFetch(url, { headers: { "User-Agent": UA, "Accept": "text/html" } });
    if (!res?.ok) break;
    const html = await res.text();

    const jsonMatch = html.match(/window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?});\s*<\/script>/);
    if (jsonMatch) {
      try {
        const state = JSON.parse(jsonMatch[1]);
        const jobs: any[] = state?.jobSearch?.jobDetails || state?.jobs || [];
        if (!jobs.length) break;
        let newOnPage = 0;
        for (const j of jobs) {
          const id = String(j.jobId || j.id || j.jobTitle);
          if (seen.has(id)) continue;
          seen.add(id); newOnPage++;
          results.push({ title: j.jobTitle || j.title, company: j.companyName || j.company, location: j.locationList?.join(", ") || j.location || region, salary: j.packageLakh || "Not disclosed", url: j.jdURL || `https://www.timesjobs.com/job-detail/${j.jobId}`, externalId: `tj-${id}`, source: "TimesJobs" });
        }
        if (newOnPage === 0) break;
        await delay(PAGE_DELAY_MS); page++; continue;
      } catch { break; }
    }

    const jobRe = /data-job-id="(\d+)"[\s\S]*?class="[^"]*jobTit[^"]*"[^>]*><[^>]*>([^<]+)<[\s\S]*?class="[^"]*companyInfo[^"]*"[^>]*>([^<]+)</gi;
    let m: RegExpExecArray | null; let found = 0;
    while ((m = jobRe.exec(html))) {
      if (seen.has(m[1])) continue;
      seen.add(m[1]); found++;
      results.push({ title: m[2].trim(), company: m[3].trim(), location: region, url: `https://www.timesjobs.com/job-detail/${m[1]}`, externalId: `tj-${m[1]}`, source: "TimesJobs" });
    }
    if (!found) break;
    await delay(PAGE_DELAY_MS);
    page++;
  }
  return results;
}

// ── Shine.com ────────────────────────────────────────────────────────────────
async function scrapeShine(role: string, region: string): Promise<any[]> {
  const results: any[] = [];
  const seen = new Set<string>();

  for (let page = 1; page <= SAFETY_CAP; page++) {
    const url = `https://www.shine.com/api/v3/search/?q=${encodeURIComponent(role)}&l=${encodeURIComponent(region)}&page=${page}&limit=20&sort=-published_date`;
    const res = await safeFetch(url, { headers: { "User-Agent": UA, "Accept": "application/json", "Referer": "https://www.shine.com/" } });
    if (!res?.ok) break;
    let data: any; try { data = await res.json(); } catch { break; }
    const jobs: any[] = data?.result_list || data?.results || [];
    if (!jobs.length) break;

    let newOnPage = 0;
    for (const j of jobs) {
      const id = String(j.job_id || j.id);
      if (seen.has(id)) continue;
      seen.add(id); newOnPage++;
      results.push({ title: j.designation || j.title, company: j.company_name || j.employer, location: j.location_list?.join(", ") || j.location || region, salary: j.salary_text || "Not disclosed", url: j.job_url || `https://www.shine.com/job-search/${id}/`, externalId: `shine-${id}`, description: j.description?.substring(0, 400), source: "Shine" });
    }
    if (newOnPage === 0) break;
    await delay(PAGE_DELAY_MS);
  }
  return results;
}

// ── Foundit (Monster India) ──────────────────────────────────────────────────
async function scrapeFoundit(role: string, region: string): Promise<any[]> {
  const results: any[] = [];
  const seen = new Set<string>();

  for (let page = 1; page <= SAFETY_CAP; page++) {
    const url = `https://www.foundit.in/srp/results?query=${encodeURIComponent(role)}&location=${encodeURIComponent(region)}&experienceRanges=0~50&sort=1&start=${(page - 1) * 15}`;
    const res = await safeFetch(url, { headers: { "User-Agent": UA, "Accept": "text/html", "Referer": "https://www.foundit.in/" } });
    if (!res?.ok) break;
    const html = await res.text();

    const jsonMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>({[\s\S]*?})<\/script>/);
    if (!jsonMatch) break;
    try {
      const d = JSON.parse(jsonMatch[1]);
      const jobs: any[] = d?.props?.pageProps?.searchResult?.jobList || [];
      if (!jobs.length) break;
      let newOnPage = 0;
      for (const j of jobs) {
        const id = String(j.id || j.jobId);
        if (seen.has(id)) continue;
        seen.add(id); newOnPage++;
        results.push({ title: j.title, company: j.company?.name || "Unknown", location: j.locations?.join(", ") || region, salary: j.salary || "Not disclosed", url: `https://www.foundit.in/job/${id}`, externalId: `foundit-${id}`, description: j.snippets?.join(" ").substring(0, 400), source: "Foundit" });
      }
      if (newOnPage === 0) break;
    } catch { break; }
    await delay(PAGE_DELAY_MS);
  }
  return results;
}

// ── Hirist.tech (Tech jobs India) ────────────────────────────────────────────
async function scrapeHirist(role: string, region: string): Promise<any[]> {
  const results: any[] = [];
  const url = `https://api.hirist.tech/v1/jobs/search?query=${encodeURIComponent(role)}&location=${encodeURIComponent(region)}&limit=50&offset=0`;
  const res = await safeFetch(url, { headers: { "User-Agent": UA, "Accept": "application/json" } });
  if (!res?.ok) return [];
  let data: any; try { data = await res.json(); } catch { return []; }

  for (const j of (data?.jobs || data?.data || [])) {
    results.push({
      title: j.designation || j.title,
      company: j.company?.name || j.company_name || "Unknown",
      location: j.location || region,
      salary: j.salary || "Not disclosed",
      url: j.url || `https://www.hirist.tech/j/${j.id}`,
      externalId: `hirist-${j.id}`,
      source: "Hirist",
    });
  }
  return results;
}

// ── iimjobs.com (Management/Executive) ──────────────────────────────────────
async function scrapeIimjobs(role: string, region: string): Promise<any[]> {
  const results: any[] = [];
  const seen = new Set<string>();

  for (let page = 1; page <= SAFETY_CAP; page++) {
    const url = `https://api.iimjobs.com/v1/jobs/search?q=${encodeURIComponent(role)}&location=${encodeURIComponent(region)}&page=${page}`;
    const res = await safeFetch(url, { headers: { "User-Agent": UA, "Accept": "application/json", "Referer": "https://www.iimjobs.com/" } });
    if (!res?.ok) break;
    let data: any; try { data = await res.json(); } catch { break; }
    const jobs = data?.jobs || data?.data || [];
    if (!jobs.length) break;
    let newOnPage = 0;
    for (const j of jobs) {
      const id = String(j.id || j.jobId);
      if (seen.has(id)) continue;
      seen.add(id); newOnPage++;
      results.push({ title: j.title || j.jobTitle, company: j.company || j.companyName || "Unknown", location: j.location || region, salary: j.salary || "Not disclosed", url: j.url || `https://www.iimjobs.com/j/${id}`, externalId: `iimjobs-${id}`, source: "iimjobs" });
    }
    if (newOnPage === 0) break;
    await delay(PAGE_DELAY_MS);
  }
  return results;
}

// ── Cutshort.io ──────────────────────────────────────────────────────────────
async function scrapeCutshort(role: string, region: string): Promise<any[]> {
  const res = await safeFetch("https://cutshort.io/api/jobs/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": UA, "Referer": "https://cutshort.io/" },
    body: JSON.stringify({ query: role, location: region, limit: 30, offset: 0 }),
  });
  if (!res?.ok) return [];
  let data: any; try { data = await res.json(); } catch { return []; }
  return (data?.jobs || []).map((j: any) => ({
    title: j.title,
    company: j.company?.name || "Unknown",
    location: j.location || region,
    salary: j.salary ? `${j.salary.min}-${j.salary.max} LPA` : "Not disclosed",
    url: `https://cutshort.io/job/${j.slug || j.id}`,
    externalId: `cs-${j.id}`,
    source: "Cutshort",
  }));
}

// ── Main India portals orchestrator ──────────────────────────────────────────
export async function scrapeIndiaPortals(
  opts: SearchOptions,
  onJob: JobEmitter,
  onLog: LogEmitter
): Promise<ScrapedJob[]> {
  const { role, region, aliases = [], exclusions = [] } = opts;
  const results: ScrapedJob[] = [];

  const portals = [
    { name: "Naukri",    fn: () => scrapeNaukriPortal(role, region, onLog), color: "#ff7555" },
    { name: "TimesJobs", fn: () => scrapeTimesJobs(role, region, onLog),    color: "#C0392B" },
    { name: "Shine",     fn: () => scrapeShine(role, region),               color: "#F39C12" },
    { name: "Foundit",   fn: () => scrapeFoundit(role, region),             color: "#8E44AD" },
    { name: "Hirist",    fn: () => scrapeHirist(role, region),              color: "#2ECC71" },
    { name: "iimjobs",   fn: () => scrapeIimjobs(role, region),             color: "#2C3E50" },
    { name: "Cutshort",  fn: () => scrapeCutshort(role, region),            color: "#E74C3C" },
  ];

  onLog("info", `India Portals: searching ${portals.length} boards for "${role}" in "${region}"...`);

  await Promise.allSettled(portals.map(async (portal) => {
    try {
      const raw = await portal.fn();
      let hits = 0;
      for (const r of raw) {
        if (!r.title) continue;
        if (!isJobRelevant(r.title, r.description || "", [`loc:${r.location || ""}`], role, aliases, exclusions, region)) continue;
        const job: ScrapedJob = {
          title: r.title,
          company: r.company || "Unknown",
          location: r.location || region,
          salary: r.salary || "Not disclosed",
          description: r.description,
          url: r.url || "",
          postedAt: r.postedAt,
          source: r.source || portal.name,
          externalId: r.externalId || `${portal.name}-${r.title}-${Date.now()}`,
          logo: portal.name.substring(0, 2).toUpperCase(),
          color: portal.color,
        };
        results.push(job);
        onJob(job);
        hits++;
      }
      if (hits > 0) onLog("success", `${portal.name}: ${hits} listing(s)`);
      else onLog("info", `${portal.name}: 0 matching results`);
    } catch (err: any) {
      logger.warn({ portal: portal.name, err: err.message }, "India portal failed");
      onLog("error", `${portal.name}: ${err.message}`);
    }
  }));

  onLog("success", `India Portals: ${results.length} total listings`);
  return results;
}
