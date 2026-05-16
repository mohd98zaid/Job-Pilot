import { useState, useEffect, useRef } from "react";
import { 
  searchRealJobs, 
  scoreJobsWithAI, 
  dedupeJobsWithAI, 
  fetchPortals, 
  addPortal, 
  deletePortal, 
  getProfile, 
  saveProfile, 
  deleteJob, 
  clearAllJobs,
  getAllJobs,
  updateJobStatus,
  type CustomPortal, 
  type Job 
} from "../lib/ai-utils";


const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  Discovered: { bg: "rgba(100,116,139,0.15)", text: "#94a3b8", border: "#334155" },
  Saved:      { bg: "rgba(14,165,233,0.12)",  text: "#38bdf8", border: "#0369a1" },
  Applied:    { bg: "rgba(139,92,246,0.15)",  text: "#a78bfa", border: "#6d28d9" },
  Interview:  { bg: "rgba(245,158,11,0.15)",  text: "#fbbf24", border: "#b45309" },
  Offer:      { bg: "rgba(16,185,129,0.15)",  text: "#34d399", border: "#047857" },
  Rejected:   { bg: "rgba(239,68,68,0.1)",    text: "#f87171", border: "#991b1b" },
};

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
  const [tab, setTab] = useState("dashboard");
  const [searching, setSearching] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([
    { time: new Date().toTimeString().slice(0, 8), type: "info", prefix: "SYSTEM", msg: "JobPilot v2.0 ready. AI backend: Ollama (gpt-oss:120b-cloud)." },
  ]);
  const [role, setRole] = useState("");
  const [region, setRegion] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [siteFilter, setSiteFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("Last 7 days");
  const [filterStatus, setFilterStatus] = useState("All");
  const [activeBoards, setActiveBoards] = useState(["LinkedIn", "RemoteOK", "Arbeitnow", "AI Discovery"]);
  const [selectedAI, setSelectedAI] = useState("Ollama (Local)");
  const [aiBackends, setAiBackends] = useState([
    { name: "Claude (Anthropic)", model: "claude-sonnet-4-20250514", url: "https://api.anthropic.com/v1", apiKey: "" },
    { name: "OpenAI",             model: "gpt-4o",                   url: "https://api.openai.com/v1",  apiKey: "" },
    { name: "Ollama (Local)",     model: "gpt-oss:120b-cloud",       url: "http://localhost:11434",     apiKey: "" },
    { name: "MCP Server",         model: "custom",                   url: "",                           apiKey: "" },
  ]);
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
    Name: "",
    "Current Role": "",
    "Target Market": "",
    "Years of Exp.": "",
  });
  const [fieldMappings, setFieldMappings] = useState<[string, string, string][]>([
    ["Full Name", "...", "○"],
    ["Email", "...", "○"],
    ["Experience", "...", "○"],
  ]);
  const [trackerJobs, setTrackerJobs] = useState<Job[]>([]);
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [skills, setSkills] = useState<string[]>([]);
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

  useEffect(() => {
    // Load profile AND persisted jobs from backend on startup
    const loadInitialData = async () => {
      // 1. Load profile
      const data = await getProfile();
      if (data) {
        setProfile({
          Name: data.name || "User",
          "Current Role": data.currentRole || "Software Engineer",
          "Target Market": data.targetMarket || "Global",
          "Years of Exp.": data.yearsOfExperience || "5",
        });
        if (data.skills) setSkills(data.skills);
        if (data.aiBackends && data.aiBackends.length > 0) setAiBackends(data.aiBackends);
      }

      // 2. Load previously saved jobs (persists across refresh/restart)
      const saved = await getAllJobs();
      if (saved.length > 0) {
        setJobs(saved);
        setTrackerJobs(saved);
        addLog("success", "DB", `Loaded ${saved.length} saved job${saved.length !== 1 ? "s" : ""} from database`);
      }
    };
    loadInitialData();
  }, []);

  const runSearch = async () => {
    if (activeBoards.length === 0) {
      addLog("error", "ERROR", "Select at least one job board before searching.");
      return;
    }
    setSearching(true);
    // Do NOT wipe existing jobs — new results will be merged in
    setSelectedJob(null);
    addLog("info", "SEARCH", `Starting discovery for "${role}" in ${region}...`);
    if (companyFilter) addLog("info", "FILTER", `Company filter: ${companyFilter}`);
    if (siteFilter) addLog("info", "FILTER", `Site filter: ${siteFilter}`);
    addLog("info", "FILTER", `Date range: ${dateFilter}`);

    try {
      const results = await searchRealJobs(
        role,
        region,
        activeBoards,
        [], // customPortalIds (can be added later)
        dateFilter,
        (job: Job) => {
          setJobs(prev => {
            const filteredJob = (!companyFilter || job.company.toLowerCase().includes(companyFilter.toLowerCase())) &&
                                (!siteFilter || job.source.toLowerCase().includes(siteFilter.toLowerCase()));
            if (filteredJob) {
              return [...prev, job];
            }
            return prev;
          });
        },
        addLog
      );

      if (results.length > 0) {
        addLog("ai", "RANK-AI", "Deduplicating results across boards...");
        const dedupedResults = await dedupeJobsWithAI(results, addLog);

        const searchProfile = { 
          Name: profile.Name || "User", 
          "Current Role": profile["Current Role"] || role, 
          "Target Market": profile["Target Market"] || region, 
          "Years of Exp.": profile["Years of Exp."] || "5" 
        };
        addLog("ai", "RANK-AI", `Scoring ${dedupedResults.length} results against profile...`);
        const scoredResults = await scoreJobsWithAI(dedupedResults, searchProfile, selectedAI, aiBackends, addLog);
        
        // Merge: keep existing (DB-loaded) jobs, add new scored results (dedupe by id)
        setJobs(prev => {
          const existingIds = new Set(prev.map(j => j.id));
          const fresh = scoredResults.filter((j: Job) => !existingIds.has(j.id));
          return [...scoredResults, ...prev.filter(j => !scoredResults.find((s: Job) => s.id === j.id))];
        });

        const count = scoredResults.length;
        const strongCount = scoredResults.filter((j: Job) => (j.score || 0) >= 90).length;
        addLog("success", "DONE", `Found ${count} ranked results. ${strongCount} strong match${strongCount !== 1 ? "es" : ""} flagged. ✓`);
      } else {
        addLog("success", "DONE", "Search completed but no jobs were found matching the filters.");
      }
    } catch (err: any) {
      addLog("error", "ERROR", `Search failed: ${err.message}`);
    } finally {
      setSearching(false);
      setTab("results");
    }
  };

  const filteredJobs = filterStatus === "All" ? jobs : jobs.filter(j => j.status === filterStatus);

  const updateStatus = (id: number, status: string) => {
    setJobs(j => j.map(job => job.id === id ? { ...job, status } : job));
    setTrackerJobs(j => j.map(job => job.id === id ? { ...job, status } : job));
    if (selectedJob?.id === id) setSelectedJob(s => s ? { ...s, status } : s);
    // Persist to DB so status survives page refresh
    updateJobStatus(id, status).catch(() => {});
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
    
    try {
      const mapping = await mapFieldsWithAI(profile, selectedAutofillJob, selectedAI, aiBackends, addLog);
      setFieldMappings(mapping);
      
      addLog("ai", "MAP", `Mapped ${mapping.length} fields from your profile.`);
      
      if (automationModes["Review Before Submit"]) {
        addLog("info", "REVIEW", "Pausing for review — Review Before Submit mode active.");
      } else {
        addLog("ai", "SUBMIT", "Submitting application via Playwright...");
      }
      
      addLog("success", "DONE", "Auto-fill complete. Check form before submitting. ✓");
      setAutofillDone(true);
      if (selectedAutofillJob) {
        updateStatus(selectedAutofillJob.id, "Applied");
      }
    } catch (err: any) {
      addLog("error", "ERROR", `Auto-fill failed: ${err.message}`);
    } finally {
      setAutofillRunning(false);
    }
  };

  const TABS = [
    { id: "dashboard", label: "Dashboard", icon: "▦" },
    { id: "discover",  label: "Discover",  icon: "◎" },
    { id: "results",   label: "Results",   icon: "≡", count: jobs.length || null },
    { id: "tracker",   label: "Tracker",   icon: "◈" },
    { id: "autofill",  label: "Auto-Fill", icon: "✦" },
    { id: "settings",  label: "Settings",  icon: "⚙" },
  ];

  const updateBackend = (name: string, field: "model" | "url" | "apiKey", value: string) => {
    setAiBackends(prev => prev.map(b => b.name === name ? { ...b, [field]: value } : b));
  };



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

        {/* ─── DASHBOARD ─── */}
        {tab === "dashboard" && (() => {
          const total = trackerJobs.length;
          const avgScore = Math.round(trackerJobs.reduce((a, j) => a + (j.score || 0), 0) / total);
          const interviews = trackerJobs.filter(j => j.status === "Interview").length;
          const offers = trackerJobs.filter(j => j.status === "Offer").length;
          const applied = trackerJobs.filter(j => j.status === "Applied").length;
          const responseRate = total > 0 ? Math.round(((interviews + offers) / Math.max(applied + interviews + offers, 1)) * 100) : 0;

          const pipeline = [
            { label: "Discovered", count: trackerJobs.filter(j => j.status === "Discovered").length, color: "#64748b", accent: "rgba(100,116,139,0.15)" },
            { label: "Saved",      count: trackerJobs.filter(j => j.status === "Saved").length,      color: "#0ea5e9", accent: "rgba(14,165,233,0.12)" },
            { label: "Applied",    count: applied,                                                    color: "#8b5cf6", accent: "rgba(139,92,246,0.15)" },
            { label: "Interview",  count: interviews,                                                 color: "#f59e0b", accent: "rgba(245,158,11,0.15)" },
            { label: "Offer",      count: offers,                                                     color: "#10b981", accent: "rgba(16,185,129,0.15)" },
            { label: "Rejected",   count: trackerJobs.filter(j => j.status === "Rejected").length,   color: "#ef4444", accent: "rgba(239,68,68,0.1)" },
          ];
          const maxCount = Math.max(...pipeline.map(p => p.count), 1);

          const sources = trackerJobs.reduce((acc, j) => { acc[j.source] = (acc[j.source] || 0) + 1; return acc; }, {} as Record<string, number>);
          const sourceList = Object.entries(sources).sort((a, b) => b[1] - a[1]);
          const maxSource = Math.max(...sourceList.map(s => s[1]), 1);

          const topMatches = [...trackerJobs].sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 3);

          const kpis = [
            { label: "Total Tracked", value: String(total),           sub: "across all stages",      color: "#38bdf8", icon: "◈" },
            { label: "Avg Match Score", value: `${avgScore}`,         sub: "against your profile",   color: avgScore >= 85 ? "#10b981" : "#f59e0b", icon: "◎" },
            { label: "Interviews",    value: String(interviews),      sub: "active conversations",   color: "#f59e0b", icon: "◆" },
            { label: "Response Rate", value: `${responseRate}%`,      sub: "applied → interview",    color: responseRate >= 30 ? "#10b981" : "#8b5cf6", icon: "↑" },
          ];

          return (
            <div style={{ animation: "slideIn 0.3s ease" }}>
              {/* Greeting */}
              <div style={{ marginBottom: 28, display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 12, color: "#475569", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" as const, marginBottom: 4 }}>Good afternoon</div>
                  <h2 style={{ fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: "-0.03em" }}>{profile.Name} <span style={{ color: "#38bdf8", fontWeight: 400, fontSize: 20 }}>— here's your search</span></h2>
                </div>
                <button
                  onClick={() => setTab("discover")}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 20px", borderRadius: 9, border: "none", background: "linear-gradient(135deg, #0ea5e9, #818cf8)", color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}
                >
                  <span>◎</span> New Search
                </button>
              </div>

              {/* KPI row */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
                {kpis.map(k => (
                  <div key={k.label} style={{ background: "#0a1628", border: `1px solid ${k.color}25`, borderRadius: 14, padding: "20px 20px 16px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                      <span style={{ fontSize: 11, color: "#475569", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" as const }}>{k.label}</span>
                      <span style={{ fontSize: 14, color: k.color, opacity: 0.7 }}>{k.icon}</span>
                    </div>
                    <div style={{ fontSize: 36, fontWeight: 700, color: k.color, fontFamily: "'JetBrains Mono', monospace", lineHeight: 1 }}>{k.value}</div>
                    <div style={{ fontSize: 11, color: "#334155", marginTop: 6 }}>{k.sub}</div>
                  </div>
                ))}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
                {/* Pipeline funnel */}
                <div style={{ background: "#0a1628", border: "1px solid #1e293b", borderRadius: 14, padding: 22 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#94a3b8", marginBottom: 18 }}>Application Pipeline</div>
                  <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
                    {pipeline.map((stage, i) => (
                      <div key={stage.label}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ width: 8, height: 8, borderRadius: "50%", background: stage.color, flexShrink: 0 }} />
                            <span style={{ fontSize: 12, color: "#94a3b8" }}>{stage.label}</span>
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 700, color: stage.color, fontFamily: "'JetBrains Mono', monospace" }}>{stage.count}</span>
                        </div>
                        <div style={{ height: 6, background: "#0f172a", borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ width: `${(stage.count / maxCount) * 100}%`, height: "100%", background: stage.color, borderRadius: 3, opacity: 0.85, transition: "width 0.8s ease" }} />
                        </div>
                        {i < pipeline.length - 1 && stage.count > 0 && pipeline[i + 1].count > 0 && (
                          <div style={{ fontSize: 10, color: "#334155", marginTop: 2, textAlign: "right" as const, fontFamily: "monospace" }}>
                            {Math.round((pipeline[i + 1].count / stage.count) * 100)}% → next
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Source breakdown + top matches */}
                <div style={{ display: "flex", flexDirection: "column" as const, gap: 16 }}>
                  {/* Source breakdown */}
                  <div style={{ background: "#0a1628", border: "1px solid #1e293b", borderRadius: 14, padding: 22 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#94a3b8", marginBottom: 14 }}>Source Breakdown</div>
                    <div style={{ display: "flex", flexDirection: "column" as const, gap: 10 }}>
                      {sourceList.map(([src, cnt]) => (
                        <div key={src} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{ fontSize: 11, color: "#64748b", width: 80, flexShrink: 0 }}>{src}</span>
                          <div style={{ flex: 1, height: 5, background: "#0f172a", borderRadius: 3, overflow: "hidden" }}>
                            <div style={{ width: `${(cnt / maxSource) * 100}%`, height: "100%", background: "linear-gradient(90deg, #0ea5e9, #818cf8)", borderRadius: 3, transition: "width 0.6s ease" }} />
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 700, color: "#38bdf8", fontFamily: "monospace", width: 16, textAlign: "right" as const }}>{cnt}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Score distribution mini */}
                  <div style={{ background: "#0a1628", border: "1px solid #1e293b", borderRadius: 14, padding: 22 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#94a3b8", marginBottom: 14 }}>Score Distribution</div>
                    <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 60 }}>
                      {[...trackerJobs].sort((a, b) => (b.score || 0) - (a.score || 0)).map(j => {
                        const barColor = (j.score || 0) >= 90 ? "#10b981" : (j.score || 0) >= 80 ? "#f59e0b" : "#ef4444";
                        const barH = Math.round(((j.score || 0) / 100) * 44);
                        return (
                          <div key={j.id} style={{ flex: 1, display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 3 }}>
                            <div style={{ width: "100%", height: barH, background: barColor, borderRadius: "3px 3px 0 0", opacity: 0.85 }} title={`${j.company}: ${(j.score || 0)}`} />
                            <div style={{ fontSize: 9, color: "#475569", fontFamily: "monospace" }}>{(j.score || 0)}</div>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10 }}>
                      {[["#10b981", `${[...trackerJobs].filter(j => (j.score || 0) >= 90).length} excellent`], ["#f59e0b", `${[...trackerJobs].filter(j => (j.score || 0) >= 80 && (j.score || 0) < 90).length} good`], ["#ef4444", `${[...trackerJobs].filter(j => (j.score || 0) < 80).length} weak`]].map(([color, label]) => (
                        <div key={label as string} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                          <div style={{ width: 8, height: 8, borderRadius: 2, background: color as string }} />
                          <span style={{ fontSize: 10, color: "#475569" }}>{label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Top Matches */}
              <div style={{ background: "#0a1628", border: "1px solid #1e293b", borderRadius: 14, padding: 22 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#94a3b8" }}>Top Matches</div>
                  <button onClick={() => setTab("results")} style={{ fontSize: 11, color: "#38bdf8", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>View all →</button>
                </div>
                <div style={{ display: "flex", flexDirection: "column" as const, gap: 10 }}>
                  {topMatches.map(job => (
                    <div
                      key={job.id}
                      onClick={() => { setSelectedJob(job); setFilterStatus("All"); setTab("results"); }}
                      style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 16px", background: "#070d1a", borderRadius: 10, border: "1px solid #1e293b", cursor: "pointer", transition: "border-color 0.2s" }}
                      onMouseEnter={e => (e.currentTarget.style.borderColor = "#0369a1")}
                      onMouseLeave={e => (e.currentTarget.style.borderColor = "#1e293b")}
                    >
                      <div style={{ width: 36, height: 36, borderRadius: 8, background: `${job.color}20`, border: `1px solid ${job.color}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: job.color, flexShrink: 0, fontFamily: "monospace" }}>{job.logo}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{job.title}</div>
                        <div style={{ fontSize: 11, color: "#64748b" }}>{job.company} · {job.location}</div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <Badge status={job.status} />
                        <div style={{ textAlign: "right" as const }}>
                          <div style={{ fontSize: 18, fontWeight: 700, color: (job.score || 0) >= 90 ? "#10b981" : (job.score || 0) >= 80 ? "#f59e0b" : "#ef4444", fontFamily: "monospace", lineHeight: 1 }}>{(job.score || 0)}</div>
                          <div style={{ fontSize: 9, color: "#334155", marginTop: 2 }}>score</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })()}

        {/* ─── DISCOVER ─── */}
        {tab === "discover" && (
          <div style={{ animation: "slideIn 0.3s ease" }}>
            <div style={{ marginBottom: 28 }}>
              <h2 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 6px", letterSpacing: "-0.03em" }}>Job Discovery <span style={{ color: "#38bdf8" }}>Agent</span></h2>
              <p style={{ color: "#64748b", fontSize: 14, margin: "0 0 10px" }}>Hybrid pipeline: <b>API feeds</b> (instant, reliable) + <b>Browser</b> (deep scrape) + <b>AI Discovery</b> (web search + extraction). All links validated before saving.</p>
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap" as const }}>
                {[["#10b981", "API", "Direct feed — fast & reliable"], ["#f59e0b", "Browser", "Playwright scraper — may hit blocks"], ["#818cf8", "AI", "AI web search — always finds jobs"]].map(([color, label, desc]) => (
                  <div key={label as string} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#64748b" }}>
                    <span style={{ background: `${color as string}22`, color: color as string, borderRadius: 8, padding: "1px 7px", fontWeight: 700, fontSize: 10 }}>{label}</span>
                    <span>{desc}</span>
                  </div>
                ))}
              </div>
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
              {[
                { id: "LinkedIn",     label: "LinkedIn",     badge: "API",     color: "#0A66C2" },
                { id: "RemoteOK",     label: "RemoteOK",     badge: "API",     color: "#00b16a" },
                { id: "Arbeitnow",    label: "Arbeitnow",    badge: "API",     color: "#6d28d9" },
                { id: "JSearch",      label: "JSearch",      badge: "API",     color: "#f59e0b" },
                { id: "Indeed",       label: "Indeed",       badge: "Browser", color: "#003a9b" },
                { id: "Naukri",       label: "Naukri",       badge: "Browser", color: "#ff7555" },
                { id: "Hirect",       label: "Hirect",       badge: "Browser", color: "#6c47ff" },
                { id: "InstaHyre",    label: "InstaHyre",    badge: "Browser", color: "#00b386" },
                { id: "AI Discovery", label: "AI Discovery", badge: "AI",      color: "#818cf8" },
              ].map(b => {
                const active = activeBoards.includes(b.id);
                const badgeColor = b.badge === "API" ? "#10b981" : b.badge === "AI" ? "#818cf8" : "#f59e0b";
                return (
                  <div
                    key={b.id}
                    onClick={() => toggleBoard(b.id)}
                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 20, background: active ? `${b.color}18` : "#0f172a", border: `1px solid ${active ? b.color : "#1e293b"}`, fontSize: 12, color: active ? b.color : "#475569", cursor: "pointer", transition: "all 0.2s", userSelect: "none" as const }}
                  >
                    <span>{active ? "✓" : "○"}</span>
                    <span>{b.label}</span>
                    <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 8, background: `${badgeColor}22`, color: badgeColor, fontWeight: 700, letterSpacing: "0.04em" }}>{b.badge}</span>
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
                <p style={{ color: "#64748b", fontSize: 13, margin: 0 }}>
                  {jobs.length} job{jobs.length !== 1 ? "s" : ""} · sorted by AI relevance score
                  <span style={{ marginLeft: 10, padding: "1px 8px", borderRadius: 10, background: "rgba(16,185,129,0.12)", color: "#34d399", fontSize: 11, fontWeight: 600 }}>
                    💾 Saved — survives refresh
                  </span>
                </p>
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
              {jobs.length > 0 && (
                <button
                  onClick={async () => { 
                    if (window.confirm(`Clear all ${jobs.length} results from database?`)) { 
                      const ok = await clearAllJobs();
                      if (ok) {
                        setJobs([]); 
                        setSelectedJob(null); 
                        addLog("success", "CLEAR", "All jobs cleared from database."); 
                      } else {
                        addLog("error", "ERROR", "Failed to clear jobs from database.");
                      }
                    } 
                  }}
                  style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #991b1b", background: "rgba(239,68,68,0.08)", color: "#f87171", fontSize: 12, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6 }}
                >
                  🗑 Clear All
                </button>
              )}
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
                            {(job.score || 0) >= 90 && <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 10, background: "rgba(16,185,129,0.15)", color: "#34d399", border: "1px solid #047857", fontWeight: 600 }}>★ STRONG MATCH</span>}
                            <Badge status={job.status} />
                          </div>
                          <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{job.company} · {job.location} · {job.posted}</div>
                        </div>
                        <div style={{ minWidth: 120 }}>
                          <ScoreBar score={job.score || 0} />
                          <div style={{ fontSize: 11, color: "#475569", marginTop: 2, textAlign: "right" as const }}>{job.salary}</div>
                        </div>
                        <div style={{ fontSize: 11, color: "#475569", background: "#0f172a", padding: "3px 9px", borderRadius: 6, whiteSpace: "nowrap" as const }}>{job.source}</div>
                          <button
                            onClick={async e => { 
                              e.stopPropagation(); 
                              const ok = await deleteJob(job.id);
                              if (ok) {
                                setJobs(prev => prev.filter(jj => jj.id !== job.id)); 
                                if (selectedJob?.id === job.id) setSelectedJob(null); 
                                addLog("info", "DELETE", `Job #${job.id} removed.`);
                              } else {
                                addLog("error", "ERROR", `Failed to delete job #${job.id}.`);
                              }
                            }}
                            title="Remove"
                            style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: 15, padding: "4px 6px", borderRadius: 6, lineHeight: 1, flexShrink: 0, transition: "color 0.15s" }}
                            onMouseEnter={e => (e.currentTarget.style.color = "#f87171")}
                            onMouseLeave={e => (e.currentTarget.style.color = "#475569")}
                          >🗑</button>
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
                        setTargetUrl(selectedJob.url || "");
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
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ fontSize: 12, color: "#475569" }}>{trackerJobs.length} total applications</div>
                {trackerJobs.length > 0 && (
                  <button
                    onClick={async () => { 
                      if (window.confirm(`Clear all ${trackerJobs.length} tracker entries from database?`)) { 
                        const ok = await clearAllJobs();
                        if (ok) {
                          setTrackerJobs([]); 
                          setJobs([]); // Since tracker jobs are shared in the same table
                          addLog("success", "CLEAR", "Tracker and results cleared from database."); 
                        } else {
                          addLog("error", "ERROR", "Failed to clear database.");
                        }
                      } 
                    }}
                    style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #991b1b", background: "rgba(239,68,68,0.08)", color: "#f87171", fontSize: 12, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6 }}
                  >
                    🗑 Clear All
                  </button>
                )}
              </div>
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
                      <td style={{ padding: "12px 16px", width: 100 }}><ScoreBar score={(j.score || 0)} /></td>
                      <td style={{ padding: "12px 16px" }}><Badge status={j.status} /></td>
                      <td style={{ padding: "12px 16px", color: "#475569", fontFamily: "monospace", fontSize: 11 }}>{j.posted}</td>
                      <td style={{ padding: "12px 16px" }}>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button
                            onClick={() => { setSelectedJob(j); setFilterStatus("All"); setTab("results"); }}
                            style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid #1e293b", background: "transparent", color: "#38bdf8", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}
                          >
                            View
                          </button>
                          <button
                            onClick={() => { setSelectedAutofillJob(j); setTargetUrl(j.url || ""); setTab("autofill"); }}
                            style={{ padding: "4px 10px", borderRadius: 6, border: "none", background: "rgba(139,92,246,0.15)", color: "#a78bfa", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}
                          >
                            Fill
                          </button>
                          <button
                            onClick={async () => {
                              const ok = await deleteJob(j.id);
                              if (ok) {
                                setTrackerJobs(prev => prev.filter(jj => jj.id !== j.id));
                                setJobs(prev => prev.filter(jj => jj.id !== j.id));
                                addLog("info", "DELETE", `Removed #${j.id} from tracker.`);
                              } else {
                                addLog("error", "ERROR", `Failed to delete #${j.id}.`);
                              }
                            }}
                            title="Remove from tracker"
                            style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #991b1b", background: "rgba(239,68,68,0.08)", color: "#f87171", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}
                          >
                            🗑
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
                <input type="file" ref={fileInputRef} accept=".pdf,.json" style={{ display: "none" }} onChange={(e) => setCvFile(e.target.files?.[0] || null)} />
                <div
                  onClick={() => fileInputRef.current?.click()}
                  style={{ border: `2px dashed ${cvFile ? "#0369a1" : "#1e293b"}`, borderRadius: 12, padding: 32, textAlign: "center" as const, marginBottom: 16, cursor: "pointer", transition: "border-color 0.2s", background: cvFile ? "rgba(14,165,233,0.04)" : "transparent" }}
                >
                  <div style={{ fontSize: 32, marginBottom: 12 }}>{cvFile ? "✅" : "📄"}</div>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>{cvFile ? `CV Loaded — ${cvFile.name}` : "Drop your CV here"}</div>
                  <div style={{ fontSize: 12, color: "#475569" }}>{cvFile ? "Click to replace" : "PDF or JSON resume · max 5MB"}</div>
                  {!cvFile && <div style={{ marginTop: 16, padding: "8px 20px", borderRadius: 8, background: "#0f172a", border: "1px solid #1e293b", display: "inline-block", fontSize: 13, color: "#38bdf8", cursor: "pointer" }}>Browse Files</div>}
                </div>

                <div style={{ background: "#0a1628", border: "1px solid #1e293b", borderRadius: 12, padding: 18 }}>
                  <div style={{ fontSize: 12, color: "#475569", fontWeight: 600, marginBottom: 12, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>Field Mapping Preview</div>
                  {fieldMappings.map(([field, val, st]) => (
                    <div key={field} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid #0f172a" }}>
                      <span style={{ color: st === "✓" ? "#10b981" : st === "⚠ check" ? "#f59e0b" : st === "✗ manual" ? "#ef4444" : "#475569", width: 14, fontSize: 12 }}>{st}</span>
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
                {aiBackends.map((backend) => {
                  const { name, model, url, apiKey } = backend;
                  const active = selectedAI === name;
                  return (
                    <div key={name} style={{ marginBottom: 6 }}>
                      <div
                        onClick={() => { setSelectedAI(name); addLog("info", "CONFIG", `AI backend switched to ${name} (${model})`); }}
                        style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: active ? "8px 8px 0 0" : 8, background: active ? "rgba(56,189,248,0.08)" : "transparent", border: `1px solid ${active ? "#0369a1" : "#0f172a"}`, borderBottom: active ? "1px solid #0f172a" : undefined, cursor: "pointer", transition: "all 0.2s" }}
                      >
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: active ? "#10b981" : "#334155", flexShrink: 0 }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: active ? 600 : 400, color: active ? "#e2e8f0" : "#64748b" }}>{name}</div>
                          <div style={{ fontSize: 11, color: "#475569", fontFamily: "monospace" }}>{model}</div>
                        </div>
                        {active
                          ? <span style={{ fontSize: 11, color: "#38bdf8" }}>Active ▾</span>
                          : <span style={{ fontSize: 11, color: "#334155" }}>▸</span>
                        }
                      </div>

                      {active && (
                        <div style={{ background: "#070d1a", border: "1px solid #0369a1", borderTop: "none", borderRadius: "0 0 8px 8px", padding: "14px 16px", display: "flex", flexDirection: "column" as const, gap: 10 }}>
                          {/* Model */}
                          <div>
                            <div style={{ fontSize: 10, color: "#475569", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" as const, marginBottom: 4 }}>Model</div>
                            <input
                              value={model}
                              onChange={e => updateBackend(name, "model", e.target.value)}
                              placeholder="e.g. claude-sonnet-4-20250514"
                              style={{ width: "100%", background: "#0a1628", border: "1px solid #1e293b", borderRadius: 6, padding: "7px 10px", color: "#e2e8f0", fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}
                            />
                          </div>
                          {/* Endpoint URL */}
                          <div>
                            <div style={{ fontSize: 10, color: "#475569", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" as const, marginBottom: 4 }}>API Endpoint URL</div>
                            <input
                              value={url}
                              onChange={e => updateBackend(name, "url", e.target.value)}
                              placeholder="https://api.anthropic.com/v1"
                              style={{ width: "100%", background: "#0a1628", border: "1px solid #1e293b", borderRadius: 6, padding: "7px 10px", color: "#e2e8f0", fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}
                            />
                          </div>
                          {/* API Key */}
                          <div>
                            <div style={{ fontSize: 10, color: "#475569", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" as const, marginBottom: 4 }}>API Key</div>
                            <input
                              type="password"
                              value={apiKey}
                              onChange={e => updateBackend(name, "apiKey", e.target.value)}
                              placeholder={name === "Ollama (Local)" ? "Not required for local" : "sk-…"}
                              style={{ width: "100%", background: "#0a1628", border: "1px solid #1e293b", borderRadius: 6, padding: "7px 10px", color: "#e2e8f0", fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}
                            />
                          </div>
                          <button
                            onClick={async () => {
                              addLog("success", "CONFIG", `Saved: ${name} → model=${model}, url=${url || "(default)"}, key=${apiKey ? "••••" + apiKey.slice(-4) : "(none)"}`);
                              await saveProfile({ ...profile, skills, aiBackends });
                            }}
                            style={{ alignSelf: "flex-start" as const, padding: "6px 16px", borderRadius: 6, border: "none", background: "linear-gradient(135deg, #0ea5e9, #818cf8)", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
                          >
                            Save Changes
                          </button>
                        </div>
                      )}
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
                  
                  <div style={{ marginTop: 14 }}>
                    <div style={{ fontSize: 10, color: "#475569", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" as const, marginBottom: 8 }}>Skills</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                      {skills.map(s => (
                        <span key={s} style={{ padding: "3px 8px", borderRadius: 4, background: "rgba(56,189,248,0.1)", color: "#38bdf8", fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center", gap: 5 }}>
                          {s}
                          <span onClick={() => setSkills(skills.filter(x => x !== s))} style={{ cursor: "pointer", opacity: 0.7 }}>×</span>
                        </span>
                      ))}
                    </div>
                    <input
                      onKeyDown={e => {
                        if (e.key === "Enter" && e.currentTarget.value) {
                          setSkills([...skills, e.currentTarget.value]);
                          e.currentTarget.value = "";
                        }
                      }}
                      placeholder="Add skill (press Enter)..."
                      style={{ width: "100%", background: "#0a1628", border: "1px solid #1e293b", borderRadius: 6, padding: "7px 10px", color: "#e2e8f0", fontSize: 12, fontFamily: "inherit" }}
                    />
                  </div>

                  <button
                    onClick={async () => {
                      const ok = await saveProfile({ ...profile, skills, aiBackends });
                      if (ok) addLog("success", "PROFILE", "Profile saved to database. ✓");
                      else addLog("error", "ERROR", "Failed to save profile.");
                    }}
                    style={{ marginTop: 12, padding: "8px 16px", borderRadius: 8, border: "none", background: "rgba(56,189,248,0.1)", color: "#38bdf8", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
                  >
                    💾 Save Profile
                  </button>
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
                    ["Avg. Match Score", `${Math.round(trackerJobs.reduce((a, j) => a + (j.score || 0), 0) / trackerJobs.length)}/100`],
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
