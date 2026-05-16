// gcc-portals.scraper.ts
// Scrapes all major GCC/MENA job portals via their JSON/AJAX APIs.
// Portals: GulfTalent · MonsterGulf · GulfJobs · Dubizzle · Laimoon · DrJobs · Tanqeeb · Akhtaboot · Forasna

import { type ScrapedJob, type SearchOptions, type JobEmitter, type LogEmitter } from "./types.js";
import { isJobRelevant } from "./relevance.js";
import { logger } from "../../lib/logger.js";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0";
const TIMEOUT = 15000;
const MAX_PAGES = 5;

async function safeFetch(url: string, init?: RequestInit): Promise<Response | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const r = await fetch(url, { ...init, signal: ctrl.signal });
    clearTimeout(t); return r;
  } catch { clearTimeout(t); return null; }
}

function delay(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// ── GulfTalent ────────────────────────────────────────────────────────────────
async function scrapeGulfTalent(role: string, region: string): Promise<any[]> {
  const results: any[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `https://www.gulftalent.com/api/v3/jobs/search?q=${encodeURIComponent(role)}&location=${encodeURIComponent(region)}&page=${page}&limit=20&sort=date`;
    const res = await safeFetch(url, { headers: { "User-Agent": UA, "Accept": "application/json", "Referer": "https://www.gulftalent.com/" } });

    // If JSON API fails, try HTML scraping
    if (!res?.ok) {
      if (page === 1) {
        const htmlUrl = `https://www.gulftalent.com/jobs?q=${encodeURIComponent(role)}&location=${encodeURIComponent(region)}`;
        const htmlRes = await safeFetch(htmlUrl, { headers: { "User-Agent": UA } });
        if (!htmlRes?.ok) break;
        const html = await htmlRes.text();
        const jsonMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>({[\s\S]*?})<\/script>/);
        if (jsonMatch) {
          try {
            const d = JSON.parse(jsonMatch[1]);
            const jobs: any[] = d?.props?.pageProps?.jobs || [];
            for (const j of jobs) results.push({
              title: j.title, company: j.company?.name || "Unknown",
              location: j.location || region, salary: j.salary || "Not listed",
              url: `https://www.gulftalent.com${j.url || "/jobs/" + j.id}`,
              externalId: `gt-${j.id}`, source: "GulfTalent",
            });
          } catch { /* ignore */ }
        }
      }
      break;
    }

    let data: any; try { data = await res.json(); } catch { break; }
    const jobs: any[] = data?.jobs || data?.data || data?.results || [];
    if (!jobs.length) break;
    for (const j of jobs) {
      results.push({
        title: j.title, company: j.company || j.companyName || "Unknown",
        location: j.location || region, salary: j.salary || "Not listed",
        url: j.url?.startsWith("http") ? j.url : `https://www.gulftalent.com/jobs/${j.id}`,
        externalId: `gt-${j.id}`, description: j.description?.substring(0, 400), source: "GulfTalent",
      });
    }
    await delay(500);
  }
  return results;
}

// ── MonsterGulf ───────────────────────────────────────────────────────────────
async function scrapeMonsterGulf(role: string, region: string): Promise<any[]> {
  const results: any[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const start = (page - 1) * 20;
    const url = `https://www.monstergulf.com/search-jobs.html?q=${encodeURIComponent(role)}&loc=${encodeURIComponent(region)}&start=${start}`;
    const res = await safeFetch(url, { headers: { "User-Agent": UA, "Accept": "text/html" } });
    if (!res?.ok) break;
    const html = await res.text();

    const jsonMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi);
    if (jsonMatch) {
      for (const block of jsonMatch) {
        try {
          const inner = block.replace(/<script[^>]*>/, "").replace(/<\/script>/, "");
          const d = JSON.parse(inner);
          if (d["@type"] === "JobPosting") {
            results.push({
              title: d.title, company: d.hiringOrganization?.name || "Unknown",
              location: d.jobLocation?.address?.addressLocality || region,
              salary: d.baseSalary?.value?.value || "Not listed",
              url: d.url || url, externalId: `mg-${d.url || Math.random()}`,
              postedAt: d.datePosted, description: d.description?.substring(0, 400),
              source: "MonsterGulf",
            });
          }
        } catch { /* ignore */ }
      }
    }

    // Link-level regex fallback
    const linkRe = /href="(\/job-detail[^"]+)"[^>]*>[\s\S]*?<h2[^>]*>([^<]{5,100})<\/h2>[\s\S]*?<span[^>]*company[^>]*>([^<]+)</gi;
    let m: RegExpExecArray | null;
    while ((m = linkRe.exec(html))) {
      results.push({
        title: m[2].trim(), company: m[3].trim(), location: region,
        url: `https://www.monstergulf.com${m[1]}`,
        externalId: `mg-${m[1]}`, source: "MonsterGulf",
      });
    }

    if (!results.length && page === 1) break;
    await delay(600);
  }
  return results;
}

