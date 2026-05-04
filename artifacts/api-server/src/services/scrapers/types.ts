// artifacts/api-server/src/services/scrapers/types.ts

export interface ScrapedJob {
  title: string;
  company: string;
  location: string;
  salary?: string;
  description?: string;
  url: string;
  postedAt?: string;
  source: string;        // "LinkedIn" | "Naukri" | "Indeed" | etc.
  externalId?: string;   // unique ID from the source portal
  logo?: string;         // 2-char abbreviation for the UI
  color?: string;        // hex color for the job card
}

export interface SearchOptions {
  role: string;
  region: string;
  dateFilter?: string;   // "Last 24 hours" | "Last 7 days" | "Last 14 days" | "Last 30 days"
  maxResults?: number;
}

export interface ScrapeResult {
  source: string;
  jobs: ScrapedJob[];
  error?: string;
  duration: number; // ms
}

export type JobEmitter = (job: ScrapedJob) => void;
export type LogEmitter = (level: "info" | "error" | "success", msg: string) => void;
