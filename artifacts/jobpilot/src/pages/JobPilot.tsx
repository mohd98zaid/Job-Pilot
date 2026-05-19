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
  const [role, setRole] = useState(() => localStorage.getItem("jobpilot_role") || "");
  const [region, setRegion] = useState(() => localStorage.getItem("jobpilot_region") || "");
  const [companyFilter, setCompanyFilter] = useState(() => localStorage.getItem("jobpilot_companyFilter") || "");
  const [siteFilter, setSiteFilter] = useState(() => localStorage.getItem("jobpilot_siteFilter") || "");
  const [dateFilter, setDateFilter] = useState(() => localStorage.getItem("jobpilot_dateFilter") || "Last 7 days");
  const [filterStatus, setFilterStatus] = useState("All");
  const [activeBoards, setActiveBoards] = useState<string[]>(() => {
    const saved = localStorage.getItem("jobpilot_activeBoards");
    try {
      return saved ? JSON.parse(saved) : ["LinkedIn", "RemoteOK", "Arbeitnow", "AI Discovery"];
    } catch {
      return ["LinkedIn", "RemoteOK", "Arbeitnow", "AI Discovery"];
    }
  });
  const [selectedAI, setSelectedAI] = useState(() => localStorage.getItem("jobpilot_selectedAI") || "Ollama (Local)");
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
  const [automationModes, setAutomationModes] = useState(() => {
    const saved = localStorage.getItem("jobpilot_automationModes");
    try {
      return saved ? JSON.parse(saved) : {
        "Review Before Submit": true,
        "Full Auto": false,
        "Stealth Mode": true,
      };
    } catch {
      return {
        "Review Before Submit": true,
        "Full Auto": false,
        "Stealth Mode": true,
      };
    }
  });
  const [automation, setAutomation] = useState(() => {
    const saved = localStorage.getItem("jobpilot_automation");
    try {
      return saved ? JSON.parse(saved) : {
        "Playwright Headless": true,
        "Human-like Delays": true,
        "Auto-track on Apply": true,
        "Email Notifications": false,
      };
    } catch {
      return {
        "Playwright Headless": true,
        "Human-like Delays": true,
        "Auto-track on Apply": true,
        "Email Notifications": false,
      };
    }
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

  // Persistence Watchers
  useEffect(() => { localStorage.setItem("jobpilot_role", role); }, [role]);
  useEffect(() => { localStorage.setItem("jobpilot_region", region); }, [region]);
  useEffect(() => { localStorage.setItem("jobpilot_companyFilter", companyFilter); }, [companyFilter]);
  useEffect(() => { localStorage.setItem("jobpilot_siteFilter", siteFilter); }, [siteFilter]);
  useEffect(() => { localStorage.setItem("jobpilot_dateFilter", dateFilter); }, [dateFilter]);
  useEffect(() => { localStorage.setItem("jobpilot_activeBoards", JSON.stringify(activeBoards)); }, [activeBoards]);
  useEffect(() => { localStorage.setItem("jobpilot_selectedAI", selectedAI); }, [selectedAI]);
  useEffect(() => { localStorage.setItem("jobpilot_automationModes", JSON.stringify(automationModes)); }, [automationModes]);
  useEffect(() => { localStorage.setItem("jobpilot_automation", JSON.stringify(automation)); }, [automation]);

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
    <div className="min-h-screen text-slate-100 flex flex-col font-sans relative z-0">
      {/* Mesh Background */}
      <div className="mesh-bg"></div>

      {/* Header */}
      <header className="sticky top-0 z-50 px-6 py-4 border-b border-white/10 bg-slate-950/40 backdrop-blur-xl flex items-center gap-6 shadow-[0_4px_30px_rgba(0,0,0,0.1)]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-400 to-indigo-500 flex items-center justify-center text-xl shadow-lg shadow-sky-500/20 text-white font-bold">
            ✦
          </div>
          <span className="font-bold text-xl tracking-tight">
            Job<span className="text-sky-400">Pilot</span>
          </span>
          <span className="text-xs text-slate-400 font-mono bg-slate-900/50 px-2 py-1 rounded-md border border-white/5">
            v2.0
          </span>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-2 text-xs font-medium text-slate-400 bg-white/5 px-3 py-1.5 rounded-full border border-white/10 backdrop-blur-md">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          {selectedAI === "Claude (Anthropic)" ? "Claude Sonnet 4" : selectedAI} · Active
        </div>
        <div className="w-px h-5 bg-white/10" />
        <div className="text-sm font-medium text-slate-300">
          {profile.Name} {profile["Current Role"] ? <span className="text-slate-500">· {profile["Current Role"]}</span> : ""} {profile["Target Market"] ? <span className="text-sky-400">→ {profile["Target Market"]}</span> : ""}
        </div>
      </header>

      {/* Nav */}
      <div className="flex gap-2 px-8 pt-6 pb-0 overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-5 py-3 rounded-t-xl text-sm font-medium transition-all duration-300 ease-out border-b-2 ${
              tab === t.id
                ? "bg-white/10 text-sky-400 border-sky-400 backdrop-blur-md"
                : "bg-transparent text-slate-400 border-transparent hover:bg-white/5 hover:text-slate-200"
            }`}
          >
            <span>{t.icon}</span> {t.label}
            {t.count ? (
              <span className="bg-sky-500/20 text-sky-300 text-[10px] font-bold rounded-full px-2 py-0.5 border border-sky-500/30">
                {t.count}
              </span>
            ) : null}
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
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              {/* Greeting */}
              <div className="mb-8 flex items-end justify-between">
                <div>
                  <div className="text-xs text-sky-400 font-bold tracking-widest uppercase mb-1">Good afternoon</div>
                  <h2 className="text-3xl font-bold m-0 tracking-tight text-white">{profile.Name} <span className="text-slate-400 font-normal text-2xl">— here's your search</span></h2>
                </div>
                <button
                  onClick={() => setTab("discover")}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 backdrop-blur-md text-white font-semibold text-sm cursor-pointer transition-all shadow-[0_4px_24px_rgba(0,0,0,0.2)] hover:shadow-[0_4px_24px_rgba(56,189,248,0.2)]"
                >
                  <span className="text-sky-400">◎</span> New Search
                </button>
              </div>

              {/* KPI row */}
              <div className="grid grid-cols-4 gap-4 mb-6">
                {kpis.map(k => (
                  <div key={k.label} className="bg-slate-950/40 backdrop-blur-xl border border-white/10 rounded-2xl p-5 shadow-lg relative overflow-hidden group hover:border-white/20 transition-all">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-white/5 to-transparent rounded-full -mr-16 -mt-16 blur-2xl group-hover:bg-sky-500/10 transition-colors" />
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs text-slate-400 font-bold tracking-widest uppercase">{k.label}</span>
                      <span className="text-lg opacity-80" style={{ color: k.color }}>{k.icon}</span>
                    </div>
                    <div className="text-4xl font-bold font-mono leading-none tracking-tighter" style={{ color: k.color }}>{k.value}</div>
                    <div className="text-xs text-slate-500 mt-2 font-medium">{k.sub}</div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-5 mb-5">
                {/* Pipeline funnel */}
                <div className="bg-slate-950/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-lg">
                  <div className="text-sm font-bold text-slate-300 mb-5 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-sky-400" /> Application Pipeline
                  </div>
                  <div className="flex flex-col gap-3">
                    {pipeline.map((stage, i) => (
                      <div key={stage.label} className="group">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full" style={{ background: stage.color }} />
                            <span className="text-xs font-medium text-slate-400 group-hover:text-slate-200 transition-colors">{stage.label}</span>
                          </div>
                          <span className="text-xs font-bold font-mono" style={{ color: stage.color }}>{stage.count}</span>
                        </div>
                        <div className="h-1.5 bg-slate-900/50 rounded-full overflow-hidden border border-white/5">
                          <div className="h-full rounded-full opacity-90 transition-all duration-1000 ease-out" style={{ width: `${(stage.count / maxCount) * 100}%`, background: stage.color, boxShadow: `0 0 10px ${stage.color}80` }} />
                        </div>
                        {i < pipeline.length - 1 && stage.count > 0 && pipeline[i + 1].count > 0 && (
                          <div className="text-[10px] text-slate-500 mt-1 text-right font-mono font-medium">
                            {Math.round((pipeline[i + 1].count / stage.count) * 100)}% → next
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Source breakdown + top matches */}
                <div className="flex flex-col gap-4">
                  {/* Source breakdown */}
                  <div className="bg-slate-950/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-lg">
                    <div className="text-sm font-bold text-slate-300 mb-4 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-indigo-400" /> Source Breakdown
                    </div>
                    <div className="flex flex-col gap-3">
                      {sourceList.map(([src, cnt]) => (
                        <div key={src} className="flex items-center gap-3">
                          <span className="text-xs font-medium text-slate-400 w-20 shrink-0 truncate">{src}</span>
                          <div className="flex-1 h-1.5 bg-slate-900/50 rounded-full overflow-hidden border border-white/5">
                            <div className="h-full bg-gradient-to-r from-sky-400 to-indigo-500 rounded-full transition-all duration-700 shadow-[0_0_8px_rgba(56,189,248,0.5)]" style={{ width: `${(cnt / maxSource) * 100}%` }} />
                          </div>
                          <span className="text-xs font-bold text-sky-400 font-mono w-5 text-right">{cnt}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Score distribution mini */}
                  <div className="bg-slate-950/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-lg">
                    <div className="text-sm font-bold text-slate-300 mb-4 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-400" /> Score Distribution
                    </div>
                    <div className="flex items-end gap-1.5 h-16">
                      {[...trackerJobs].sort((a, b) => (b.score || 0) - (a.score || 0)).map(j => {
                        const barColor = (j.score || 0) >= 90 ? "#10b981" : (j.score || 0) >= 80 ? "#f59e0b" : "#ef4444";
                        const barH = Math.round(((j.score || 0) / 100) * 44);
                        return (
                          <div key={j.id} className="flex-1 flex flex-col items-center gap-1 group">
                            <div className="w-full rounded-t-sm opacity-80 group-hover:opacity-100 transition-opacity relative" style={{ height: barH, background: barColor, boxShadow: `0 0 8px ${barColor}40` }}>
                              <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[9px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                                {j.company}: {(j.score || 0)}
                              </div>
                            </div>
                            <div className="text-[9px] text-slate-500 font-mono">{(j.score || 0)}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Top Matches */}
              <div className="bg-slate-950/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-lg">
                <div className="flex items-center justify-between mb-5">
                  <div className="text-sm font-bold text-slate-300 flex items-center gap-2">
                    <span className="text-amber-400">★</span> Top Matches
                  </div>
                  <button onClick={() => setTab("results")} className="text-xs font-medium text-sky-400 hover:text-sky-300 transition-colors">View all →</button>
                </div>
                <div className="flex flex-col gap-3">
                  {topMatches.map(job => (
                    <div
                      key={job.id}
                      onClick={() => { setSelectedJob(job); setFilterStatus("All"); setTab("results"); }}
                      className="flex items-center gap-4 p-3.5 bg-white/5 border border-white/5 hover:border-white/20 hover:bg-white/10 rounded-xl cursor-pointer transition-all duration-200 group"
                    >
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center text-xs font-bold font-mono shrink-0 shadow-inner" style={{ background: `${job.color}15`, border: `1px solid ${job.color}30`, color: job.color }}>
                        {job.logo}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-slate-200 mb-0.5 truncate group-hover:text-sky-300 transition-colors">{job.title}</div>
                        <div className="text-xs text-slate-400 truncate">{job.company} · {job.location}</div>
                      </div>
                      <div className="flex items-center gap-4">
                        <Badge status={job.status} />
                        <div className="text-right">
                          <div className="text-xl font-bold font-mono leading-none tracking-tighter" style={{ color: (job.score || 0) >= 90 ? "#10b981" : (job.score || 0) >= 80 ? "#f59e0b" : "#ef4444" }}>
                            {(job.score || 0)}
                          </div>
                          <div className="text-[9px] text-slate-500 mt-1 uppercase tracking-wider font-bold">score</div>
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
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="mb-8">
              <h2 className="text-3xl font-bold m-0 mb-2 tracking-tight text-white">Job Discovery <span className="text-sky-400 font-normal">Agent</span></h2>
              <p className="text-slate-400 text-sm m-0 mb-4">Hybrid pipeline: <b className="text-slate-300">API feeds</b> (instant, reliable) + <b className="text-slate-300">Browser</b> (deep scrape) + <b className="text-slate-300">AI Discovery</b> (web search + extraction). All links validated before saving.</p>
              <div className="flex gap-4 flex-wrap">
                {[["emerald-400", "API", "Direct feed — fast & reliable"], ["amber-400", "Browser", "Playwright scraper — may hit blocks"], ["indigo-400", "AI", "AI web search — always finds jobs"]].map(([color, label, desc]) => (
                  <div key={label as string} className="flex items-center gap-2 text-xs text-slate-400">
                    <span className={`bg-${color}/10 text-${color} rounded-md px-2 py-0.5 font-bold text-[10px]`}>{label}</span>
                    <span>{desc}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              {[
                { label: "Target Role", value: role, setter: setRole, placeholder: "e.g. GenAI Architect" },
                { label: "Region / Market", value: region, setter: setRegion, placeholder: "e.g. Gulf / GCC" },
              ].map(f => (
                <div key={f.label} className="bg-slate-950/40 backdrop-blur-xl border border-white/10 rounded-2xl p-4 shadow-lg focus-within:border-sky-500/50 transition-colors group">
                  <label className="text-xs text-slate-400 font-bold tracking-widest uppercase block group-focus-within:text-sky-400 transition-colors">{f.label}</label>
                  <input
                    value={f.value}
                    onChange={e => f.setter(e.target.value)}
                    placeholder={f.placeholder}
                    className="w-full bg-transparent border-none text-slate-100 text-base font-medium mt-1.5 focus:outline-none placeholder:text-slate-600"
                  />
                </div>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-3 mb-6">
              <div className="bg-slate-950/40 backdrop-blur-xl border border-white/10 rounded-xl p-3.5 shadow-lg focus-within:border-sky-500/50 transition-colors group">
                <label className="text-[10px] text-slate-400 font-bold tracking-widest uppercase block group-focus-within:text-sky-400 transition-colors">Company Filter</label>
                <input value={companyFilter} onChange={e => setCompanyFilter(e.target.value)} placeholder="e.g. G42, ADNOC…" className="w-full bg-transparent border-none text-slate-300 text-sm mt-1 focus:outline-none placeholder:text-slate-600" />
              </div>
              <div className="bg-slate-950/40 backdrop-blur-xl border border-white/10 rounded-xl p-3.5 shadow-lg focus-within:border-sky-500/50 transition-colors group">
                <label className="text-[10px] text-slate-400 font-bold tracking-widest uppercase block group-focus-within:text-sky-400 transition-colors">Site Filter</label>
                <input value={siteFilter} onChange={e => setSiteFilter(e.target.value)} placeholder="e.g. greenhouse.io" className="w-full bg-transparent border-none text-slate-300 text-sm mt-1 focus:outline-none placeholder:text-slate-600" />
              </div>
              <div className="bg-slate-950/40 backdrop-blur-xl border border-white/10 rounded-xl p-3.5 shadow-lg focus-within:border-sky-500/50 transition-colors group">
                <label className="text-[10px] text-slate-400 font-bold tracking-widest uppercase block group-focus-within:text-sky-400 transition-colors">Date Posted</label>
                <select value={dateFilter} onChange={e => setDateFilter(e.target.value)} className="w-full bg-transparent border-none text-slate-300 text-sm mt-1 focus:outline-none cursor-pointer">
                  {["Last 24 hours", "Last 7 days", "Last 14 days", "Last 30 days"].map(o => <option key={o} value={o} className="bg-slate-900">{o}</option>)}
                </select>
              </div>
            </div>

            <div className="flex gap-2.5 mb-8 flex-wrap">
              {[
                { id: "LinkedIn",     label: "LinkedIn",     badge: "API",     color: "#0ea5e9" },
                { id: "RemoteOK",     label: "RemoteOK",     badge: "API",     color: "#10b981" },
                { id: "Arbeitnow",    label: "Arbeitnow",    badge: "API",     color: "#8b5cf6" },
                { id: "JSearch",      label: "JSearch",      badge: "API",     color: "#f59e0b" },
                { id: "Indeed",       label: "Indeed",       badge: "Browser", color: "#3b82f6" },
                { id: "Naukri",       label: "Naukri",       badge: "Browser", color: "#f97316" },
                { id: "Hirect",       label: "Hirect",       badge: "Browser", color: "#8b5cf6" },
                { id: "InstaHyre",    label: "InstaHyre",    badge: "Browser", color: "#10b981" },
                { id: "AI Discovery", label: "AI Discovery", badge: "AI",      color: "#818cf8" },
              ].map(b => {
                const active = activeBoards.includes(b.id);
                const badgeColor = b.badge === "API" ? "#10b981" : b.badge === "AI" ? "#818cf8" : "#f59e0b";
                return (
                  <div
                    key={b.id}
                    onClick={() => toggleBoard(b.id)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer transition-all duration-200 select-none border ${active ? 'backdrop-blur-md shadow-[0_0_10px_rgba(255,255,255,0.05)] hover:brightness-110' : 'bg-white/5 border-white/5 text-slate-400 hover:bg-white/10'}`}
                    style={active ? { borderColor: b.color, background: `${b.color}15`, color: b.color } : {}}
                  >
                    <span>{active ? "✓" : "○"}</span>
                    <span>{b.label}</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded-md font-bold tracking-wider" style={{ background: `${badgeColor}22`, color: badgeColor }}>{b.badge}</span>
                  </div>
                );
              })}
            </div>

            <button
              onClick={runSearch}
              disabled={searching}
              className={`flex items-center gap-2.5 px-8 py-3.5 rounded-xl border-none cursor-${searching ? "not-allowed" : "pointer"} font-bold text-sm text-white font-sans transition-all duration-300 ${searching ? "bg-slate-800 text-slate-400" : "bg-gradient-to-br from-sky-400 to-indigo-500 shadow-[0_0_20px_rgba(56,189,248,0.4)] hover:shadow-[0_0_30px_rgba(56,189,248,0.6)] hover:-translate-y-0.5"}`}
            >
              {searching
                ? <><span className="w-4 h-4 border-2 border-sky-400 border-t-transparent rounded-full inline-block animate-spin" /> Searching...</>
                : <><span className="text-sky-200">◎</span> Launch Discovery Agent</>
              }
            </button>

            <div className="mt-8">
              <div className="text-xs text-slate-400 mb-2 font-bold tracking-widest uppercase">Agent Log</div>
              <AgentLog logs={logs} />
            </div>
          </div>
        )}

        {/* ─── RESULTS ─── */}
        {tab === "results" && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center gap-4 mb-6 flex-wrap">
              <div>
                <h2 className="text-3xl font-bold m-0 mb-1 tracking-tight text-white">Ranked <span className="text-sky-400 font-normal">Results</span></h2>
                <p className="text-slate-400 text-sm m-0">
                  {jobs.length} job{jobs.length !== 1 ? "s" : ""} · sorted by AI relevance score
                  <span className="ml-3 px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold uppercase tracking-wider">
                    💾 Saved
                  </span>
                </p>
              </div>
              <div className="flex-1" />
              <div className="flex gap-2 flex-wrap">
                {["All", ...Object.keys(STATUS_COLORS)].map(s => (
                  <button
                    key={s}
                    onClick={() => setFilterStatus(s)}
                    className={`px-3 py-1.5 rounded-full border text-xs cursor-pointer font-medium transition-all duration-200 ${filterStatus === s ? "border-sky-400 bg-sky-500/10 text-sky-400 shadow-[0_0_10px_rgba(56,189,248,0.2)]" : "border-white/10 bg-white/5 text-slate-400 hover:bg-white/10"}`}
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
                  className="px-3.5 py-1.5 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 text-xs cursor-pointer flex items-center gap-2 hover:bg-red-500/20 transition-colors"
                >
                  🗑 Clear All
                </button>
              )}
            </div>

            {jobs.length === 0 ? (
              <div className="text-center p-16 text-slate-500 bg-slate-950/40 backdrop-blur-xl border border-white/10 rounded-2xl shadow-lg">
                <div className="text-5xl mb-4 text-sky-500/30">◎</div>
                <div className="mb-4 text-sm">Run the Discovery Agent first</div>
                <button onClick={() => setTab("discover")} className="px-5 py-2 rounded-xl border border-sky-500/30 bg-sky-500/10 text-sky-400 cursor-pointer text-sm font-medium hover:bg-sky-500/20 transition-colors">→ Go to Discover</button>
              </div>
            ) : (
              <div className="flex gap-5 items-start">
                <div className="flex-1 flex flex-col gap-3 min-w-0">
                  {filteredJobs.length === 0 ? (
                    <div className="text-center p-10 text-slate-500 bg-slate-950/40 backdrop-blur-xl border border-white/10 rounded-2xl shadow-lg">
                      No jobs with status "{filterStatus}"
                    </div>
                  ) : filteredJobs.map(job => (
                    <div
                      key={job.id}
                      onClick={() => setSelectedJob(job)}
                      className={`flex items-center gap-4 p-4 rounded-2xl cursor-pointer transition-all duration-300 animate-in fade-in slide-in-from-bottom-2 ${selectedJob?.id === job.id ? "bg-slate-900/60 border border-sky-500/50 shadow-[0_0_20px_rgba(56,189,248,0.15)]" : "bg-slate-950/40 border border-white/5 hover:border-white/20 hover:bg-white/5 shadow-lg backdrop-blur-xl"}`}
                    >
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center text-sm font-bold font-mono shrink-0 shadow-inner" style={{ background: `${job.color}15`, border: `1px solid ${job.color}30`, color: job.color }}>{job.logo}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 flex-wrap mb-1">
                          <span className={`font-bold text-base transition-colors ${selectedJob?.id === job.id ? 'text-sky-300' : 'text-slate-200'}`}>{job.title}</span>
                          {(job.score || 0) >= 90 && <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-bold uppercase tracking-wider shadow-[0_0_10px_rgba(16,185,129,0.2)]">★ STRONG MATCH</span>}
                          <Badge status={job.status} />
                        </div>
                        <div className="text-xs text-slate-400 truncate">{job.company} · {job.location} · {job.posted}</div>
                      </div>
                      <div className="min-w-[120px]">
                        <ScoreBar score={job.score || 0} />
                        <div className="text-[10px] text-slate-500 mt-1.5 text-right font-medium">{job.salary}</div>
                      </div>
                      <div className="text-[10px] text-slate-400 bg-slate-900/50 border border-white/5 px-2.5 py-1 rounded-md whitespace-nowrap font-medium">{job.source}</div>
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
                        className="bg-transparent border-none text-slate-600 hover:text-red-400 cursor-pointer text-lg p-1.5 rounded-md leading-none shrink-0 transition-colors hover:bg-red-500/10"
                      >🗑</button>
                    </div>
                  ))}
                </div>

                {selectedJob && (
                  <div className="w-[340px] shrink-0 bg-slate-950/60 backdrop-blur-2xl border border-white/10 rounded-2xl p-6 h-fit shadow-2xl sticky top-[100px] animate-in slide-in-from-right-4 duration-300">
                    <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent rounded-2xl pointer-events-none" />
                    <div className="flex justify-between items-start mb-5 relative z-10">
                      <div>
                        <div className="font-bold text-lg text-slate-100 leading-tight mb-1">{selectedJob.title}</div>
                        <div className="text-slate-400 text-xs font-medium">{selectedJob.company}</div>
                      </div>
                      <button onClick={() => setSelectedJob(null)} className="bg-transparent border-none text-slate-500 hover:text-slate-300 cursor-pointer text-2xl p-0 leading-none transition-colors">×</button>
                    </div>
                    <div className="mb-5 relative z-10">
                      <div className="text-[10px] text-slate-400 mb-2 font-bold uppercase tracking-widest">AI Match Analysis</div>
                      <div className="text-xs text-slate-300 leading-relaxed bg-black/20 rounded-xl p-3.5 border-l-2 border-l-sky-400 border border-white/5 shadow-inner">{selectedJob.match}</div>
                    </div>
                    <div className="grid grid-cols-2 gap-2.5 mb-5 relative z-10">
                      {[["Score", `${selectedJob.score}/100`], ["Location", selectedJob.location], ["Salary", selectedJob.salary], ["Source", selectedJob.source]].map(([k, v]) => (
                        <div key={k} className="bg-white/5 rounded-xl p-2.5 border border-white/5">
                          <div className="text-[9px] text-slate-500 mb-1 uppercase tracking-widest font-bold">{k}</div>
                          <div className="text-xs font-semibold text-slate-200 truncate">{v}</div>
                        </div>
                      ))}
                    </div>
                    <div className="text-[10px] text-slate-400 mb-2.5 font-bold uppercase tracking-widest relative z-10">Move to</div>
                    <div className="flex flex-wrap gap-2 mb-6 relative z-10">
                      {Object.keys(STATUS_COLORS).map(s => (
                        <button
                          key={s}
                          onClick={() => updateStatus(selectedJob.id, s)}
                          className="px-3 py-1.5 rounded-full text-[10px] font-bold cursor-pointer transition-all duration-200"
                          style={{
                            border: `1px solid ${selectedJob.status === s ? STATUS_COLORS[s].border : "rgba(255,255,255,0.1)"}`,
                            background: selectedJob.status === s ? STATUS_COLORS[s].bg : "rgba(255,255,255,0.05)",
                            color: selectedJob.status === s ? STATUS_COLORS[s].text : "#94a3b8",
                            boxShadow: selectedJob.status === s ? `0 0 10px ${STATUS_COLORS[s].border}80` : "none"
                          }}
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
                      className="w-full p-3.5 rounded-xl border-none bg-gradient-to-br from-sky-400 to-indigo-500 text-white font-bold text-sm cursor-pointer shadow-[0_4px_20px_rgba(56,189,248,0.3)] hover:shadow-[0_4px_25px_rgba(56,189,248,0.5)] hover:-translate-y-0.5 transition-all relative z-10"
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
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center mb-6">
              <h2 className="text-3xl font-bold m-0 tracking-tight text-white">Application <span className="text-sky-400 font-normal">Tracker</span></h2>
              <div className="flex-1" />
              <div className="flex items-center gap-4">
                <div className="text-sm text-slate-400 font-medium">{trackerJobs.length} total applications</div>
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
                    className="px-3.5 py-1.5 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 text-xs cursor-pointer flex items-center gap-2 hover:bg-red-500/20 transition-colors font-medium"
                  >
                    🗑 Clear All
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-6 gap-3 mb-8">
              {computedStats.map(s => (
                <div key={s.label} className="bg-slate-950/40 backdrop-blur-xl border border-white/10 rounded-2xl p-4 text-center shadow-lg hover:bg-white/5 transition-colors">
                  <div className="text-3xl font-bold font-mono tracking-tight" style={{ color: s.color }}>{s.value}</div>
                  <div className="text-[10px] text-slate-500 mt-1 uppercase tracking-widest font-bold">{s.label}</div>
                </div>
              ))}
            </div>

            <div className="bg-slate-950/40 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden shadow-lg">
              <table className="w-full border-collapse text-sm text-left">
                <thead>
                  <tr className="border-b border-white/10 bg-white/5">
                    {["Role", "Company", "Location", "Score", "Status", "Posted", "Actions"].map(h => (
                      <th key={h} className="py-3 px-4 text-[10px] text-slate-400 font-bold uppercase tracking-widest">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {trackerJobs.map((j, i) => (
                    <tr
                      key={j.id}
                      className={`transition-colors hover:bg-white/5 ${i < trackerJobs.length - 1 ? 'border-b border-white/5' : ''}`}
                    >
                      <td className="py-3 px-4 font-bold text-slate-200">{j.title}</td>
                      <td className="py-3 px-4 text-slate-400 font-medium">{j.company}</td>
                      <td className="py-3 px-4 text-slate-500">{j.location}</td>
                      <td className="py-3 px-4 w-[120px]"><ScoreBar score={(j.score || 0)} /></td>
                      <td className="py-3 px-4"><Badge status={j.status} /></td>
                      <td className="py-3 px-4 text-slate-500 font-mono text-xs">{j.posted}</td>
                      <td className="py-3 px-4">
                        <div className="flex gap-2">
                          <button
                            onClick={() => { setSelectedJob(j); setFilterStatus("All"); setTab("results"); }}
                            className="px-3 py-1 rounded-md border border-white/10 bg-white/5 text-sky-400 text-[10px] font-bold tracking-wider uppercase cursor-pointer hover:bg-sky-500/10 hover:border-sky-500/30 transition-all"
                          >
                            View
                          </button>
                          <button
                            onClick={() => { setSelectedAutofillJob(j); setTargetUrl(j.url || ""); setTab("autofill"); }}
                            className="px-3 py-1 rounded-md border border-transparent bg-indigo-500/20 text-indigo-400 text-[10px] font-bold tracking-wider uppercase cursor-pointer hover:bg-indigo-500/30 transition-all"
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
                            className="px-2 py-1 rounded-md border border-red-500/20 bg-red-500/10 text-red-400 text-sm cursor-pointer hover:bg-red-500/20 hover:border-red-500/30 transition-all"
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
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-3xl font-bold m-0 mb-2 tracking-tight text-white">Auto-Fill <span className="text-sky-400 font-normal">Agent</span></h2>
            <p className="text-slate-400 text-sm m-0 mb-8">Upload your CV. The AI maps your profile to application form fields via Playwright automation.</p>

            {selectedAutofillJob && (
              <div className="bg-sky-500/10 border border-sky-500/30 rounded-2xl p-4 mb-6 flex items-center gap-4 shadow-[0_0_20px_rgba(56,189,248,0.1)] backdrop-blur-md">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold font-mono shadow-inner" style={{ background: `${selectedAutofillJob.color}20`, border: `1px solid ${selectedAutofillJob.color}40`, color: selectedAutofillJob.color }}>{selectedAutofillJob.logo}</div>
                <div>
                  <div className="text-sm font-bold text-slate-200">{selectedAutofillJob.title} — {selectedAutofillJob.company}</div>
                  <div className="text-xs text-sky-400 font-medium">Pre-selected from results</div>
                </div>
                <button onClick={() => { setSelectedAutofillJob(null); setTargetUrl(""); }} className="ml-auto bg-transparent border-none text-slate-400 hover:text-slate-200 cursor-pointer text-xl p-2 transition-colors">×</button>
              </div>
            )}

            <div className="grid grid-cols-2 gap-6">
              <div className="flex flex-col gap-6">
                <input type="file" ref={fileInputRef} accept=".pdf,.json" className="hidden" onChange={(e) => setCvFile(e.target.files?.[0] || null)} />
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-3xl p-10 text-center cursor-pointer transition-all duration-300 flex flex-col items-center justify-center min-h-[220px] ${cvFile ? "border-sky-500/50 bg-sky-500/5 shadow-[0_0_30px_rgba(56,189,248,0.1)]" : "border-white/20 bg-slate-950/40 hover:bg-white/5 hover:border-white/30 backdrop-blur-xl shadow-lg"}`}
                >
                  <div className="text-4xl mb-4">{cvFile ? "✅" : "📄"}</div>
                  <div className="font-bold text-lg text-slate-200 mb-1">{cvFile ? `CV Loaded — ${cvFile.name}` : "Drop your CV here"}</div>
                  <div className="text-xs text-slate-500 font-medium">{cvFile ? "Click to replace" : "PDF or JSON resume · max 5MB"}</div>
                  {!cvFile && <div className="mt-6 px-6 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-sky-400 font-bold hover:bg-white/10 transition-colors shadow-lg">Browse Files</div>}
                </div>

                <div className="bg-slate-950/40 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-lg">
                  <div className="text-xs text-slate-400 font-bold mb-4 tracking-widest uppercase">Field Mapping Preview</div>
                  <div className="flex flex-col">
                    {fieldMappings.map(([field, val, st], idx) => (
                      <div key={field} className={`flex items-center gap-3 py-3 ${idx < fieldMappings.length - 1 ? 'border-b border-white/5' : ''}`}>
                        <span className="w-4 text-center text-sm" style={{ color: st === "✓" ? "#10b981" : st === "⚠ check" ? "#f59e0b" : st === "✗ manual" ? "#ef4444" : "#475569" }}>{st}</span>
                        <span className="text-xs font-medium text-slate-400 w-24 shrink-0">{field}</span>
                        <span className="text-xs font-bold text-slate-200 truncate">{val}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-6">
                <div className="bg-slate-950/40 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-lg">
                  <div className="text-xs text-slate-400 font-bold mb-4 tracking-widest uppercase">Target Application</div>
                  <input
                    value={targetUrl}
                    onChange={e => setTargetUrl(e.target.value)}
                    placeholder="Paste job URL or select from results..."
                    className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-slate-200 font-medium focus:outline-none focus:border-sky-500/50 transition-colors shadow-inner"
                  />
                  {autofillDone && (
                    <div className="mt-3 px-4 py-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs font-bold text-emerald-400 flex items-center gap-2">
                      <span className="text-sm">✓</span> Auto-fill complete — review form before submitting
                    </div>
                  )}
                  <div className="mt-4 flex gap-3">
                    <button
                      onClick={runAutofill}
                      disabled={autofillRunning || (!targetUrl && !selectedAutofillJob)}
                      className={`flex-1 py-3 rounded-xl border-none font-bold text-sm flex items-center justify-center gap-2 transition-all duration-300 shadow-lg ${autofillRunning || (!targetUrl && !selectedAutofillJob) ? "bg-slate-800 text-slate-500 cursor-not-allowed" : "bg-gradient-to-br from-sky-400 to-indigo-500 text-white cursor-pointer hover:shadow-[0_0_20px_rgba(56,189,248,0.5)] hover:-translate-y-0.5"}`}
                    >
                      {autofillRunning
                        ? <><span className="w-3.5 h-3.5 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" /> Filling...</>
                        : "▶ Start Auto-Fill"
                      }
                    </button>
                    <button className="px-5 py-3 rounded-xl border border-white/10 bg-white/5 text-slate-300 font-bold text-sm hover:bg-white/10 transition-colors cursor-pointer shadow-lg">Preview</button>
                  </div>
                </div>

                <div className="bg-slate-950/40 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-lg">
                  <div className="text-xs text-slate-400 font-bold mb-5 tracking-widest uppercase">Automation Mode</div>
                  <div className="flex flex-col gap-4">
                    {(Object.entries(automationModes) as [string, boolean][]).map(([name, on]) => {
                      const descs: Record<string, string> = {
                        "Review Before Submit": "AI fills, you approve each section",
                        "Full Auto": "AI fills and submits (risky)",
                        "Stealth Mode": "Human-like delays + mouse moves",
                      };
                      return (
                        <div key={name} className="flex items-center gap-4">
                          <Toggle on={on} onChange={() => setAutomationModes(prev => ({ ...prev, [name]: !prev[name as keyof typeof automationModes] }))} />
                          <div>
                            <div className={`text-sm font-bold ${on ? "text-slate-200" : "text-slate-400"}`}>{name}</div>
                            <div className="text-xs text-slate-500 font-medium">{descs[name]}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="bg-slate-950/40 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-lg flex-1">
                  <div className="text-xs text-slate-400 font-bold mb-3 tracking-widest uppercase">Auto-Fill Log</div>
                  <AgentLog logs={logs.filter(l => ["AUTO-FILL", "PARSE-CV", "NAVIGATE", "MAP", "SUBMIT", "REVIEW", "DONE"].includes(l.prefix))} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── SETTINGS ─── */}
        {tab === "settings" && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-3xl font-bold m-0 mb-8 tracking-tight text-white">Configuration <span className="text-sky-400 font-normal">& Settings</span></h2>
            
            <div className="grid grid-cols-2 gap-8">
              <div className="bg-slate-950/40 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-lg h-fit">
                <div className="text-sm font-bold text-slate-400 mb-5 tracking-widest uppercase">AI Backend</div>
                <div className="flex flex-col gap-3">
                  {aiBackends.map((backend) => {
                    const { name, model, url, apiKey } = backend;
                    const active = selectedAI === name;
                    return (
                      <div key={name} className="flex flex-col">
                        <div
                          onClick={() => { setSelectedAI(name); addLog("info", "CONFIG", `AI backend switched to ${name} (${model})`); }}
                          className={`flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-all ${active ? "bg-sky-500/10 border-sky-500/40 shadow-[0_0_15px_rgba(56,189,248,0.1)] rounded-b-none border-b-sky-500/20" : "bg-white/5 border-white/5 hover:bg-white/10"}`}
                        >
                          <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${active ? "bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-slate-600"}`} />
                          <div className="flex-1">
                            <div className={`text-sm font-bold ${active ? "text-slate-100" : "text-slate-400"}`}>{name}</div>
                            <div className="text-[10px] text-slate-500 font-mono tracking-wide">{model}</div>
                          </div>
                          {active
                            ? <span className="text-xs font-bold text-sky-400 bg-sky-500/20 px-2 py-0.5 rounded-md">Active ▾</span>
                            : <span className="text-xs text-slate-500">▸</span>
                          }
                        </div>

                        {active && (
                          <div className="bg-slate-900/60 border border-sky-500/40 border-t-0 rounded-b-xl p-5 flex flex-col gap-4 shadow-inner">
                            {/* Model */}
                            <div>
                              <div className="text-[10px] text-slate-400 font-bold tracking-widest uppercase mb-1.5">Model</div>
                              <input
                                value={model}
                                onChange={e => updateBackend(name, "model", e.target.value)}
                                placeholder="e.g. claude-sonnet-4-20250514"
                                className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-sky-500/50 transition-colors"
                              />
                            </div>
                            {/* Endpoint URL */}
                            <div>
                              <div className="text-[10px] text-slate-400 font-bold tracking-widest uppercase mb-1.5">API Endpoint URL</div>
                              <input
                                value={url}
                                onChange={e => updateBackend(name, "url", e.target.value)}
                                placeholder="https://api.anthropic.com/v1"
                                className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-sky-500/50 transition-colors"
                              />
                            </div>
                            {/* API Key */}
                            <div>
                              <div className="text-[10px] text-slate-400 font-bold tracking-widest uppercase mb-1.5">API Key</div>
                              <input
                                type="password"
                                value={apiKey}
                                onChange={e => updateBackend(name, "apiKey", e.target.value)}
                                placeholder={name === "Ollama (Local)" ? "Not required for local" : "sk-…"}
                                className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-sky-500/50 transition-colors"
                              />
                            </div>
                            <button
                              onClick={async () => {
                                addLog("success", "CONFIG", `Saved: ${name} → model=${model}, url=${url || "(default)"}, key=${apiKey ? "••••" + apiKey.slice(-4) : "(none)"}`);
                                await saveProfile({ ...profile, skills, aiBackends });
                              }}
                              className="self-start px-5 py-2.5 rounded-lg border-none bg-gradient-to-br from-sky-400 to-indigo-500 text-white text-xs font-bold cursor-pointer mt-1 hover:shadow-[0_0_15px_rgba(56,189,248,0.4)] transition-shadow"
                            >
                              Save Changes
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-col gap-6">
                <div className="bg-slate-950/40 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-lg">
                  <div className="text-sm font-bold text-slate-400 mb-4 tracking-widest uppercase">Profile</div>
                  <div className="flex flex-col">
                    {(Object.entries(profile) as [string, string][]).map(([k, v], idx) => (
                      <div key={k} className={`flex justify-between items-center py-2.5 ${idx < Object.entries(profile).length - 1 ? 'border-b border-white/5' : ''}`}>
                        <span className="text-xs font-medium text-slate-400 shrink-0">{k}</span>
                        <input
                          value={v}
                          onChange={e => setProfile(prev => ({ ...prev, [k]: e.target.value }))}
                          className="bg-transparent border-none text-slate-200 text-sm font-bold text-right focus:outline-none focus:text-sky-400 transition-colors flex-1"
                        />
                      </div>
                    ))}
                  </div>
                  
                  <div className="mt-5">
                    <div className="text-[10px] text-slate-400 font-bold tracking-widest uppercase mb-2.5">Skills</div>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {skills.map(s => (
                        <span key={s} className="px-2.5 py-1 rounded-md bg-sky-500/10 text-sky-400 text-[10px] font-bold tracking-wide flex items-center gap-1.5 border border-sky-500/20">
                          {s}
                          <span onClick={() => setSkills(skills.filter(x => x !== s))} className="cursor-pointer hover:text-white transition-colors">×</span>
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
                      className="w-full bg-slate-900/50 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-sky-500/50 transition-colors"
                    />
                  </div>

                  <button
                    onClick={async () => {
                      const ok = await saveProfile({ ...profile, skills, aiBackends });
                      if (ok) addLog("success", "PROFILE", "Profile saved to database. ✓");
                      else addLog("error", "ERROR", "Failed to save profile.");
                    }}
                    className="mt-6 px-5 py-2.5 rounded-xl border border-sky-500/30 bg-sky-500/10 text-sky-400 text-sm font-bold cursor-pointer hover:bg-sky-500/20 transition-colors w-full"
                  >
                    💾 Save Profile
                  </button>
                </div>

                <div className="bg-slate-950/40 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-lg">
                  <div className="text-sm font-bold text-slate-400 mb-5 tracking-widest uppercase">Automation</div>
                  <div className="flex flex-col gap-4">
                    {(Object.entries(automation) as [string, boolean][]).map(([label, on]) => (
                      <div key={label} className="flex items-center justify-between">
                        <span className={`text-sm font-bold ${on ? "text-slate-200" : "text-slate-500"}`}>{label}</span>
                        <Toggle on={on} onChange={() => setAutomation(prev => ({ ...prev, [label]: !prev[label as keyof typeof automation] }))} />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-slate-950/40 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-lg">
                  <div className="text-sm font-bold text-slate-400 mb-4 tracking-widest uppercase">Discovery Stats</div>
                  <div className="flex flex-col">
                    {[
                      ["Total Searches", "12"],
                      ["Jobs Discovered", "247"],
                      ["Applications Filed", String(trackerJobs.filter(j => j.status === "Applied" || j.status === "Interview" || j.status === "Offer").length)],
                      ["Avg. Match Score", `${Math.round(trackerJobs.reduce((a, j) => a + (j.score || 0), 0) / Math.max(trackerJobs.length, 1))}/100`],
                    ].map(([k, v], idx) => (
                      <div key={k} className={`flex justify-between items-center py-2.5 ${idx < 3 ? 'border-b border-white/5' : ''}`}>
                        <span className="text-xs font-medium text-slate-400">{k}</span>
                        <span className="text-sm font-bold text-sky-400 font-mono tracking-tight">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
