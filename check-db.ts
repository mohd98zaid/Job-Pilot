import Database from "better-sqlite3";

const sqlite = new Database("jobpilot.db");
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