import { useState, useEffect, useRef } from "react";

const INITIAL_JOBS = [
  { id: 1, title: "GenAI Architect", company: "G42", location: "Abu Dhabi, UAE", salary: "$140K–180K", posted: "2h ago", source: "LinkedIn", score: 97, match: "Strong CV match on LangChain, Azure OpenAI, RAG pipelines. Team lead exp. aligns.", status: "Saved", logo: "G4", color: "#0ea5e9" },
  { id: 2, title: "Senior AI Engineer", company: "ADNOC Digital", location: "Dubai, UAE", salary: "$120K–150K", posted: "5h ago", source: "Wellfound", score: 91, match: "BFSI domain + multi-agent experience is a strong fit. Missing AWS Bedrock mention.", status: "Applied", logo: "AD", color: "#8b5cf6" },
  { id: 3, title: "LLM Systems Engineer", company: "Careem", location: "Dubai, UAE", salary: "Not listed", posted: "1d ago", source: "Indeed", score: 88, match: "Production RAG + Playwright automation aligns. Role is IC, not team lead.", status: "Discovered", logo: "CR", color: "#f59e0b" },
  { id: 4, title: "AI Platform Lead", company: "Presight", location: "Abu Dhabi, UAE", salary: "$160K–200K", posted: "2d ago", source: "LinkedIn", score: 85, match: "Strong leadership match. Requires security clearance — verify eligibility.", status: "Discovered", logo: "PS", color: "#10b981" },
  { id: 5, title: "GenAI Solutions Architect", company: "Microsoft Gulf", location: "Dubai, UAE", salary: "$130K–170K", posted: "3d ago", source: "Greenhouse", score: 82, match: "Azure stack aligns perfectly. 8+ yrs preferred — address in cover letter.", status: "Interview", logo: "MS", color: "#3b82f6" },
  { id: 6, title: "ML Engineer – NLP", company: "Noon.com", location: "Dubai, UAE", salary: "$90K–110K", posted: "4d ago", source: "Naukri", score: 71, match: "Partial match. Role skews more MLOps than GenAI architecture.", status: "Rejected", logo: "NC", color: "#ef4444" },
];

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  Discovered: { bg: "rgba(100,116,139,0.15)", text: "#94a3b8", border: "#334155" },
  Saved:      { bg: "rgba(14,165,233,0.12)",  text: "#38bdf8", border: "#0369a1" },
  Applied:    { bg: "rgba(139,92,246,0.15)",  text: "#a78bfa", border: "#6d28d9" },
  Interview:  { bg: "rgba(245,158,11,0.15)",  text: "#fbbf24", border: "#b45309" },
  Offer:      { bg: "rgba(16,185,129,0.15)",  text: "#34d399", border: "#047857" },
  Rejected:   { bg: "rgba(239,68,68,0.1)",    text: "#f87171", border: "#991b1b" },
};

type Job = typeof INITIAL_JOBS[0];
type LogEntry = { time: string; type: string; prefix: string; msg: string };