// ── Dubizzle Jobs ─────────────────────────────────────────────────────────────
async function scrapeDubizzle(role: string, region: string): Promise<any[]> {
  const results: any[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `https://uae.dubizzle.com/jobs/search/?q=${encodeURIComponent(role)}&page=${page}`;
    const res = await safeFetch(url, { headers: { "User-Agent": UA, "Accept": "text/html", "Referer": "https://uae.dubizzle.com/" } });
    if (!res?.ok) break;
    const html = await res.text();

    const jsonMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>({[\s\S]*?})<\/script>/);
    if (jsonMatch) {
      try {
        const d = JSON.parse(jsonMatch[1]);
        const jobs: any[] = d?.props?.pageProps?.results || d?.props?.pageProps?.jobs || [];
        if (!jobs.length) break;
        for (const j of jobs) {
          results.push({
            title: j.title || j.name, company: j.company || j.organization || "Unknown",
            location: j.location || j.area || region,
            salary: j.salary || j.price || "Not listed",
            url: j.absolute_url || `https://uae.dubizzle.com${j.url || "/jobs/" + j.id}`,
            externalId: `dz-${j.id}`, postedAt: j.added, source: "Dubizzle",
          });
        }
      } catch { break; }
    } else break;
    await delay(500);
  }
  return results;
}

// ── DrJobs.ae ─────────────────────────────────────────────────────────────────
async function scrapeDrJobs(role: string, region: string): Promise<any[]> {
  const results: any[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `https://api.drjobs.ae/api/v2/jobs?title=${encodeURIComponent(role)}&country=${encodeURIComponent(region)}&page=${page}&perPage=20&sortBy=newest`;
    const res = await safeFetch(url, { headers: { "User-Agent": UA, "Accept": "application/json", "Referer": "https://www.drjobs.ae/" } });
    if (!res?.ok) {
      // HTML fallback
      if (page === 1) {
        const htmlRes = await safeFetch(`https://www.drjobs.ae/jobs?title=${encodeURIComponent(role)}&country=${encodeURIComponent(region)}`, { headers: { "User-Agent": UA } });
        if (htmlRes?.ok) {
          const html = await htmlRes.text();
          const jm = html.match(/<script id="__NEXT_DATA__"[^>]*>({[\s\S]*?})<\/script>/);
          if (jm) {
            try {
              const d = JSON.parse(jm[1]);
              const jobs = d?.props?.pageProps?.jobs?.data || [];
              for (const j of jobs) results.push({
                title: j.title, company: j.company?.name || "Unknown",
                location: j.country || region, salary: j.salary || "Not listed",
                url: `https://www.drjobs.ae/jobs/${j.slug || j.id}`,
                externalId: `drj-${j.id}`, source: "DrJobs",
              });
            } catch { /* ignore */ }
          }
        }
      }
      break;
    }
    let data: any; try { data = await res.json(); } catch { break; }
    const jobs: any[] = data?.data || data?.jobs || [];
    if (!jobs.length) break;
    for (const j of jobs) {
      results.push({
        title: j.title, company: j.company?.name || j.companyName || "Unknown",
        location: j.country || j.city || region, salary: j.salary || "Not listed",
        url: `https://www.drjobs.ae/jobs/${j.slug || j.id}`,
        externalId: `drj-${j.id}`, description: j.description?.substring(0, 400), source: "DrJobs",
      });
    }
    await delay(500);
  }
  return results;
}

