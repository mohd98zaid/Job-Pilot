const fs = require('fs');
let code = fs.readFileSync('artifacts/jobpilot/src/pages/JobPilot.tsx', 'utf8');

// 1. handleScrapeProfile
const scrapeOld = `  const handleScrapeProfile = async () => {
    if (!sessionId) {
      alert("Please enter a Session ID first to scrape footprint.");
      return;
    }
    setProfileScraping(true);
    addLog("info", "SCRAPE", "Extracting LinkedIn history...");
    
    // Simulate backend scrape
    setTimeout(() => {
      setProfile({ ...profile, Name: "Zaid", "Current Role": "Senior Frontend Developer", "Target Market": "UAE, Remote" });
      setSkills(Array.from(new Set([...skills, "React", "TypeScript", "Node.js", "Playwright", "Web Scraping"])));
      addLog("success", "SCRAPE", "Web footprint successfully extracted. Profile fields updated!");
      setProfileScraping(false);
    }, 2500);
  };`;

const scrapeNew = `  const handleScrapeProfile = async () => {
    if (!sessionId) {
      alert("Please enter a Session ID first to scrape footprint.");
      return;
    }
    setProfileScraping(true);
    addLog("info", "SCRAPE", "Connecting to Footprint Scraper...");

    try {
      const response = await fetch(\`\${API_BASE}/api/profile/scrape\`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId })
      });

      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\\n\\n");
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const parsed = JSON.parse(line.replace("data: ", ""));
              if (parsed.type === "log") {
                addLog(parsed.level === "error" ? "error" : "info", "SCRAPE", parsed.message);
              } else if (parsed.type === "done") {
                const data = parsed.data;
                setProfile({
                  ...profile,
                  Name: data.name || profile.Name,
                  "Current Role": data.currentRole || profile["Current Role"],
                  "Target Market": data.targetMarket || profile["Target Market"]
                });
                if (data.skills && data.skills.length > 0) {
                  setSkills(Array.from(new Set([...skills, ...data.skills])));
                }
                addLog("success", "SCRAPE", "Web footprint successfully extracted. Profile fields updated!");
              }
            } catch (e) {}
          }
        }
      }
    } catch (err: any) {
      addLog("error", "SCRAPE", \`Failed to scrape profile: \${err.message}\`);
    } finally {
      setProfileScraping(false);
    }
  };`;
code = code.replace(scrapeOld, scrapeNew);

// 1.5 Add profileScraping state
if(!code.includes('const [profileScraping, setProfileScraping] = useState(false);')) {
  code = code.replace('const [skills, setSkills] = useState<string[]>([]);', 'const [skills, setSkills] = useState<string[]>([]);\n  const [profileScraping, setProfileScraping] = useState(false);');
}

// 2. update searchRealJobs call to pass sessionId
const searchCallOld = `      const results = await searchRealJobs(role, region, activeBoards, [], dateFilter,`;
const searchCallNew = `      const results = await searchRealJobs(role, region, activeBoards, [], dateFilter, sessionId,`;
code = code.replace(searchCallOld, searchCallNew);

// 3. Unexpanded card UI
const cardOld = `                                <Badge status={job.status} />
                              </div>
                              <div style={{ fontSize: 11, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{job.company} · {job.location} · {job.posted}</div>`;

const cardNew = `                                <select 
                                  value={job.status}
                                  onClick={e => e.stopPropagation()}
                                  onChange={e => updateStatus(job.id, e.target.value)}
                                  style={{
                                    appearance: "none", background: STATUS_COLORS[job.status]?.bg || "transparent", color: STATUS_COLORS[job.status]?.text || "#fff",
                                    border: \`1px solid \${STATUS_COLORS[job.status]?.border || "transparent"}\`, padding: "2px 8px", borderRadius: 4, fontSize: 9.5,
                                    fontWeight: 700, letterSpacing: "0.5px", textTransform: "uppercase", cursor: "pointer", outline: "none"
                                  }}
                                >
                                  {Object.keys(STATUS_COLORS).map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                              </div>
                              <div style={{ fontSize: 11, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {job.company} · {job.location} · {job.posted} · Scraped: {job.scrapedAt ? new Date(job.scrapedAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : "Just now"}
                              </div>`;
code = code.replace(cardOld, cardNew);

// 4. Tracker table UI
const trackerOld = `                          <td style={{ padding: "14px 16px" }}><Badge status={j.status} /></td>
                          <td style={{ padding: "14px 16px", color: "var(--muted)", fontFamily: "'Space Mono', monospace", fontSize: 11 }}>{j.posted}</td>`;

const trackerNew = `                          <td style={{ padding: "14px 16px" }}>
                            <select 
                              value={j.status}
                              onChange={e => updateStatus(j.id, e.target.value)}
                              style={{
                                appearance: "none", background: STATUS_COLORS[j.status]?.bg || "transparent", color: STATUS_COLORS[j.status]?.text || "#fff",
                                border: \`1px solid \${STATUS_COLORS[j.status]?.border || "transparent"}\`, padding: "4px 8px", borderRadius: 4, fontSize: 10,
                                fontWeight: 700, letterSpacing: "0.5px", textTransform: "uppercase", cursor: "pointer", outline: "none"
                              }}
                            >
                              {Object.keys(STATUS_COLORS).map(s => <option key={s} value={s} style={{background:"#1c2128", color:"#fff"}}>{s}</option>)}
                            </select>
                          </td>
                          <td style={{ padding: "14px 16px", color: "var(--muted)", fontFamily: "'Space Mono', monospace", fontSize: 11 }}>
                            {j.scrapedAt ? new Date(j.scrapedAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : "Just now"}
                          </td>`;
code = code.replace(trackerOld, trackerNew);

// 5. Remove Update Status inside expanded card
const updateStatusOld = `                              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.8px", color: "var(--muted)", textTransform: "uppercase", marginBottom: 10, marginTop: 18 }}>Update Status</div>
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
                                {Object.keys(STATUS_COLORS).map(s => (
                                  <button
                                    key={s}
                                    onClick={() => updateStatus(job.id, s)}
                                    style={{
                                      padding: "5px 12px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer", transition: "all 0.15s", fontFamily: "'DM Sans', sans-serif",
                                      borderColor: job.status === s ? STATUS_COLORS[s].border : "rgba(255,255,255,0.08)",
                                      background: job.status === s ? STATUS_COLORS[s].bg : "transparent",
                                      color: job.status === s ? STATUS_COLORS[s].text : "var(--muted)",
                                      border: \`1px solid \${job.status === s ? STATUS_COLORS[s].border : "rgba(255,255,255,0.08)"}\`,
                                    }}
                                  >{s}</button>
                                ))}
                              </div>`;
code = code.replace(updateStatusOld, "");

fs.writeFileSync('artifacts/jobpilot/src/pages/JobPilot.tsx', code);
console.log('Update success');
