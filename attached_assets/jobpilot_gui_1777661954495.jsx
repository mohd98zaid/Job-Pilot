import { useState, useEffect, useRef } from "react";

const JOBS = [
  { id: 1, title: "GenAI Architect", company: "G42", location: "Abu Dhabi, UAE", salary: "$140K–180K", posted: "2h ago", source: "LinkedIn", score: 97, match: "Strong CV match on LangChain, Azure OpenAI, RAG pipelines. Team lead exp. aligns.", status: "Saved", logo: "G4", color: "#0ea5e9" },
  { id: 2, title: "Senior AI Engineer", company: "ADNOC Digital", location: "Dubai, UAE", salary: "$120K–150K", posted: "5h ago", source: "Wellfound", score: 91, match: "BFSI domain + multi-agent experience is a strong fit. Missing AWS Bedrock mention.", status: "Applied", logo: "AD", color: "#8b5cf6" },
  { id: 3, title: "LLM Systems Engineer", company: "Careem", location: "Dubai, UAE", salary: "Not listed", posted: "1d ago", source: "Indeed", score: 88, match: "Production RAG + Playwright automation aligns. Role is IC, not team lead.", status: "Discovered", logo: "CR", color: "#f59e0b" },
  { id: 4, title: "AI Platform Lead", company: "Presight", location: "Abu Dhabi, UAE", salary: "$160K–200K", posted: "2d ago", source: "LinkedIn", score: 85, match: "Strong leadership match. Requires security clearance — verify eligibility.", status: "Discovered", logo: "PS", color: "#10b981" },
  { id: 5, title: "GenAI Solutions Architect", company: "Microsoft Gulf", location: "Dubai, UAE", salary: "$130K–170K", posted: "3d ago", source: "Greenhouse", score: 82, match: "Azure stack aligns perfectly. 8+ yrs preferred — address in cover letter.", status: "Interview", logo: "MS", color: "#3b82f6" },
  { id: 6, title: "ML Engineer – NLP", company: "Noon.com", location: "Dubai, UAE", salary: "$90K–110K", posted: "4d ago", source: "Naukri", score: 71, match: "Partial match. Role skews more MLOps than GenAI architecture.", status: "Rejected", logo: "NC", color: "#ef4444" },
];

const STATS = [
  { label: "Discovered", value: 47, color: "#64748b" },
  { label: "Saved", value: 12, color: "#0ea5e9" },
  { label: "Applied", value: 8, color: "#8b5cf6" },
  { label: "Interview", value: 3, color: "#f59e0b" },
  { label: "Offer", value: 1, color: "#10b981" },
  { label: "Rejected", value: 5, color: "#ef4444" },
];

const STATUS_COLORS = {
  Discovered: { bg: "rgba(100,116,139,0.15)", text: "#94a3b8", border: "#334155" },
  Saved:      { bg: "rgba(14,165,233,0.12)", text: "#38bdf8", border: "#0369a1" },
  Applied:    { bg: "rgba(139,92,246,0.15)", text: "#a78bfa", border: "#6d28d9" },
  Interview:  { bg: "rgba(245,158,11,0.15)", text: "#fbbf24", border: "#b45309" },
  Offer:      { bg: "rgba(16,185,129,0.15)", text: "#34d399", border: "#047857" },
  Rejected:   { bg: "rgba(239,68,68,0.1)",  text: "#f87171", border: "#991b1b" },
};

const ScoreBar = ({ score }) => {
  const color = score >= 90 ? "#10b981" : score >= 80 ? "#f59e0b" : "#ef4444";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 4, background: "#1e293b", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ width: `${score}%`, height: "100%", background: color, borderRadius: 2, transition: "width 0.6s ease" }} />
      </div>
      <span style={{ fontSize: 13, fontWeight: 700, color, minWidth: 28, fontFamily: "'JetBrains Mono', monospace" }}>{score}</span>
    </div>
  );
};