// ── Laimoon.com ──────────────────────────────────────────────────────────────
async function scrapeLaimoon(role: string, region: string): Promise<any[]> {
  const results: any[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `https://laimoon.com/api/jobs/search?q=${encodeURIComponent(role)}&location=${encodeURIComponent(region)}&page=${page}&per_page=20`;
    const res = await safeFetch(url, { headers: { "User-Agent": UA, "Accept": "application/json", "Referer": "https://laimoon.com/" } });
    if (!res?.ok) break;
    let data: any; try { data = await res.json(); } catch { break; }
    const jobs: any[] = data?.data || data?.jobs || data?.results || [];
    if (!jobs.length) break;
    for (const j of jobs) {
      results.push({
        title: j.title || j.job_title, company: j.company || j.employer || "Unknown",
        location: j.location || j.city || region, salary: j.salary || "Not listed",
        url: j.url || `https://laimoon.com/jobs/${j.id}`, externalId: `lm-${j.id}`,
        description: j.description?.substring(0, 400), source: "Laimoon",
      });
    }
    await delay(500);
  }
  return results;
}

// ── Tanqeeb (GCC tech-focused) ────────────────────────────────────────────────
async function scrapeTanqeeb(role: string, region: string): Promise<any[]> {
  const res = await safeFetch(
    `https://api.tanqeeb.com/v1/jobs?q=${encodeURIComponent(role)}&location=${encodeURIComponent(region)}&limit=50`,
    { headers: { "User-Agent": UA, "Accept": "application/json" } }
  );
  if (!res?.ok) return [];
  let data: any; try { data = await res.json(); } catch { return []; }
  return (data?.jobs || data?.data || []).map((j: any) => ({
    title: j.title, company: j.company || "Unknown", location: j.location || region,
    salary: j.salary || "Not listed", url: j.url || `https://www.tanqeeb.com/jobs/${j.id}`,
    externalId: `tq-${j.id}`, source: "Tanqeeb",
  }));
}

// ── Akhtaboot (Middle East) ──────────────────────────────────────────────────
async function scrapeAkhtaboot(role: string, region: string): Promise<any[]> {
  const results: any[] = [];
  for (let page = 1; page <= 3; page++) {
    const url = `https://www.akhtaboot.com/en/jobs?q=${encodeURIComponent(role)}&l=${encodeURIComponent(region)}&page=${page}`;
    const res = await safeFetch(url, { headers: { "User-Agent": UA, "Accept": "text/html" } });
    if (!res?.ok) break;
    const html = await res.text();

    const jm = html.match(/<script id="__NEXT_DATA__"[^>]*>({[\s\S]*?})<\/script>/);
    if (jm) {
      try {
        const d = JSON.parse(jm[1]);
        const jobs: any[] = d?.props?.pageProps?.jobs || d?.props?.pageProps?.results || [];
        if (!jobs.length) break;
        for (const j of jobs) results.push({
          title: j.title, company: j.company_name || "Unknown",
          location: j.country || j.city || region, salary: "Not listed",
          url: j.link || `https://www.akhtaboot.com/en/job/${j.id}`,
          externalId: `ab-${j.id}`, source: "Akhtaboot",
        });
      } catch { break; }
    }

    // JSON-LD fallback
    const ldRe = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi;
    let m: RegExpExecArray | null;
    while ((m = ldRe.exec(html))) {
      try {
        const d = JSON.parse(m[1]);
        if (d["@type"] === "JobPosting") {
          results.push({
            title: d.title, company: d.hiringOrganization?.name || "Unknown",
            location: d.jobLocation?.address?.addressLocality || region,
            url: d.url, externalId: `ab-${d.url}`, source: "Akhtaboot",
          });
        }
      } catch { /* ignore */ }
    }
    await delay(600);
  }
  return results;
}

