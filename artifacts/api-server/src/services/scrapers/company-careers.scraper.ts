// company-careers.scraper.ts
// Multi-ATS company career portal scraper.
// Supports: Workday · Greenhouse · Lever · Amazon Jobs · SmartRecruiters · HTML fallback

import { type ScrapedJob, type SearchOptions, type JobEmitter, type LogEmitter } from "./types.js";
import { isJobRelevant } from "./relevance.js";
import { logger } from "../../lib/logger.js";
import { COMPANY_REGISTRY, type Company } from "./company-registry.js";

const SOURCE = "Company Careers";
const TIMEOUT = 12000;

// ── Fetch wrapper ─────────────────────────────────────────────────────────────
async function safeFetch(url: string, init?: RequestInit): Promise<Response | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    clearTimeout(t);
    return res;
  } catch { clearTimeout(t); return null; }
}

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0";
const JSON_HDR = { "Accept": "application/json", "User-Agent": UA };

// ── ATS scrapers ──────────────────────────────────────────────────────────────

async function scrapeWorkday(c: Company, role: string): Promise<Partial<ScrapedJob>[]> {
  const { workdayTenant: t, workdaySite: s } = c;
  if (!t || !s) return [];
  const url = `https://${t}.wd5.myworkdayjobs.com/wday/cxs/${t}/${s}/jobs`;
  const res = await safeFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": UA, "Referer": `https://${t}.wd5.myworkdayjobs.com/` },
    body: JSON.stringify({ searchText: role, limit: 20, offset: 0, appliedFacets: {} }),
  });
  if (!res?.ok) return [];
  let data: any; try { data = await res.json(); } catch { return []; }
  return (data?.jobPostings || []).map((p: any) => ({
    title: p.title,
    location: p.locationsText || p.location || "",
    url: p.externalPath
      ? `https://${t}.wd5.myworkdayjobs.com${p.externalPath}`
      : `https://${t}.wd5.myworkdayjobs.com/en-US/${s}/job/${p.externalId || ""}`,
    externalId: `wd-${t}-${p.externalId || p.title}`,
    description: p.jobDescription?.substring(0, 300),
  }));
}

async function scrapeGreenhouse(c: Company, role: string): Promise<Partial<ScrapedJob>[]> {
  if (!c.boardToken) return [];
  const res = await safeFetch(`https://boards-api.greenhouse.io/v1/boards/${c.boardToken}/jobs?content=true`, { headers: JSON_HDR });
  if (!res?.ok) return [];
  let data: any; try { data = await res.json(); } catch { return []; }
  const rw = role.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  return (data?.jobs || [])
    .filter((j: any) => rw.some(w => (j.title || "").toLowerCase().includes(w)))
    .map((j: any) => ({
      title: j.title,
      location: j.location?.name || "",
      url: j.absolute_url || `https://boards.greenhouse.io/${c.boardToken}/jobs/${j.id}`,
      externalId: `gh-${c.boardToken}-${j.id}`,
      description: j.content?.replace(/<[^>]*>/g, "").substring(0, 300),
    }));
}

async function scrapeLever(c: Company, role: string): Promise<Partial<ScrapedJob>[]> {
  if (!c.boardToken) return [];
  const res = await safeFetch(`https://api.lever.co/v0/postings/${c.boardToken}?mode=json&limit=250`, { headers: JSON_HDR });
  if (!res?.ok) return [];
  let jobs: any[]; try { jobs = await res.json(); } catch { return []; }
  if (!Array.isArray(jobs)) return [];
  const rw = role.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  return jobs
    .filter(j => rw.some(w => (j.text || "").toLowerCase().includes(w)))
    .map(j => ({
      title: j.text,
      location: j.categories?.location || "",
      url: j.hostedUrl,
      externalId: `lv-${c.boardToken}-${j.id}`,
      description: j.descriptionPlain?.substring(0, 300),
    }));
}