const ScoreBar = ({ score }: { score: number }) => {
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

const Badge = ({ status }: { status: string }) => {
  const s = STATUS_COLORS[status] || STATUS_COLORS.Discovered;
  return (
    <span style={{ padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, background: s.bg, color: s.text, border: `1px solid ${s.border}`, letterSpacing: "0.04em", whiteSpace: "nowrap" }}>
      {status}
    </span>
  );
};

const AgentLog = ({ logs }: { logs: LogEntry[] }) => {
  const ref = useRef<HTMLDivElement>(null);
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

const Toggle = ({ on, onChange }: { on: boolean; onChange: () => void }) => (
  <div
    onClick={onChange}
    style={{ width: 36, height: 20, borderRadius: 10, background: on ? "#0ea5e9" : "#1e293b", position: "relative", cursor: "pointer", flexShrink: 0, transition: "background 0.2s" }}
  >
    <div style={{ width: 14, height: 14, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: on ? 19 : 3, transition: "left 0.2s" }} />
  </div>
);

export default function JobPilot() {
  const [tab, setTab] = useState("discover");
  const [searching, setSearching] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([
    { time: "09:41:02", type: "info", prefix: "SYSTEM", msg: "JobPilot v2.0 ready. AI backend: Claude Sonnet 4." },
    { time: "09:41:03", type: "info", prefix: "CONFIG", msg: "Region: Gulf / GCC · Role: GenAI Architect" },
  ]);
  const [role, setRole] = useState("GenAI Architect");
  const [region, setRegion] = useState("Gulf / GCC");
  const [companyFilter, setCompanyFilter] = useState("");
  const [siteFilter, setSiteFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("Last 7 days");
  const [filterStatus, setFilterStatus] = useState("All");
  const [activeBoards, setActiveBoards] = useState(["LinkedIn", "Wellfound", "Indeed", "Naukri", "Greenhouse"]);
  const [selectedAI, setSelectedAI] = useState("Claude (Anthropic)");
  const [targetUrl, setTargetUrl] = useState("");
  const [autofillRunning, setAutofillRunning] = useState(false);
  const [autofillDone, setAutofillDone] = useState(false);
  const [selectedAutofillJob, setSelectedAutofillJob] = useState<Job | null>(null);
  const [automationModes, setAutomationModes] = useState({
    "Review Before Submit": true,
    "Full Auto": false,
    "Stealth Mode": true,
  });
  const [automation, setAutomation] = useState({
    "Playwright Headless": true,
    "Human-like Delays": true,
    "Auto-track on Apply": true,
    "Email Notifications": false,
  });
  const [profile, setProfile] = useState({
    Name: "Zaid M.",
    "Current Role": "GenAI Architect @ TCS",
    "Target Market": "Gulf / GCC",
    "Years of Exp.": "5+",
  });
  const [trackerJobs, setTrackerJobs] = useState(INITIAL_JOBS);
  const [cvUploaded, setCvUploaded] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addLog = (type: string, prefix: string, msg: string) => {
    const now = new Date();
    const time = now.toTimeString().slice(0, 8);
    setLogs(l => [...l, { time, type, prefix, msg }]);
  };

  const toggleBoard = (board: string) => {
    setActiveBoards(prev =>
      prev.includes(board) ? prev.filter(b => b !== board) : [...prev, board]
    );
  };

  const runSearch = async () => {
    if (activeBoards.length === 0) {
      addLog("error", "ERROR", "Select at least one job board before searching.");
      return;
    }
    setSearching(true);
    setJobs([]);
    setSelectedJob(null);
    addLog("info", "SEARCH", `Starting discovery for "${role}" in ${region}...`);
    if (companyFilter) addLog("info", "FILTER", `Company filter: ${companyFilter}`);
    if (siteFilter) addLog("info", "FILTER", `Site filter: ${siteFilter}`);
    addLog("info", "FILTER", `Date range: ${dateFilter}`);
    for (let i = 0; i < activeBoards.length; i++) {
      await new Promise(r => setTimeout(r, 400 + i * 200));
      addLog("info", "SCRAPE", `Scanning ${activeBoards[i]}... found ${Math.floor(Math.random() * 8) + 3} listings`);
    }
    addLog("ai", "RANK-AI", "Deduplicating results across boards...");
    await new Promise(r => setTimeout(r, 500));
    addLog("ai", "RANK-AI", `Scoring ${activeBoards.length * 5} results against CV profile...`);
    await new Promise(r => setTimeout(r, 800));
    const filtered = INITIAL_JOBS.filter(j =>
      (!companyFilter || j.company.toLowerCase().includes(companyFilter.toLowerCase())) &&
      (!siteFilter || j.source.toLowerCase().includes(siteFilter.toLowerCase()))
    );
    setJobs(filtered.length > 0 ? filtered : INITIAL_JOBS);
    const count = filtered.length > 0 ? filtered.length : INITIAL_JOBS.length;
    const strongCount = (filtered.length > 0 ? filtered : INITIAL_JOBS).filter(j => j.score >= 90).length;
    addLog("success", "DONE", `Found ${count} ranked results. ${strongCount} strong match${strongCount !== 1 ? "es" : ""} flagged. ✓`);
    setSearching(false);
    setTab("results");
  };

  const filteredJobs = filterStatus === "All" ? jobs : jobs.filter(j => j.status === filterStatus);

  const updateStatus = (id: number, status: string) => {
    setJobs(j => j.map(job => job.id === id ? { ...job, status } : job));
    setTrackerJobs(j => j.map(job => job.id === id ? { ...job, status } : job));
    if (selectedJob?.id === id) setSelectedJob(s => s ? { ...s, status } : s);
    addLog("success", "TRACK", `Job #${id} moved to "${status}"`);
  };

  const computedStats = Object.keys(STATUS_COLORS).map(label => ({
    label,
    value: trackerJobs.filter(j => j.status === label).length,
    color: label === "Discovered" ? "#64748b" : label === "Saved" ? "#0ea5e9" : label === "Applied" ? "#8b5cf6" : label === "Interview" ? "#f59e0b" : label === "Offer" ? "#10b981" : "#ef4444",
  }));

  const runAutofill = async () => {
    setAutofillRunning(true);
    setAutofillDone(false);
    addLog("info", "AUTO-FILL", `Starting auto-fill for: ${targetUrl || selectedAutofillJob?.title || "selected job"}...`);
    await new Promise(r => setTimeout(r, 600));
    addLog("ai", "PARSE-CV", "Parsing CV fields...");
    await new Promise(r => setTimeout(r, 500));
    addLog("info", "NAVIGATE", "Opening application form...");
    await new Promise(r => setTimeout(r, 700));
    addLog("ai", "MAP", "Mapping fields: Full Name → ✓, Email → ✓, Experience → ✓");
    await new Promise(r => setTimeout(r, 400));
    addLog("ai", "MAP", "Mapping fields: Skills → ✓, Location → ⚠ check, Salary → ✗ manual");
    await new Promise(r => setTimeout(r, 600));
    if (automationModes["Review Before Submit"]) {
      addLog("info", "REVIEW", "Pausing for review — Review Before Submit mode active.");
    } else {
      addLog("ai", "SUBMIT", "Submitting application...");
      await new Promise(r => setTimeout(r, 500));
    }
    addLog("success", "DONE", "Auto-fill complete. Check form before submitting. ✓");
    setAutofillRunning(false);
    setAutofillDone(true);
    if (selectedAutofillJob) {
      updateStatus(selectedAutofillJob.id, "Applied");
    }
  };

  const TABS = [
    { id: "discover", label: "Discover", icon: "◎" },
    { id: "results", label: "Results", icon: "≡", count: jobs.length || null },
    { id: "tracker", label: "Tracker", icon: "◈" },
    { id: "autofill", label: "Auto-Fill", icon: "✦" },
    { id: "settings", label: "Settings", icon: "⚙" },
  ];

  const AI_BACKENDS = [
    { name: "Claude (Anthropic)", model: "claude-sonnet-4-20250514" },
    { name: "OpenAI", model: "gpt-4o" },
    { name: "Ollama (Local)", model: "qwen2.5-coder:7b" },
    { name: "MCP Server", model: "custom endpoint" },
  ];

  const FIELD_MAPPING = [
    ["Full Name", "Zaid M.", "✓"],
    ["Email", "zaid@example.com", "✓"],
    ["Experience", "5+ yrs GenAI", "✓"],
    ["Skills", "LangChain, Azure, RAG", "✓"],
    ["Location", "Lucknow, India", "⚠ check"],
    ["Salary", "Not in CV", "✗ manual"],
  ];

  return (
    <div style={{ fontFamily: "'Sora', 'Plus Jakarta Sans', system-ui, sans-serif", background: "#070d1a", minHeight: "100vh", color: "#e2e8f0", display: "flex", flexDirection: "column" }}>

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
          {selectedAI === "Claude (Anthropic)" ? "Claude Sonnet 4" : selectedAI} · Active
        </div>
        <div style={{ width: 1, height: 20, background: "#1e293b" }} />
        <div style={{ fontSize: 12, color: "#64748b" }}>{profile.Name} · TCS → GCC</div>
      </div>

      {/* Nav */}
      <div style={{ display: "flex", gap: 4, padding: "10px 28px 0", borderBottom: "1px solid #0f172a", overflowX: "auto" }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: "8px 8px 0 0", border: "none", cursor: "pointer", fontSize: 13, fontWeight: tab === t.id ? 600 : 400, background: tab === t.id ? "#0f172a" : "transparent", color: tab === t.id ? "#38bdf8" : "#64748b", borderBottom: tab === t.id ? "2px solid #38bdf8" : "2px solid transparent", transition: "all 0.2s", fontFamily: "inherit", whiteSpace: "nowrap" }}
          >
            <span>{t.icon}</span> {t.label}
            {t.count ? <span style={{ background: "#38bdf8", color: "#020817", fontSize: 10, fontWeight: 700, borderRadius: 10, padding: "0 6px", lineHeight: "16px" }}>{t.count}</span> : null}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, padding: 28, maxWidth: 1100, width: "100%", margin: "0 auto" }}>

        {/* ─── DISCOVER ─── */}
        {tab === "discover" && (
          <div style={{ animation: "slideIn 0.3s ease" }}>
            <div style={{ marginBottom: 28 }}>
              <h2 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 6px", letterSpacing: "-0.03em" }}>Job Discovery <span style={{ color: "#38bdf8" }}>Agent</span></h2>
              <p style={{ color: "#64748b", fontSize: 14, margin: 0 }}>Configure your hunt. The agent scrapes {activeBoards.length} board{activeBoards.length !== 1 ? "s" : ""}, deduplicates, and ranks against your profile.</p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
              {[
                { label: "Target Role", value: role, setter: setRole, placeholder: "e.g. GenAI Architect" },
                { label: "Region / Market", value: region, setter: setRegion, placeholder: "e.g. Gulf / GCC" },
              ].map(f => (
                <div key={f.label} style={{ background: "#0a1628", border: "1px solid #1e293b", borderRadius: 10, padding: "14px 18px" }}>
                  <label style={{ fontSize: 11, color: "#475569", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" as const }}>{f.label}</label>
                  <input
                    value={f.value}
                    onChange={e => f.setter(e.target.value)}
                    placeholder={f.placeholder}
                    style={{ display: "block", width: "100%", background: "transparent", border: "none", color: "#e2e8f0", fontSize: 15, fontWeight: 500, marginTop: 6, fontFamily: "inherit" }}
                  />
                </div>
              ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
              <div style={{ background: "#0a1628", border: "1px solid #1e293b", borderRadius: 10, padding: "12px 16px" }}>
                <label style={{ fontSize: 11, color: "#475569", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" as const }}>Company Filter</label>
                <input value={companyFilter} onChange={e => setCompanyFilter(e.target.value)} placeholder="e.g. G42, ADNOC…" style={{ display: "block", width: "100%", background: "transparent", border: "none", color: "#94a3b8", fontSize: 13, marginTop: 4, fontFamily: "inherit" }} />
              </div>
              <div style={{ background: "#0a1628", border: "1px solid #1e293b", borderRadius: 10, padding: "12px 16px" }}>
                <label style={{ fontSize: 11, color: "#475569", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" as const }}>Site Filter</label>
                <input value={siteFilter} onChange={e => setSiteFilter(e.target.value)} placeholder="e.g. greenhouse.io" style={{ display: "block", width: "100%", background: "transparent", border: "none", color: "#94a3b8", fontSize: 13, marginTop: 4, fontFamily: "inherit" }} />
              </div>
              <div style={{ background: "#0a1628", border: "1px solid #1e293b", borderRadius: 10, padding: "12px 16px" }}>
                <label style={{ fontSize: 11, color: "#475569", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" as const }}>Date Posted</label>
                <select value={dateFilter} onChange={e => setDateFilter(e.target.value)} style={{ display: "block", width: "100%", background: "transparent", border: "none", color: "#94a3b8", fontSize: 13, marginTop: 4, fontFamily: "inherit" }}>
                  {["Last 24 hours", "Last 7 days", "Last 14 days", "Last 30 days"].map(o => <option key={o} value={o} style={{ background: "#0a1628" }}>{o}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginBottom: 24, flexWrap: "wrap" as const }}>
              {["LinkedIn", "Wellfound", "Indeed", "Naukri", "Greenhouse"].map(b => {
                const active = activeBoards.includes(b);
                return (
                  <div
                    key={b}
                    onClick={() => toggleBoard(b)}
                    style={{ padding: "6px 14px", borderRadius: 20, background: active ? "rgba(56,189,248,0.1)" : "#0f172a", border: `1px solid ${active ? "#0369a1" : "#1e293b"}`, fontSize: 12, color: active ? "#38bdf8" : "#475569", cursor: "pointer", transition: "all 0.2s", userSelect: "none" as const }}
                  >
                    {active ? "✓" : "○"} {b}
                  </div>
                );
              })}
            </div>

            <button
              onClick={runSearch}
              disabled={searching}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 32px", borderRadius: 10, border: "none", cursor: searching ? "not-allowed" : "pointer", background: searching ? "#1e293b" : "linear-gradient(135deg, #0ea5e9, #818cf8)", color: "#fff", fontWeight: 700, fontSize: 15, fontFamily: "inherit", animation: !searching ? "glow 3s infinite" : "none", transition: "all 0.3s" }}
            >
              {searching
                ? <><span style={{ width: 16, height: 16, border: "2px solid #38bdf8", borderTopColor: "transparent", borderRadius: "50%", display: "inline-block", animation: "spin 0.8s linear infinite" }} /> Searching...</>
                : <><span>◎</span> Launch Discovery Agent</>
              }
            </button>

            <div style={{ marginTop: 24 }}>
              <div style={{ fontSize: 12, color: "#475569", marginBottom: 8, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" as const }}>Agent Log</div>
              <AgentLog logs={logs} />
            </div>
          </div>
        )}

        {/* ─── RESULTS ─── */}
        {tab === "results" && (
          <div style={{ animation: "slideIn 0.3s ease" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20, flexWrap: "wrap" as const }}>
              <div>
                <h2 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 4px", letterSpacing: "-0.03em" }}>Ranked <span style={{ color: "#38bdf8" }}>Results</span></h2>
                <p style={{ color: "#64748b", fontSize: 13, margin: 0 }}>{jobs.length} job{jobs.length !== 1 ? "s" : ""} · sorted by AI relevance score</p>
              </div>
              <div style={{ flex: 1 }} />
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const }}>
                {["All", ...Object.keys(STATUS_COLORS)].map(s => (
                  <button
                    key={s}
                    onClick={() => setFilterStatus(s)}
                    style={{ padding: "5px 12px", borderRadius: 20, border: "1px solid", borderColor: filterStatus === s ? "#38bdf8" : "#1e293b", background: filterStatus === s ? "rgba(56,189,248,0.1)" : "transparent", color: filterStatus === s ? "#38bdf8" : "#64748b", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {jobs.length === 0 ? (
              <div style={{ textAlign: "center", padding: 60, color: "#334155" }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>◎</div>
                <div style={{ marginBottom: 8 }}>Run the Discovery Agent first</div>
                <button onClick={() => setTab("discover")} style={{ marginTop: 8, padding: "8px 20px", borderRadius: 8, border: "1px solid #1e293b", background: "transparent", color: "#38bdf8", cursor: "pointer", fontFamily: "inherit" }}>→ Go to Discover</button>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 16 }}>
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
                  {filteredJobs.length === 0 ? (
                    <div style={{ textAlign: "center", padding: 40, color: "#334155", background: "#0a1628", borderRadius: 12, border: "1px solid #1e293b" }}>
                      No jobs with status "{filterStatus}"
                    </div>
                  ) : filteredJobs.map(job => (
                    <div
                      key={job.id}
                      onClick={() => setSelectedJob(job)}
                      style={{ background: selectedJob?.id === job.id ? "#0a1628" : "#070d1a", border: `1px solid ${selectedJob?.id === job.id ? "#0369a1" : "#1e293b"}`, borderRadius: 12, padding: "14px 18px", cursor: "pointer", transition: "all 0.2s", animation: "slideIn 0.3s ease" }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ width: 38, height: 38, borderRadius: 9, background: `${job.color}20`, border: `1px solid ${job.color}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: job.color, flexShrink: 0, fontFamily: "monospace" }}>{job.logo}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" as const }}>
                            <span style={{ fontWeight: 600, fontSize: 14 }}>{job.title}</span>
                            {job.score >= 90 && <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 10, background: "rgba(16,185,129,0.15)", color: "#34d399", border: "1px solid #047857", fontWeight: 600 }}>★ STRONG MATCH</span>}
                            <Badge status={job.status} />
                          </div>
                          <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{job.company} · {job.location} · {job.posted}</div>
                        </div>
                        <div style={{ minWidth: 120 }}>
                          <ScoreBar score={job.score} />
                          <div style={{ fontSize: 11, color: "#475569", marginTop: 2, textAlign: "right" as const }}>{job.salary}</div>
                        </div>
                        <div style={{ fontSize: 11, color: "#475569", background: "#0f172a", padding: "3px 9px", borderRadius: 6, whiteSpace: "nowrap" as const }}>{job.source}</div>
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
                      <button onClick={() => setSelectedJob(null)} style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: 18, padding: 0, lineHeight: 1 }}>×</button>
                    </div>
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: 11, color: "#475569", marginBottom: 6, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>AI Match Analysis</div>
                      <div style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.6, background: "#070d1a", borderRadius: 8, padding: 12, borderLeft: "3px solid #818cf8" }}>{selectedJob.match}</div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
                      {[["Score", `${selectedJob.score}/100`], ["Location", selectedJob.location], ["Salary", selectedJob.salary], ["Source", selectedJob.source]].map(([k, v]) => (
                        <div key={k} style={{ background: "#070d1a", borderRadius: 8, padding: "8px 10px" }}>
                          <div style={{ fontSize: 10, color: "#475569", marginBottom: 2, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>{k}</div>
                          <div style={{ fontSize: 13, fontWeight: 500 }}>{v}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ fontSize: 11, color: "#475569", marginBottom: 8, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>Move to</div>
                    <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 6, marginBottom: 14 }}>
                      {Object.keys(STATUS_COLORS).map(s => (
                        <button
                          key={s}
                          onClick={() => updateStatus(selectedJob.id, s)}
                          style={{ padding: "4px 10px", borderRadius: 12, border: `1px solid ${selectedJob.status === s ? STATUS_COLORS[s].border : "#1e293b"}`, background: selectedJob.status === s ? STATUS_COLORS[s].bg : "transparent", color: selectedJob.status === s ? STATUS_COLORS[s].text : "#64748b", fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: selectedJob.status === s ? 600 : 400 }}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={() => {
                        setSelectedAutofillJob(selectedJob);
                        setTargetUrl(`https://apply.${selectedJob.company.toLowerCase().replace(/\s/g, "")}.com/jobs/${selectedJob.id}`);
                        setTab("autofill");
                      }}
                      style={{ width: "100%", padding: "10px", borderRadius: 8, border: "none", background: "linear-gradient(135deg, #0ea5e9, #818cf8)", color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}
                    >
                      ✦ Auto-Fill Application
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ─── TRACKER ─── */}
        {tab === "tracker" && (
          <div style={{ animation: "slideIn 0.3s ease" }}>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 20 }}>
              <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: "-0.03em" }}>Application <span style={{ color: "#38bdf8" }}>Tracker</span></h2>
              <div style={{ flex: 1 }} />
              <div style={{ fontSize: 12, color: "#475569" }}>{trackerJobs.length} total applications</div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10, marginBottom: 28 }}>
              {computedStats.map(s => (
                <div key={s.label} style={{ background: "#0a1628", border: `1px solid ${s.color}30`, borderRadius: 12, padding: "16px 14px", textAlign: "center" as const }}>
                  <div style={{ fontSize: 28, fontWeight: 700, color: s.color, fontFamily: "monospace" }}>{s.value}</div>
                  <div style={{ fontSize: 11, color: "#64748b", marginTop: 4, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>{s.label}</div>
                </div>
              ))}
            </div>

            <div style={{ background: "#0a1628", border: "1px solid #1e293b", borderRadius: 12, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" as const, fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #1e293b" }}>
                    {["Role", "Company", "Location", "Score", "Status", "Posted", "Actions"].map(h => (
                      <th key={h} style={{ padding: "10px 16px", textAlign: "left" as const, fontSize: 11, color: "#475569", fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {trackerJobs.map((j, i) => (
                    <tr
                      key={j.id}
                      style={{ borderBottom: i < trackerJobs.length - 1 ? "1px solid #0f172a" : "none", transition: "background 0.15s" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "#0d1f38")}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                    >
                      <td style={{ padding: "12px 16px", fontWeight: 500 }}>{j.title}</td>
                      <td style={{ padding: "12px 16px", color: "#94a3b8" }}>{j.company}</td>
                      <td style={{ padding: "12px 16px", color: "#64748b" }}>{j.location}</td>
                      <td style={{ padding: "12px 16px", width: 100 }}><ScoreBar score={j.score} /></td>
                      <td style={{ padding: "12px 16px" }}><Badge status={j.status} /></td>
                      <td style={{ padding: "12px 16px", color: "#475569", fontFamily: "monospace", fontSize: 11 }}>{j.posted}</td>
                      <td style={{ padding: "12px 16px" }}>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button
                            onClick={() => { setSelectedJob(j); setFilterStatus("All"); setTab("results"); if (jobs.length === 0) setJobs(INITIAL_JOBS); }}
                            style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid #1e293b", background: "transparent", color: "#38bdf8", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}
                          >
                            View
                          </button>
                          <button
                            onClick={() => { setSelectedAutofillJob(j); setTargetUrl(`https://apply.${j.company.toLowerCase().replace(/\s/g, "")}.com/jobs/${j.id}`); setTab("autofill"); }}
                            style={{ padding: "4px 10px", borderRadius: 6, border: "none", background: "rgba(139,92,246,0.15)", color: "#a78bfa", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}
                          >
                            Fill
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ─── AUTO-FILL ─── */}
        {tab === "autofill" && (
          <div style={{ animation: "slideIn 0.3s ease" }}>
            <h2 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 6px", letterSpacing: "-0.03em" }}>Auto-Fill <span style={{ color: "#38bdf8" }}>Agent</span></h2>
            <p style={{ color: "#64748b", fontSize: 14, margin: "0 0 24px" }}>Upload your CV. The AI maps your profile to application form fields via Playwright automation.</p>

            {selectedAutofillJob && (
              <div style={{ background: "rgba(56,189,248,0.08)", border: "1px solid #0369a1", borderRadius: 10, padding: "12px 16px", marginBottom: 20, display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 32, height: 32, borderRadius: 7, background: `${selectedAutofillJob.color}20`, border: `1px solid ${selectedAutofillJob.color}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: selectedAutofillJob.color, fontFamily: "monospace" }}>{selectedAutofillJob.logo}</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{selectedAutofillJob.title} — {selectedAutofillJob.company}</div>
                  <div style={{ fontSize: 11, color: "#64748b" }}>Pre-selected from results</div>
                </div>
                <button onClick={() => { setSelectedAutofillJob(null); setTargetUrl(""); }} style={{ marginLeft: "auto", background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: 16 }}>×</button>
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              <div>
                <input type="file" ref={fileInputRef} accept=".pdf,.json" style={{ display: "none" }} onChange={() => setCvUploaded(true)} />
                <div
                  onClick={() => fileInputRef.current?.click()}
                  style={{ border: `2px dashed ${cvUploaded ? "#0369a1" : "#1e293b"}`, borderRadius: 12, padding: 32, textAlign: "center" as const, marginBottom: 16, cursor: "pointer", transition: "border-color 0.2s", background: cvUploaded ? "rgba(14,165,233,0.04)" : "transparent" }}
                >
                  <div style={{ fontSize: 32, marginBottom: 12 }}>{cvUploaded ? "✅" : "📄"}</div>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>{cvUploaded ? "CV Loaded — zaid_resume.pdf" : "Drop your CV here"}</div>
                  <div style={{ fontSize: 12, color: "#475569" }}>{cvUploaded ? "Click to replace" : "PDF or JSON resume · max 5MB"}</div>
                  {!cvUploaded && <div style={{ marginTop: 16, padding: "8px 20px", borderRadius: 8, background: "#0f172a", border: "1px solid #1e293b", display: "inline-block", fontSize: 13, color: "#38bdf8", cursor: "pointer" }}>Browse Files</div>}
                </div>

                <div style={{ background: "#0a1628", border: "1px solid #1e293b", borderRadius: 12, padding: 18 }}>
                  <div style={{ fontSize: 12, color: "#475569", fontWeight: 600, marginBottom: 12, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>Field Mapping Preview</div>
                  {FIELD_MAPPING.map(([field, val, st]) => (
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
                  <div style={{ fontSize: 12, color: "#475569", fontWeight: 600, marginBottom: 12, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>Target Application</div>
                  <input
                    value={targetUrl}
                    onChange={e => setTargetUrl(e.target.value)}
                    placeholder="Paste job URL or select from results..."
                    style={{ width: "100%", background: "#070d1a", border: "1px solid #1e293b", borderRadius: 8, padding: "10px 14px", color: "#e2e8f0", fontSize: 13, fontFamily: "inherit" }}
                  />
                  {autofillDone && (
                    <div style={{ marginTop: 10, padding: "8px 12px", background: "rgba(16,185,129,0.1)", border: "1px solid #047857", borderRadius: 8, fontSize: 12, color: "#34d399" }}>
                      ✓ Auto-fill complete — review form before submitting
                    </div>
                  )}
                  <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                    <button
                      onClick={runAutofill}
                      disabled={autofillRunning || (!targetUrl && !selectedAutofillJob)}
                      style={{ flex: 1, padding: "10px", borderRadius: 8, border: "none", background: autofillRunning || (!targetUrl && !selectedAutofillJob) ? "#1e293b" : "linear-gradient(135deg, #0ea5e9, #818cf8)", color: autofillRunning || (!targetUrl && !selectedAutofillJob) ? "#475569" : "#fff", fontWeight: 600, fontSize: 13, cursor: autofillRunning || (!targetUrl && !selectedAutofillJob) ? "not-allowed" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
                    >
                      {autofillRunning
                        ? <><span style={{ width: 14, height: 14, border: "2px solid #38bdf8", borderTopColor: "transparent", borderRadius: "50%", display: "inline-block", animation: "spin 0.8s linear infinite" }} /> Filling...</>
                        : "▶ Start Auto-Fill"
                      }
                    </button>
                    <button style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid #1e293b", background: "transparent", color: "#64748b", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Preview</button>
                  </div>
                </div>

                <div style={{ background: "#0a1628", border: "1px solid #1e293b", borderRadius: 12, padding: 18, marginBottom: 16 }}>
                  <div style={{ fontSize: 12, color: "#475569", fontWeight: 600, marginBottom: 12, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>Automation Mode</div>
                  {(Object.entries(automationModes) as [string, boolean][]).map(([name, on]) => {
                    const descs: Record<string, string> = {
                      "Review Before Submit": "AI fills, you approve each section",
                      "Full Auto": "AI fills and submits (risky)",
                      "Stealth Mode": "Human-like delays + mouse moves",
                    };
                    return (
                      <div key={name} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                        <Toggle on={on} onChange={() => setAutomationModes(prev => ({ ...prev, [name]: !prev[name as keyof typeof automationModes] }))} />
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 500, color: on ? "#e2e8f0" : "#64748b" }}>{name}</div>
                          <div style={{ fontSize: 11, color: "#475569" }}>{descs[name]}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div style={{ background: "#0a1628", border: "1px solid #1e293b", borderRadius: 12, padding: 18 }}>
                  <div style={{ fontSize: 12, color: "#475569", fontWeight: 600, marginBottom: 10, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>Auto-Fill Log</div>
                  <AgentLog logs={logs.filter(l => ["AUTO-FILL", "PARSE-CV", "NAVIGATE", "MAP", "SUBMIT", "REVIEW", "DONE"].includes(l.prefix))} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── SETTINGS ─── */}
        {tab === "settings" && (
          <div style={{ animation: "slideIn 0.3s ease" }}>
            <h2 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 24px", letterSpacing: "-0.03em" }}>Configuration <span style={{ color: "#38bdf8" }}>& Settings</span></h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              <div style={{ background: "#0a1628", border: "1px solid #1e293b", borderRadius: 12, padding: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16, color: "#94a3b8" }}>AI Backend</div>
                {AI_BACKENDS.map(({ name, model }) => {
                  const active = selectedAI === name;
                  return (
                    <div
                      key={name}
                      onClick={() => { setSelectedAI(name); addLog("info", "CONFIG", `AI backend switched to ${name} (${model})`); }}
                      style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 8, marginBottom: 6, background: active ? "rgba(56,189,248,0.08)" : "transparent", border: `1px solid ${active ? "#0369a1" : "#0f172a"}`, cursor: "pointer", transition: "all 0.2s" }}
                    >
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: active ? "#10b981" : "#334155", flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: active ? 600 : 400, color: active ? "#e2e8f0" : "#64748b" }}>{name}</div>
                        <div style={{ fontSize: 11, color: "#334155", fontFamily: "monospace" }}>{model}</div>
                      </div>
                      {active && <span style={{ fontSize: 11, color: "#38bdf8" }}>Active</span>}
                    </div>
                  );
                })}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{ background: "#0a1628", border: "1px solid #1e293b", borderRadius: 12, padding: 20 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14, color: "#94a3b8" }}>Profile</div>
                  {(Object.entries(profile) as [string, string][]).map(([k, v]) => (
                    <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: "1px solid #0f172a", fontSize: 13, gap: 12 }}>
                      <span style={{ color: "#475569", flexShrink: 0 }}>{k}</span>
                      <input
                        value={v}
                        onChange={e => setProfile(prev => ({ ...prev, [k]: e.target.value }))}
                        style={{ background: "transparent", border: "none", color: "#94a3b8", fontSize: 13, textAlign: "right" as const, fontFamily: "inherit", flex: 1 }}
                      />
                    </div>
                  ))}
                </div>

                <div style={{ background: "#0a1628", border: "1px solid #1e293b", borderRadius: 12, padding: 20 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14, color: "#94a3b8" }}>Automation</div>
                  {(Object.entries(automation) as [string, boolean][]).map(([label, on]) => (
                    <div key={label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                      <span style={{ fontSize: 13, color: on ? "#94a3b8" : "#475569" }}>{label}</span>
                      <Toggle on={on} onChange={() => setAutomation(prev => ({ ...prev, [label]: !prev[label as keyof typeof automation] }))} />
                    </div>
                  ))}
                </div>

                <div style={{ background: "#0a1628", border: "1px solid #1e293b", borderRadius: 12, padding: 20 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14, color: "#94a3b8" }}>Discovery Stats</div>
                  {[
                    ["Total Searches", "12"],
                    ["Jobs Discovered", "247"],
                    ["Applications Filed", String(trackerJobs.filter(j => j.status === "Applied" || j.status === "Interview" || j.status === "Offer").length)],
                    ["Avg. Match Score", `${Math.round(trackerJobs.reduce((a, j) => a + j.score, 0) / trackerJobs.length)}/100`],
                  ].map(([k, v]) => (
                    <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid #0f172a", fontSize: 13 }}>
                      <span style={{ color: "#475569" }}>{k}</span>
                      <span style={{ color: "#38bdf8", fontFamily: "monospace", fontWeight: 600 }}>{v}</span>
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
