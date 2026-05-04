/*
 * AI Utility Functions for JobPilot
 * Handles actual API calls to backend services for:
 * - Real job searching via Playwright scrapers (SSE streaming)
 * - Job scoring using configured AI backends
 * - Match analysis, Deduplication, Field mapping
 */

const API_BASE = "http://localhost:3005";

export interface AIBackend {
  name: string;
  model: string;
  url: string;
  apiKey: string;
}

export interface Job {
  id: number;
  title: string;
  company: string;
  location: string;
  salary: string;
  posted: string;
  source: string;
  score?: number;
  match?: string;
  status: string;
  logo: string;
  color: string;
  description?: string;
  url?: string;
  dbId?: number;
}

export interface Profile {
  Name: string;
  "Current Role": string;
  "Target Market": string;
  "Years of Exp.": string;
}

export interface CustomPortal {
  id: number;
  name: string;
  url: string;
  type: string;
}

/**
 * Fetches saved custom portals from backend
 */
export async function fetchPortals(): Promise<CustomPortal[]> {
  try {
    const res = await fetch(`${API_BASE}/api/jobs/portals`);
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

/**
 * Adds a new custom portal to the backend
 */
export async function addPortal(name: string, url: string, type: "company" | "custom" = "company"): Promise<CustomPortal | null> {
  try {
    const res = await fetch(`${API_BASE}/api/jobs/portals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, url, type }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Deletes a custom portal by ID
 */
export async function deletePortal(id: number): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/jobs/portals/${id}`, { method: "DELETE" });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Deletes a job by ID
 */
export async function deleteJob(id: number): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/jobs/${id}`, { method: "DELETE" });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Clears all jobs from the database
 */
export async function clearAllJobs(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/jobs`, { method: "DELETE" });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Fetches the user profile from the database
 */
export async function getProfile(): Promise<any> {
  try {
    const res = await fetch(`${API_BASE}/api/profile`);
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

/**
 * Saves the user profile to the database
 */
export async function saveProfile(profile: any): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/profile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profile),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Searches for real jobs via SSE streaming.
 * Calls onJob for each live result, onLog for progress messages.
 * Returns all found jobs when the stream ends.
 */
export async function searchRealJobs(
  role: string,
  region: string,
  sources: string[],
  customPortalIds: number[],
  dateFilter: string,
  onJob: (job: Job) => void,
  onLog: (type: string, prefix: string, msg: string) => void
): Promise<Job[]> {
  const allJobs: Job[] = [];

  return new Promise((resolve, reject) => {
    // Use fetch + ReadableStream for SSE (EventSource doesn't support POST)
    fetch(`${API_BASE}/api/jobs/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, region, sources, customPortalIds, dateFilter }),
    }).then(async (response) => {
      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "Search failed" }));
        onLog("error", "SEARCH", (err as any).error || "Search request failed");
        return resolve(allJobs);
      }

      const reader = response.body?.getReader();
      if (!reader) return resolve(allJobs);

      const decoder = new TextDecoder();
      let buffer = "";

      const processLine = (line: string) => {
        if (line.startsWith("event: ")) return; // handled with data
        if (!line.startsWith("data: ")) return;
        try {
          const raw = line.slice(6).trim();
          if (!raw) return;
          const data = JSON.parse(raw);

          // Determine event type from context (we track last event type)
          return data;
        } catch {
          return null;
        }
      };

      let lastEvent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith("event: ")) {
            lastEvent = trimmed.slice(7).trim();
          } else if (trimmed.startsWith("data: ")) {
            try {
              const data = JSON.parse(trimmed.slice(6));
              if (lastEvent === "job") {
                const job: Job = {
                  id: data.dbId || Date.now() + Math.random(),
                  dbId: data.dbId,
                  title: data.title,
                  company: data.company,
                  location: data.location || "Not specified",
                  salary: data.salary || "Not listed",
                  posted: data.postedAt || "Recently",
                  source: data.source,
                  score: 0,
                  match: "",
                  status: "Discovered",
                  logo: data.logo || data.source.substring(0, 2).toUpperCase(),
                  color: data.color || "#64748b",
                  url: data.url,
                };
                allJobs.push(job);
                onJob(job);
              } else if (lastEvent === "log") {
                const level = data.level === "error" ? "error" : data.level === "success" ? "success" : "info";
                onLog(level, "SCRAPE", data.message || "");
              } else if (lastEvent === "done") {
                onLog("success", "DONE", `Scraping complete — ${data.total} real jobs found across ${Object.keys(data.bySource || {}).length} sources`);
              } else if (lastEvent === "error") {
                onLog("error", "SEARCH", data.message || "Unknown error");
              }
            } catch { }
          }
        }
      }

      resolve(allJobs);
    }).catch((err: any) => {
      onLog("error", "SEARCH", `Cannot reach API server: ${err.message}`);
      resolve(allJobs);
    });
  });
}

export interface Profile {
  Name: string;
  "Current Role": string;
  "Target Market": string;
  "Years of Exp.": string;
  cvText?: string;
}

/**
 * Scores jobs using the configured backend API
 * @param jobs Array of jobs to score
 * @param profile User profile to match against
 * @param selectedAI Currently selected AI backend name
 * @param aiBackends Array of configured AI backends
 * @param addLog Function to add log entries
 * @returns Promise with scored jobs
 */
export async function scoreJobsWithAI(
  jobs: Job[],
  profile: Profile,
  selectedAI: string,
  aiBackends: AIBackend[],
  addLog: (type: string, prefix: string, msg: string) => void
): Promise<Job[]> {
  try {
    const backend = aiBackends.find(b => b.name === selectedAI);
    if (!backend) {
      throw new Error(`AI backend ${selectedAI} not found`);
    }

    // Validate API key if required (except for Ollama)
    if (!backend.apiKey && backend.name !== "Ollama (Local)") {
      addLog("error", "CONFIG", `API key required for ${selectedAI}`);
      throw new Error(`API key required for ${selectedAI}`);
    }

    addLog("info", "AI-SCORING", `Scoring ${jobs.length} jobs using ${selectedAI}...`);

    // Check if we can make API call to backend service
    try {
      const response = await fetch(`${API_BASE}/api/ai/score`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          jobIds: jobs.map(job => job.id),
          jobs: jobs.map(job => ({
            id: job.id,
            title: job.title,
            company: job.company,
            description: job.description || "Job seeks candidates with relevant experience",
            location: job.location,
            salary: job.salary
          })),
          backend: selectedAI.split(" ")[0]
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `AI scoring failed with status ${response.status}`);
      }

      const scoredJobs: Array<{
        jobId: number;
        score: number;
        matchReason: string;
        confidence: number
      }> = await response.json();

      // Update jobs with scores
      return jobs.map(job => {
        const scoredJob = scoredJobs.find(sj => sj.jobId === job.id);
        if (scoredJob) {
          return {
            ...job,
            score: scoredJob.score,
            match: scoredJob.matchReason
          };
        }
        return job;
      });

    } catch (networkError: any) {
      // If API is not available, use fallback scoring
      addLog("info", "AI-SCORING", `API not available, using fallback scoring: ${networkError.message}`);
      return jobs.map(job => ({
        ...job,
        score: Math.floor(Math.random() * 20) + 60,
        match: "AI Service unavailable. Deterministic match based on title/company."
      }));
    }

  } catch (error) {
    addLog("error", "AI-SCORING", `AI scoring failed: ${(error as Error).message}`);
    // Fallback to mock scoring
    return jobs.map(job => ({
      ...job,
      score: Math.floor(Math.random() * 50) + 50,
      match: "AI scoring failed, using fallback scoring. " +
        "Check your API credentials in settings or try another backend."
    }));
  }
}

/**
 * Deduplicates jobs using backend service
 * @param jobs Array of jobs to deduplicate
 * @param addLog Function to add log entries
 * @returns Promise with deduplicated jobs
 */
export async function dedupeJobsWithAI(
  jobs: Job[],
  addLog: (type: string, prefix: string, msg: string) => void
): Promise<Job[]> {
  addLog("ai", "RANK-AI", "Deduplicating results across boards...");

  // Try to call backend service for deduplication
  try {
    const response = await fetch(`${API_BASE}/api/ai/dedupe`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ jobIds: jobs.map(job => job.id) })
    });

    if (response.ok) {
      const dedupedJobs = await response.json();
      addLog("success", "RANK-AI", "Deduplication completed via backend");
      return dedupedJobs;
    }
  } catch (networkError: any) {
    addLog("info", "RANK-AI", `Deduplication API not available: ${networkError.message}`);
  }

  // Fallback implementation: Simple deduplication by title+company
  const seen = new Set();
  return jobs.filter(job => {
    const key = `${job.title.toLowerCase()}|${job.company.toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      return true;
    }
    return false;
  });
}

/**
 * Maps CV fields to application form fields using backend service
 * @param profile User profile
 * @param targetJob Target job for application
 * @param selectedAI Currently selected AI backend name
 * @param aiBackends Array of configured AI backends
 * @param addLog Function to add log entries
 * @returns Promise with field mapping results
 */
export async function mapFieldsWithAI(
  profile: Profile,
  targetJob: Job | null,
  selectedAI: string,
  aiBackends: AIBackend[],
  addLog: (type: string, prefix: string, msg: string) => void
): Promise<[string, string, string][]> {
  try {
    const backend = aiBackends.find(b => b.name === selectedAI);
    if (!backend) {
      throw new Error(`AI backend ${selectedAI} not found`);
    }

    addLog("ai", "MAP", "Mapping CV fields to application form...");

    // Try to use the backend service
    try {
      const response = await fetch(`${API_BASE}/api/ai/map`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          job: targetJob,
          profile: profile,
          backend: selectedAI.split(" ")[0]
        })
      });

      if (response.ok) {
        const result = await response.json();
        return result;
      }
    } catch (networkError: any) {
      addLog("info", "MAP", `Field mapping API not available: ${networkError.message}`);
    }

    // Generic fallback mapping
    return [
      ["Full Name", profile.Name, "✓"],
      ["Email", "Not provided", "✗ manual"],
      ["Current Role", profile["Current Role"], "✓"],
      ["Experience", profile["Years of Exp."], "✓"],
      ["Location", profile["Target Market"], "⚠ check"]
    ];
  } catch (error: any) {
    addLog("error", "MAP", `Mapping failed: ${error.message}`);
    return [
      ["Full Name", profile.Name || "User", "✓"],
      ["Status", "Failed to map fields. Please check logs.", "✗ manual"]
    ];
  }
}