async function scrapeAmazon(role: string, region: string): Promise<Partial<ScrapedJob>[]> {
  const loc = region.toLowerCase().includes("dubai") || region.toLowerCase().includes("uae") ? "Dubai" : region;
  const res = await safeFetch(
    `https://www.amazon.jobs/en/search.json?query=${encodeURIComponent(role)}&location[]=${encodeURIComponent(loc)}&radius=24km&result_limit=20&sort=recent`,
    { headers: { ...JSON_HDR, "X-Requested-With": "XMLHttpRequest", "Referer": "https://www.amazon.jobs/en/search" } }
  );
  if (!res?.ok) return [];
  let data: any; try { data = await res.json(); } catch { return []; }
  return (data?.jobs || []).map((j: any) => ({
    title: j.title,
    location: j.location || "",
    url: `https://www.amazon.jobs${j.job_path}`,
    externalId: `amz-${j.id}`,
    description: j.description_short,
    postedAt: j.posted_date,
  }));
}

async function scrapeSmartRecruiters(c: Company, role: string): Promise<Partial<ScrapedJob>[]> {
  if (!c.srCompanyId) return [];
  const res = await safeFetch(
    `https://api.smartrecruiters.com/v1/companies/${c.srCompanyId}/postings?q=${encodeURIComponent(role)}&limit=20&status=PUBLISHED`,
    { headers: JSON_HDR }
  );
  if (!res?.ok) return [];
  let data: any; try { data = await res.json(); } catch { return []; }
  return (data?.content || []).map((j: any) => ({
    title: j.name,
    location: j.location?.city ? `${j.location.city}, ${j.location.country || ""}` : "",
    url: j.ref || `https://jobs.smartrecruiters.com/${c.srCompanyId}/${j.id}`,
    externalId: `sr-${c.srCompanyId}-${j.id}`,
  }));
}

/** Lightweight HTML fetch — tries to extract job data from JSON embedded in script tags or plain HTML */
async function scrapeCareersUrl(c: Company, role: string): Promise<Partial<ScrapedJob>[]> {
  if (!c.careersUrl) return [];
  const res = await safeFetch(c.careersUrl, { headers: { "User-Agent": UA, "Accept": "text/html" } });
  if (!res?.ok) return [];
  const html = await res.text();

  // Try JSON-LD or __NEXT_DATA__ / window.__data__ embedded job listings
  const jsonMatches = html.match(/(?:window\.__(?:INITIAL|NEXT)_(?:STATE|DATA)__|application\/ld\+json)[^{]*({[\s\S]*?})\s*(?:<\/script>|;)/);
  if (jsonMatches) {
    try {
      const parsed = JSON.parse(jsonMatches[1]);
      const candidates: any[] = parsed?.jobs || parsed?.jobList || parsed?.props?.pageProps?.jobs
        || (Array.isArray(parsed) ? parsed : []);
      const rw = role.toLowerCase().split(/\s+/).filter(w => w.length > 2);
      return candidates
        .filter(j => rw.some(w => ((j.title || j.jobTitle || "")).toLowerCase().includes(w)))
        .slice(0, 20)
        .map(j => ({
          title: j.title || j.jobTitle,
          location: j.location || j.city || "",
          url: j.url || j.applyUrl || j.jobUrl || c.careersUrl!,
          externalId: `cu-${c.name}-${j.id || j.jobId || Math.random()}`,
        }));
    } catch { /* fall through */ }
  }

  // Regex fallback: find links that look like job postings
  const rw = role.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const linkRe = /href="([^"]*(?:job|career|position|opening|vacancy)[^"]*)"[^>]*>([^<]{5,100})</gi;
  const out: Partial<ScrapedJob>[] = [];
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(html)) && out.length < 15) {
    const title = m[2].trim();
    if (rw.some(w => title.toLowerCase().includes(w))) {
      const href = m[1].startsWith("http") ? m[1] : new URL(m[1], c.careersUrl).href;
      out.push({ title, location: "", url: href, externalId: `cu-${c.name}-${href}` });
    }
  }
  return out;
}

