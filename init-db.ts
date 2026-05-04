import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "./lib/db/src/schema";

// Create SQLite database connection
const sqlite = new Database("jobpilot.db");
const dbInstance = drizzle(sqlite, { schema });

// Create tables
dbInstance.run(`CREATE TABLE IF NOT EXISTS profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  current_role TEXT NOT NULL,
  target_market TEXT,
  years_of_experience TEXT,
  skills TEXT,
  cv_text TEXT,
  cv_metadata TEXT,
  ai_backends TEXT,
  automation_settings TEXT,
  search_preferences TEXT,
  metadata TEXT,
  created_at TEXT,
  updated_at TEXT
)`);

dbInstance.run(`CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  company TEXT NOT NULL,
  location TEXT,
  salary TEXT,
  description TEXT,
  source TEXT NOT NULL,
  external_id TEXT,
  url TEXT,
  status TEXT DEFAULT 'discovered',
  ai_score INTEGER,
  ai_match_reason TEXT,
  ai_processed_at TEXT,
  metadata TEXT,
  posted_at TEXT,
  scraped_at TEXT,
  created_at TEXT,
  updated_at TEXT
)`);

console.log("Database tables created successfully!");