const Database = require('better-sqlite3');
const { join } = require('path');

const dbPath = join(__dirname, 'jobpilot.db');
console.log('Database path:', dbPath);

const sqlite = new Database(dbPath);
const rows = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log("Tables in database:", rows);

// Check if profiles table exists
try {
  const profileRows = sqlite.prepare("SELECT count(*) as count FROM profiles").get();
  console.log("Profiles table exists and has rows:", profileRows.count);
} catch (error) {
  console.log("Error accessing profiles table:", error.message);
}

sqlite.close();