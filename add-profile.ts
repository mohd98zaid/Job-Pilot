import Database from "better-sqlite3";

// Create SQLite database connection
const sqlite = new Database("jobpilot.db");

// Insert a default profile
const stmt = sqlite.prepare(`INSERT OR IGNORE INTO profiles
  (user_id, name, current_role, target_market, years_of_experience, skills, cv_text, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`);

stmt.run('default-user', 'Default User', 'Software Developer', 'Tech', '5+', '["JavaScript", "Python", "React"]', 'Experienced developer with 5+ years of experience in web development.');

console.log("Default profile added to database!");