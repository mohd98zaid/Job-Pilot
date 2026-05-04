const Database = require('better-sqlite3');
const { join } = require('path');

const dbPath = join(__dirname, 'jobpilot.db');
console.log('Database path:', dbPath);

const sqlite = new Database(dbPath);

// Create ai_analyses table
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS ai_analyses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER,
    analysis_type TEXT NOT NULL,
    model TEXT NOT NULL,
    backend TEXT NOT NULL,
    result TEXT,
    confidence INTEGER,
    input_context TEXT,
    processing_time_ms INTEGER,
    created_at TEXT,
    processed_at TEXT
  )
`);

console.log("ai_analyses table created successfully!");

sqlite.close();