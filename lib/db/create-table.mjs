import Database from 'better-sqlite3';
const db = new Database('../../jobpilot.db');
db.exec(`
  CREATE TABLE IF NOT EXISTS portals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    type TEXT DEFAULT 'company',
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  )
`);
console.log('Portals table created OK');
db.close();
