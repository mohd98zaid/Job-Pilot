const Database = require('better-sqlite3');
const { join } = require('path');

const dbPath = join(__dirname, 'jobpilot.db');
console.log('Database path:', dbPath);

const sqlite = new Database(dbPath);

// Add triggers to handle timestamp defaults for SQLite
// This is a workaround for the defaultNow() issue in Drizzle with SQLite

// Create a function to handle timestamp defaults
sqlite.exec(`
  CREATE TRIGGER IF NOT EXISTS update_updated_at
  AFTER UPDATE ON profiles
  BEGIN
    UPDATE profiles SET updated_at = datetime('now') WHERE id = NEW.id;
  END
`);

console.log("Added timestamp handling triggers!");

sqlite.close();