// ── Region helpers ─────────────────────────────────────────────────────────────

function companyMatchesRegion(c: Company, region: string): boolean {
  const r = region.toLowerCase();
  const isGulf = ["dubai","uae","abu dhabi","sharjah","qatar","saudi","riyadh","bahrain","kuwait","oman"].some(g => r.includes(g));
  const isIndia = ["india","bangalore","mumbai","delhi","hyderabad","pune","chennai","kolkata"].some(g => r.includes(g));

  if (!c.regions || c.regions.includes("global")) return true;
  if (isGulf && c.regions.includes("gcc")) return true;
  if (isIndia && c.regions.includes("india")) return true;
  // If region is neither India nor Gulf, include global companies only
  if (!isGulf && !isIndia) return c.regions.includes("global");
  return false;
}

function isWrongLocation(jobLoc: string, region: string): boolean {
  const r = region.toLowerCase();
  const l = jobLoc.toLowerCase();
  const isGulfSearch = ["dubai","uae","abu dhabi","gcc"].some(g => r.includes(g));
  if (!isGulfSearch) return false;
  // Hard reject India-specific locations in UAE searches
  return ["bangalore","bengaluru","mumbai","delhi","hyderabad","chennai","pune","kolkata","india"].some(bad => l.includes(bad));
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function scrapeCompanyCareers(
  opts: SearchOptions,
  onJob: JobEmitter,
  onLog: LogEmitter
): Promise<ScrapedJob[]> {
  const { role, region, aliases = [], exclusions = [] } = opts;
  const results: ScrapedJob[] = [];

  const targets = COMPANY_REGISTRY.filter(c => companyMatchesRegion(c, region));
  onLog("info", `Company Careers: querying ${targets.length} portals for "${role}" in "${region}"...`);

  const BATCH = 6;
  for (let i = 0; i < targets.length; i += BATCH) {
    await Promise.allSettled(targets.slice(i, i + BATCH).map(async (company) => {
      try {
        let raw: Partial<ScrapedJob>[] = [];

        if (company.ats === "workday")         raw = await scrapeWorkday(company, role);
        else if (company.ats === "greenhouse") raw = await scrapeGreenhouse(company, role);
        else if (company.ats === "lever")      raw = await scrapeLever(company, role);
        else if (company.ats === "amazon")     raw = await scrapeAmazon(role, region);
        else if (company.ats === "smartrecruiters") raw = await scrapeSmartRecruiters(company, role);
        else if (company.ats === "careersUrl") raw = await scrapeCareersUrl(company, role);

        let hits = 0;
        for (const r of raw) {
          if (!r.title || !r.url) continue;
          if (isWrongLocation(r.location || "", region)) continue;
          if (!isJobRelevant(r.title, r.description || "", [`loc:${r.location || ""}`], role, aliases, exclusions, region)) continue;

          const job: ScrapedJob = {
            title: r.title,
            company: company.name,
            location: r.location || region,
            salary: "See listing",
            description: r.description,
            url: r.url,
            postedAt: r.postedAt,
            source: SOURCE,
            externalId: r.externalId || `cc-${company.name}-${r.url.slice(-16)}`,
            logo: company.name.substring(0, 2).toUpperCase(),
            color: company.color,
          };
          results.push(job);
          onJob(job);
          hits++;
        }
        if (hits > 0) onLog("success", `${company.name}: ${hits} listing(s)`);
      } catch (err: any) {
        logger.warn({ company: company.name, err: err.message }, "Company portal fetch failed");
      }
    }));
    if (i + BATCH < targets.length) await new Promise(r => setTimeout(r, 300));
  }

  onLog("success", `Company Careers: ${results.length} total across ${targets.length} portals`);
  return results;
}

export { COMPANY_REGISTRY };
