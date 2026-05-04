// Schema index file for all database tables
// This exports all schema definitions for drizzle ORM

// Core tables
export * from "./jobs";
export * from "./applications";
export * from "./profiles";
export * from "./ai-analyses";
export * from "./portals";

// Export all table objects for use in drizzle
export const schema = {
  jobsTable,
  applicationsTable,
  profilesTable,
  aiAnalysesTable,
  portalsTable,
};

// Import all tables to ensure exports are set up correctly
import { jobsTable } from "./jobs";
import { applicationsTable } from "./applications";
import { profilesTable } from "./profiles";
import { aiAnalysesTable } from "./ai-analyses";
import { portalsTable } from "./portals";