const Badge = ({ status }) => {
  const s = STATUS_COLORS[status] || STATUS_COLORS.Discovered;
  return (
    <span style={{ padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, background: s.bg, color: s.text, border: `1px solid ${s.border}`, letterSpacing: "0.04em", whiteSpace: "nowrap" }}>
      {status}
    </span>
  );
};

const AgentLog = ({ logs }) => {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [logs]);
  return (
    <div ref={ref} style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: "#94a3b8", background: "#020817", border: "1px solid #0f172a", borderRadius: 10, padding: 16, height: 200, overflowY: "auto", lineHeight: 1.8 }}>
      {logs.map((l, i) => (
        <div key={i}>
          <span style={{ color: "#334155" }}>[{l.time}] </span>
          <span style={{ color: l.type === "success" ? "#10b981" : l.type === "error" ? "#ef4444" : l.type === "ai" ? "#818cf8" : "#38bdf8" }}>{l.prefix} </span>
          <span style={{ color: "#cbd5e1" }}>{l.msg}</span>
        </div>
      ))}
    </div>
  );
};

export default function JobPilot() {
  const [tab, setTab] = useState("discover");
  const [searching, setSearching] = useState(false);
  const [jobs, setJobs] = useState([]);
  const [selectedJob, setSelectedJob] = useState(null);
  const [logs, setLogs] = useState([
    { time: "09:41:02", type: "info", prefix: "SYSTEM", msg: "JobPilot v2.0 ready. AI backend: Claude Sonnet 4." },
    { time: "09:41:03", type: "info", prefix: "CONFIG", msg: "Region: Gulf / GCC · Role: GenAI Architect" },
  ]);
  const [role, setRole] = useState("GenAI Architect");
  const [region, setRegion] = useState("Gulf / GCC");
  const [filterStatus, setFilterStatus] = useState("All");
  const [dragging, setDragging] = useState(null);

  const addLog = (type, prefix, msg) => {
    const now = new Date();
    const time = now.toTimeString().slice(0, 8);
    setLogs(l => [...l, { time, type, prefix, msg }]);
  };

  const runSearch = async () => {
    setSearching(true);
    setJobs([]);
    addLog("info", "SEARCH", `Starting discovery for "${role}" in ${region}...`);
    const boards = ["LinkedIn", "Wellfound", "Naukri", "Indeed", "Greenhouse"];
    for (let i = 0; i < boards.length; i++) {
      await new Promise(r => setTimeout(r, 400 + i * 200));
      addLog("info", "SCRAPE", `Scanning ${boards[i]}...`);
    }
    addLog("ai", "RANK-AI", "Scoring 23 results against CV profile...");
    await new Promise(r => setTimeout(r, 800));
    setJobs(JOBS);
    addLog("success", "DONE", `Found 6 ranked results. 2 strong matches flagged. ✓`);
    setSearching(false);
    setTab("results");
  };

  const filteredJobs = filterStatus === "All" ? jobs : jobs.filter(j => j.status === filterStatus);

  const updateStatus = (id, status) => {
    setJobs(j => j.map(job => job.id === id ? { ...job, status } : job));
    if (selectedJob?.id === id) setSelectedJob(s => ({ ...s, status }));
    addLog("success", "TRACK", `Job #${id} moved to "${status}"`);
  };

  const TABS = [
    { id: "discover", label: "Discover", icon: "◎" },
    { id: "results", label: "Results", icon: "≡", count: jobs.length || null },
    { id: "tracker", label: "Tracker", icon: "◈" },
    { id: "autofill", label: "Auto-Fill", icon: "✦" },
    { id: "settings", label: "Settings", icon: "⚙" },
  ];

  return (
    <div style={{ fontFamily: "'Sora', 'Plus Jakarta Sans', system-ui, sans-serif", background: "#070d1a", minHeight: "100vh", color: "#e2e8f0", display: "flex", flexDirection: "column" }}>
      <link href="https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet" />
      <style>{`
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #0f172a; }
        ::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 4px; }
        input, select { outline: none; }
        @keyframes pulse-dot { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.5;transform:scale(0.8)} }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes slideIn { from { opacity:0; transform:translateY(8px);} to {opacity:1;transform:translateY(0);} }
        @keyframes glow { 0%,100%{box-shadow:0 0 20px rgba(56,189,248,0.1)} 50%{box-shadow:0 0 40px rgba(56,189,248,0.25)} }
      `}</style>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", padding: "14px 28px", borderBottom: "1px solid #0f172a", background: "rgba(7,13,26,0.95)", backdropFilter: "blur(10px)", position: "sticky", top: 0, zIndex: 100, gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg, #0ea5e9, #818cf8)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>✦</div>
          <span style={{ fontWeight: 700, fontSize: 17, letterSpacing: "-0.02em" }}>Job<span style={{ color: "#38bdf8" }}>Pilot</span></span>
          <span style={{ fontSize: 11, color: "#334155", fontFamily: "monospace", background: "#0f172a", padding: "2px 8px", borderRadius: 4 }}>v2.0</span>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#64748b" }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#10b981", animation: "pulse-dot 2s infinite" }} />
          Claude Sonnet 4 · Active
        </div>
        <div style={{ width: 1, height: 20, background: "#1e293b" }} />
        <div style={{ fontSize: 12, color: "#64748b" }}>Zaid · TCS → GCC</div>
      </div>

      {/* Nav */}
      <div style={{ display: "flex", gap: 4, padding: "10px 28px 0", borderBottom: "1px solid #0f172a" }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: "8px 8px 0 0", border: "none", cursor: "pointer", fontSize: 13, fontWeight: tab === t.id ? 600 : 400, background: tab === t.id ? "#0f172a" : "transparent", color: tab === t.id ? "#38bdf8" : "#64748b", borderBottom: tab === t.id ? "2px solid #38bdf8" : "2px solid transparent", transition: "all 0.2s", fontFamily: "inherit" }}>
            <span>{t.icon}</span> {t.label}
            {t.count && <span style={{ background: "#38bdf8", color: "#020817", fontSize: 10, fontWeight: 700, borderRadius: 10, padding: "0 6px", lineHeight: "16px" }}>{t.count}</span>}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, padding: 28, maxWidth: 1100, width: "100%", margin: "0 auto" }}>

        {/* DISCOVER */}
        {tab === "discover" && (
          <div style={{ animation: "slideIn 0.3s ease" }}>
            <div style={{ marginBottom: 28 }}>
              <h2 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 6px", letterSpacing: "-0.03em" }}>Job Discovery <span style={{ color: "#38bdf8" }}>Agent</span></h2>
              <p style={{ color: "#64748b", fontSize: 14, margin: 0 }}>Configure your hunt. The agent scrapes 5 boards, deduplicates, and ranks against your profile.</p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
              {[
                { label: "Target Role", value: role, setter: setRole, placeholder: "e.g. GenAI Architect" },
                { label: "Region / Market", value: region, setter: setRegion, placeholder: "e.g. Gulf / GCC" },
              ].map(f => (
                <div key={f.label} style={{ background: "#0a1628", border: "1px solid #1e293b", borderRadius: 10, padding: "14px 18px" }}>
                  <label style={{ fontSize: 11, color: "#475569", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>{f.label}</label>
                  <input value={f.value} onChange={e => f.setter(e.target.value)} placeholder={f.placeholder} style={{ display: "block", width: "100%", background: "transparent", border: "none", color: "#e2e8f0", fontSize: 15, fontWeight: 500, marginTop: 6, fontFamily: "inherit" }} />
                </div>
              ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
              {[
                { label: "Company Filter", placeholder: "e.g. G42, ADNOC…" },
                { label: "Site Filter", placeholder: "e.g. greenhouse.io" },
                { label: "Date Posted", placeholder: "Last 7 days" },
              ].map(f => (
                <div key={f.label} style={{ background: "#0a1628", border: "1px solid #1e293b", borderRadius: 10, padding: "12px 16px" }}>
                  <label style={{ fontSize: 11, color: "#475569", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>{f.label}</label>
                  <input placeholder={f.placeholder} style={{ display: "block", width: "100%", background: "transparent", border: "none", color: "#64748b", fontSize: 13, marginTop: 4, fontFamily: "inherit" }} />
                </div>
              ))}
            </div>

            <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
              {["LinkedIn", "Wellfound", "Indeed", "Naukri", "Greenhouse"].map(b => (
                <div key={b} style={{ padding: "6px 14px", borderRadius: 20, background: "#0f172a", border: "1px solid #1e293b", fontSize: 12, color: "#38bdf8", cursor: "pointer" }}>✓ {b}</div>
              ))}
            </div>

            <button onClick={runSearch} disabled={searching} style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 32px", borderRadius: 10, border: "none", cursor: searching ? "not-allowed" : "pointer", background: searching ? "#1e293b" : "linear-gradient(135deg, #0ea5e9, #818cf8)", color: "#fff", fontWeight: 700, fontSize: 15, fontFamily: "inherit", animation: !searching ? "glow 3s infinite" : "none", transition: "all 0.3s" }}>
              {searching ? <><span style={{ width: 16, height: 16, border: "2px solid #38bdf8", borderTopColor: "transparent", borderRadius: "50%", display: "inline-block", animation: "spin 0.8s linear infinite" }} /> Searching...</> : <><span>◎</span> Launch Discovery Agent</>}
            </button>

            <div style={{ marginTop: 24 }}>
              <div style={{ fontSize: 12, color: "#475569", marginBottom: 8, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>Agent Log</div>
              <AgentLog logs={logs} />
            </div>
          </div>
        )}

        {/* RESULTS */}
        {tab === "results" && (
          <div style={{ animation: "slideIn 0.3s ease" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
              <div>
                <h2 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 4px", letterSpacing: "-0.03em" }}>Ranked <span style={{ color: "#38bdf8" }}>Results</span></h2>
                <p style={{ color: "#64748b", fontSize: 13, margin: 0 }}>{jobs.length} jobs · sorted by AI relevance score</p>
              </div>
              <div style={{ flex: 1 }} />
              <div style={{ display: "flex", gap: 6 }}>
                {["All", ...Object.keys(STATUS_COLORS)].map(s => (
                  <button key={s} onClick={() => setFilterStatus(s)} style={{ padding: "5px 12px", borderRadius: 20, border: "1px solid", borderColor: filterStatus === s ? "#38bdf8" : "#1e293b", background: filterStatus === s ? "rgba(56,189,248,0.1)" : "transparent", color: filterStatus === s ? "#38bdf8" : "#64748b", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>{s}</button>
                ))}
              </div>
            </div>

            {jobs.length === 0 ? (
              <div style={{ textAlign: "center", padding: 60, color: "#334155" }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>◎</div>
                <div>Run the Discovery Agent first</div>
                <button onClick={() => setTab("discover")} style={{ marginTop: 16, padding: "8px 20px", borderRadius: 8, border: "1px solid #1e293b", background: "transparent", color: "#38bdf8", cursor: "pointer", fontFamily: "inherit" }}>→ Go to Discover</button>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 16 }}>
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
                  {filteredJobs.map(job => (
                    <div key={job.id} onClick={() => setSelectedJob(job)} style={{ background: selectedJob?.id === job.id ? "#0a1628" : "#070d1a", border: `1px solid ${selectedJob?.id === job.id ? "#0369a1" : "#1e293b"}`, borderRadius: 12, padding: "14px 18px", cursor: "pointer", transition: "all 0.2s", animation: "slideIn 0.3s ease" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ width: 38, height: 38, borderRadius: 9, background: `${job.color}20`, border: `1px solid ${job.color}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: job.color, flexShrink: 0, fontFamily: "monospace" }}>{job.logo}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <span style={{ fontWeight: 600, fontSize: 14 }}>{job.title}</span>
                            {job.score >= 90 && <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 10, background: "rgba(16,185,129,0.15)", color: "#34d399", border: "1px solid #047857", fontWeight: 600 }}>★ STRONG MATCH</span>}
                            <Badge status={job.status} />
                          </div>
                          <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{job.company} · {job.location} · {job.posted}</div>
                        </div>
                        <div style={{ minWidth: 120 }}>
                          <ScoreBar score={job.score} />
                          <div style={{ fontSize: 11, color: "#475569", marginTop: 2, textAlign: "right" }}>{job.salary}</div>
                        </div>
                        <div style={{ fontSize: 11, color: "#475569", background: "#0f172a", padding: "3px 9px", borderRadius: 6, whiteSpace: "nowrap" }}>{job.source}</div>
                      </div>
                    </div>
                  ))}
                </div>

                {selectedJob && (
                  <div style={{ width: 300, flexShrink: 0, background: "#0a1628", border: "1px solid #1e293b", borderRadius: 12, padding: 20, height: "fit-content", animation: "slideIn 0.2s ease" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 16 }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 15 }}>{selectedJob.title}</div>
                        <div style={{ color: "#64748b", fontSize: 12, marginTop: 2 }}>{selectedJob.company}</div>
                      </div>
                      <button onClick={() => setSelectedJob(null)} style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: 18, padding: 0 }}>×</button>
                    </div>
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: 11, color: "#475569", marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>AI Match Analysis</div>
                      <div style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.6, background: "#070d1a", borderRadius: 8, padding: 12, borderLeft: "3px solid #818cf8" }}>{selectedJob.match}</div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
                      {[["Score", `${selectedJob.score}/100`], ["Location", selectedJob.location], ["Salary", selectedJob.salary], ["Source", selectedJob.source]].map(([k, v]) => (
                        <div key={k} style={{ background: "#070d1a", borderRadius: 8, padding: "8px 10px" }}>
                          <div style={{ fontSize: 10, color: "#475569", marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.06em" }}>{k}</div>
                          <div style={{ fontSize: 13, fontWeight: 500 }}>{v}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ fontSize: 11, color: "#475569", marginBottom: 8, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Move to</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
                      {Object.keys(STATUS_COLORS).map(s => (
                        <button key={s} onClick={() => updateStatus(selectedJob.id, s)} style={{ padding: "4px 10px", borderRadius: 12, border: `1px solid ${selectedJob.status === s ? STATUS_COLORS[s].border : "#1e293b"}`, background: selectedJob.status === s ? STATUS_COLORS[s].bg : "transparent", color: selectedJob.status === s ? STATUS_COLORS[s].text : "#64748b", fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: selectedJob.status === s ? 600 : 400 }}>{s}</button>
                      ))}
                    </div>
                    <button onClick={() => { setTab("autofill"); }} style={{ width: "100%", padding: "10px", borderRadius: 8, border: "none", background: "linear-gradient(135deg, #0ea5e9, #818cf8)", color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>✦ Auto-Fill Application</button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TRACKER */}
        {tab === "tracker" && (
          <div style={{ animation: "slideIn 0.3s ease" }}>
            <h2 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 20px", letterSpacing: "-0.03em" }}>Application <span style={{ color: "#38bdf8" }}>Tracker</span></h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10, marginBottom: 28 }}>
              {STATS.map(s => (
                <div key={s.label} style={{ background: "#0a1628", border: `1px solid ${s.color}30`, borderRadius: 12, padding: "16px 14px", textAlign: "center" }}>
                  <div style={{ fontSize: 28, fontWeight: 700, color: s.color, fontFamily: "monospace" }}>{s.value}</div>
                  <div style={{ fontSize: 11, color: "#64748b", marginTop: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>{s.label}</div>
                </div>
              ))}
            </div>

            <div style={{ background: "#0a1628", border: "1px solid #1e293b", borderRadius: 12, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #1e293b" }}>
                    {["Role", "Company", "Location", "Score", "Status", "Posted", "Actions"].map(h => (
                      <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 11, color: "#475569", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {JOBS.map((j, i) => (
                    <tr key={j.id} style={{ borderBottom: i < JOBS.length - 1 ? "1px solid #0f172a" : "none", transition: "background 0.15s" }}>
                      <td style={{ padding: "12px 16px", fontWeight: 500 }}>{j.title}</td>
                      <td style={{ padding: "12px 16px", color: "#94a3b8" }}>{j.company}</td>
                      <td style={{ padding: "12px 16px", color: "#64748b" }}>{j.location}</td>
                      <td style={{ padding: "12px 16px", width: 100 }}><ScoreBar score={j.score} /></td>
                      <td style={{ padding: "12px 16px" }}><Badge status={j.status} /></td>
                      <td style={{ padding: "12px 16px", color: "#475569", fontFamily: "monospace", fontSize: 11 }}>{j.posted}</td>
                      <td style={{ padding: "12px 16px" }}>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid #1e293b", background: "transparent", color: "#38bdf8", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>View</button>
                          <button style={{ padding: "4px 10px", borderRadius: 6, border: "none", background: "rgba(139,92,246,0.15)", color: "#a78bfa", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>Fill</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* AUTO-FILL */}
        {tab === "autofill" && (
          <div style={{ animation: "slideIn 0.3s ease" }}>
            <h2 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 6px", letterSpacing: "-0.03em" }}>Auto-Fill <span style={{ color: "#38bdf8" }}>Agent</span></h2>
            <p style={{ color: "#64748b", fontSize: 14, margin: "0 0 24px" }}>Upload your CV. The AI maps your profile to application form fields via Playwright automation.</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              <div>
                <div style={{ border: "2px dashed #1e293b", borderRadius: 12, padding: 32, textAlign: "center", marginBottom: 16, cursor: "pointer", transition: "border-color 0.2s" }}>
                  <div style={{ fontSize: 32, marginBottom: 12 }}>📄</div>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>Drop your CV here</div>
                  <div style={{ fontSize: 12, color: "#475569" }}>PDF or JSON resume · max 5MB</div>
                  <div style={{ marginTop: 16, padding: "8px 20px", borderRadius: 8, background: "#0f172a", border: "1px solid #1e293b", display: "inline-block", fontSize: 13, color: "#38bdf8", cursor: "pointer" }}>Browse Files</div>
                </div>
                <div style={{ background: "#0a1628", border: "1px solid #1e293b", borderRadius: 12, padding: 18 }}>
                  <div style={{ fontSize: 12, color: "#475569", fontWeight: 600, marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.06em" }}>Field Mapping Preview</div>
                  {[["Full Name", "Zaid M.", "✓"], ["Email", "zaid@example.com", "✓"], ["Experience", "5+ yrs GenAI", "✓"], ["Skills", "LangChain, Azure, RAG", "✓"], ["Location", "Lucknow, India", "⚠ check"], ["Salary", "Not in CV", "✗ manual"]].map(([field, val, st]) => (
                    <div key={field} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid #0f172a" }}>
                      <span style={{ color: st === "✓" ? "#10b981" : st === "⚠ check" ? "#f59e0b" : "#ef4444", width: 14, fontSize: 12 }}>{st}</span>
                      <span style={{ fontSize: 12, color: "#64748b", width: 90 }}>{field}</span>
                      <span style={{ fontSize: 12, color: "#94a3b8" }}>{val}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div style={{ background: "#0a1628", border: "1px solid #1e293b", borderRadius: 12, padding: 18, marginBottom: 16 }}>
                  <div style={{ fontSize: 12, color: "#475569", fontWeight: 600, marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.06em" }}>Target Application</div>
                  <input placeholder="Paste job URL or select from results..." style={{ width: "100%", background: "#070d1a", border: "1px solid #1e293b", borderRadius: 8, padding: "10px 14px", color: "#e2e8f0", fontSize: 13, fontFamily: "inherit" }} />
                  <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                    <button style={{ flex: 1, padding: "10px", borderRadius: 8, border: "none", background: "linear-gradient(135deg, #0ea5e9, #818cf8)", color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>▶ Start Auto-Fill</button>
                    <button style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid #1e293b", background: "transparent", color: "#64748b", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Preview</button>
                  </div>
                </div>
                <div style={{ background: "#0a1628", border: "1px solid #1e293b", borderRadius: 12, padding: 18 }}>
                  <div style={{ fontSize: 12, color: "#475569", fontWeight: 600, marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.06em" }}>Automation Mode</div>
                  {[["Review Before Submit", "AI fills, you approve each section", true], ["Full Auto", "AI fills and submits (risky)", false], ["Stealth Mode", "Human-like delays + mouse moves", true]].map(([name, desc, on]) => (
                    <div key={name} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                      <div style={{ width: 36, height: 20, borderRadius: 10, background: on ? "#0ea5e9" : "#1e293b", position: "relative", cursor: "pointer", flexShrink: 0 }}>
                        <div style={{ width: 14, height: 14, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: on ? 19 : 3, transition: "left 0.2s" }} />
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{name}</div>
                        <div style={{ fontSize: 11, color: "#475569" }}>{desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SETTINGS */}
        {tab === "settings" && (
          <div style={{ animation: "slideIn 0.3s ease" }}>
            <h2 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 24px", letterSpacing: "-0.03em" }}>Configuration <span style={{ color: "#38bdf8" }}>& Settings</span></h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              <div style={{ background: "#0a1628", border: "1px solid #1e293b", borderRadius: 12, padding: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16, color: "#94a3b8" }}>AI Backend</div>
                {[["Claude (Anthropic)", "claude-sonnet-4-20250514", true], ["OpenAI", "gpt-4o", false], ["Ollama (Local)", "qwen2.5-coder:7b", false], ["MCP Server", "custom endpoint", false]].map(([name, model, active]) => (
                  <div key={name} onClick={() => {}} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 8, marginBottom: 6, background: active ? "rgba(56,189,248,0.08)" : "transparent", border: `1px solid ${active ? "#0369a1" : "#0f172a"}`, cursor: "pointer" }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: active ? "#10b981" : "#334155", flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: active ? 600 : 400, color: active ? "#e2e8f0" : "#64748b" }}>{name}</div>
                      <div style={{ fontSize: 11, color: "#334155", fontFamily: "monospace" }}>{model}</div>
                    </div>
                    {active && <span style={{ fontSize: 11, color: "#38bdf8" }}>Active</span>}
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{ background: "#0a1628", border: "1px solid #1e293b", borderRadius: 12, padding: 20 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14, color: "#94a3b8" }}>Profile</div>
                  {[["Name", "Zaid M."], ["Current Role", "GenAI Architect @ TCS"], ["Target Market", "Gulf / GCC"], ["Years of Exp.", "5+"]].map(([k, v]) => (
                    <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid #0f172a", fontSize: 13 }}>
                      <span style={{ color: "#475569" }}>{k}</span><span style={{ color: "#94a3b8" }}>{v}</span>
                    </div>
                  ))}
                </div>
                <div style={{ background: "#0a1628", border: "1px solid #1e293b", borderRadius: 12, padding: 20 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14, color: "#94a3b8" }}>Automation</div>
                  {[["Playwright Headless", true], ["Human-like Delays", true], ["Auto-track on Apply", true], ["Email Notifications", false]].map(([label, on]) => (
                    <div key={label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                      <span style={{ fontSize: 13, color: "#94a3b8" }}>{label}</span>
                      <div style={{ width: 36, height: 20, borderRadius: 10, background: on ? "#0ea5e9" : "#1e293b", position: "relative", cursor: "pointer" }}>
                        <div style={{ width: 14, height: 14, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: on ? 19 : 3, transition: "left 0.2s" }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
