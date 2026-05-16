// artifacts/api-server/src/services/scrapers/link-validator.ts
// Validates job URLs before they are stored or emitted to the frontend

import { logger } from "../../lib/logger.js";

const VALIDATION_TIMEOUT_MS = 6000;

// Known login-wall patterns that redirect to a login page (not a real job page)
const LOGIN_WALL_PATTERNS = [
  "/login",
  "/authwall",
  "/checkpoint",
  "/uas/login",
  "signin",
  "sign-in",
];

/**
 * Checks if a URL is likely a valid, accessible job listing.
 * Uses a HEAD request to avoid downloading the full page.
 * Returns true if the URL is reachable and does not redirect to a login wall.
 */
export async function isValidJobUrl(url: string): Promise<boolean> {
  if (!url || !url.startsWith("http")) return false;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), VALIDATION_TIMEOUT_MS);

    const res = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      },
    });

    clearTimeout(timeout);

    // Check if final URL (after redirects) hit a login wall
    const finalUrl = res.url || url;
    const isLoginWall = LOGIN_WALL_PATTERNS.some((p) =>
      finalUrl.toLowerCase().includes(p)
    );

    return res.ok && !isLoginWall;
  } catch {
    return false;
  }
}

/**
 * Validates a list of jobs in parallel (max 5 concurrent requests)
 * and returns only jobs with reachable, valid URLs.
 */
export async function filterValidJobs<T extends { url?: string }>(
  jobs: T[],
  onLog?: (level: "info" | "error" | "success", msg: string) => void
): Promise<T[]> {
  const CONCURRENCY = 5;
  const valid: T[] = [];

  for (let i = 0; i < jobs.length; i += CONCURRENCY) {
    const batch = jobs.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(async (job) => {
        if (!job.url) return null;
        const ok = await isValidJobUrl(job.url);
        if (!ok) {
          logger.debug({ url: job.url }, "Job URL failed validation — skipping");
        }
        return ok ? job : null;
      })
    );

    for (const r of results) {
      if (r.status === "fulfilled" && r.value !== null) {
        valid.push(r.value);
      }
    }
  }

  const removed = jobs.length - valid.length;
  if (removed > 0 && onLog) {
    onLog("info", `Link validator: removed ${removed} dead/login-wall URLs`);
  }

  return valid;
}
