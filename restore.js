const fs = require('fs');
let code = fs.readFileSync('artifacts/jobpilot/src/pages/JobPilot.tsx', 'utf8');

if (!code.includes('const [sessionId, setSessionId]')) {
  code = code.replace('const [skills, setSkills] = useState<string[]>([]);', 'const [skills, setSkills] = useState<string[]>([]);\n  const [sessionId, setSessionId] = useState(() => localStorage.getItem("jobpilot_sessionId") || "");\n\n  useEffect(() => {\n    localStorage.setItem("jobpilot_sessionId", sessionId);\n  }, [sessionId]);');
}

if (!code.includes('Web Footprint Scraping')) {
  const settingsPanel = `                  {/* Web Footprint Scraping */}
                  <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: 18 }}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.8px", color: "var(--muted)", textTransform: "uppercase", marginBottom: 14 }}>Web Footprint Scraping</div>
                    <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 16 }}>Securely extract your professional identity, skills, and history across platforms.</p>
                    
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      <div>
                        <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--muted)", marginBottom: 6 }}>LinkedIn Session Cookie (li_at)</label>
                        <input
                          type="password"
                          value={sessionId}
                          onChange={e => setSessionId(e.target.value)}
                          placeholder="Enter li_at cookie for authenticated scraping"
                          style={{ width: "100%", background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)", padding: "10px 14px", borderRadius: 8, color: "var(--text)", fontSize: 13, fontFamily: "'Space Mono', monospace" }}
                        />
                      </div>
                      
                      <button 
                        onClick={handleScrapeProfile}
                        disabled={profileScraping}
                        className="btn-secondary" 
                        style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "10px 14px", fontSize: 13, marginTop: 4, background: profileScraping ? "rgba(255,255,255,0.05)" : undefined }}
                      >
                        {profileScraping ? <><span style={{ width: 14, height: 14, border: "2px solid rgba(255,255,255,0.4)", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite", display: "inline-block" }} /> Scraping...</> : <><Globe size={15} /> Scrape Entire Footprint</>}
                      </button>
                    </div>
                  </div>

                  {/* Profile Form */}
`;
  code = code.replace('                  {/* Profile Form */}', settingsPanel);
}

fs.writeFileSync('artifacts/jobpilot/src/pages/JobPilot.tsx', code);
console.log('Restored sessionId successfully.');