// ── GulfJobs.com ──────────────────────────────────────────────────────────────
async function scrapeGulfJobs(role: string, region: string): Promise<any[]> {
  const results: any[] = [];
  for (let page = 1; page <= 3; page++) {
    const url = `https://www.gulfjobs.com/jobs/search?keywords=${encodeURIComponent(role)}&location=${encodeURIComponent(region)}&page=${page}`;
    const res = await safeFetch(url, { headers: { "User-Agent": UA, "Accept": "text/html" } });
    if (!res?.ok) break;
    const html = await res.text();

    const ldRe = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi;
    let m: RegExpExecArray | null;
    while ((m = ldRe.exec(html))) {
      try {
        const d = JSON.parse(m[1]);
        const list = Array.isArray(d) ? d : d["@graph"] || [d];
        for (const item of list) {
          if (item["@type"] === "JobPosting") {
            results.push({
              title: item.title, company: item.hiringOrganization?.name || "Unknown",
              location: item.jobLocation?.address?.addressLocality || region,
              url: item.url, externalId: `gj-${item.url}`,
              postedAt: item.datePosted, source: "GulfJobs",
            });
          }
        }
      } catch { /* ignore */ }
    }
    await delay(600);
  }
  return results;
}

// ── Forasna (MENA) ───────────────────────────────────────────────────────────
async function scrapeForasna(role: string, region: string): Promise<any[]> {
  const res = await safeFetch(
    `https://www.forasna.com/api/jobs?q=${encodeURIComponent(role)}&country=${encodeURIComponent(region)}&limit=30`,
    { headers: { "User-Agent": UA, "Accept": "application/json" } }
  );
  if (!res?.ok) return [];
  let data: any; try { data = await res.json(); } catch { return []; }
  return (data?.jobs || data?.data || []).map((j: any) => ({
    title: j.title, company: j.company || "Unknown", location: j.country || region,
    salary: j.salary || "Not listed", url: j.url || `https://www.forasna.com/jobs/${j.id}`,
    externalId: `fn-${j.id}`, source: "Forasna",
  }));
}

// ── Main GCC portals orchestrator ─────────────────────────────────────────────
export async function scrapeGCCPortals(
  opts: SearchOptions,
  onJob: JobEmitter,
  onLog: LogEmitter
): Promise<ScrapedJob[]> {
  const { role, region, aliases = [], exclusions = [] } = opts;
  const results: ScrapedJob[] = [];

  const portals = [
    { name: "GulfTalent",  fn: () => scrapeGulfTalent(role, region), color: "#16A085" },
    { name: "MonsterGulf", fn: () => scrapeMonsterGulf(role, region), color: "#6C3483" },
    { name: "Dubizzle",    fn: () => scrapeDubizzle(role, region),    color: "#FF6600" },
    { name: "DrJobs",      fn: () => scrapeDrJobs(role, region),      color: "#1ABC9C" },
    { name: "Laimoon",     fn: () => scrapeLaimoon(role, region),     color: "#2980B9" },
    { name: "Tanqeeb",     fn: () => scrapeTanqeeb(role, region),     color: "#E67E22" },
    { name: "Akhtaboot",   fn: () => scrapeAkhtaboot(role, region),   color: "#8E44AD" },
    { name: "GulfJobs",    fn: () => scrapeGulfJobs(role, region),    color: "#C0392B" },
    { name: "Forasna",     fn: () => scrapeForasna(role, region),     color: "#27AE60" },
  ];

  onLog("info", `GCC Portals: searching ${portals.length} boards for "${role}" in "${region}"...`);

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
          salary: r.salary || "Not listed",
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
      logger.warn({ portal: portal.name, err: err.message }, "GCC portal failed");
    }
  }));

  onLog("success", `GCC Portals: ${results.length} total listings`);
  return results;
}
