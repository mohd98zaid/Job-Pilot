import Database from 'better-sqlite3';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Check the database in the api-server directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dbPath = join(__dirname, 'jobpilot.db');
console.log('Database path:', dbPath);

const sqlite = new Database(dbPath);
const rows = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log("Tables in database:", rows);

// Check if profiles table exists
try {
  const profileRows = sqlite.prepare("SELECT * FROM profiles LIMIT 1").all();
  console.log("Profiles table exists and has data:", profileRows.length > 0);
} catch (error) {
  console.log("Error accessing profiles table:", error.message);
}

sqlite.close();