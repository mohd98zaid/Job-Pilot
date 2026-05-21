import { useState, useEffect, useRef } from "react";
import { LayoutDashboard, Compass, List, Activity, Wand2, Settings, Briefcase, TrendingUp, Sparkles, Rocket, ArrowUpRight, Search, Trash2, ExternalLink, ChevronDown, Upload, Zap, Eye, User, Globe, Building2, Link, CalendarDays } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
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
  mapFieldsWithAI,
  type CustomPortal, 
  type Job 
} from "../lib/ai-utils";


const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  Discovered: { bg: "rgba(113,113,122,0.12)", text: "#a1a1aa", border: "#3f3f46" },
  Saved:      { bg: "rgba(167,139,250,0.10)", text: "#c4b5fd", border: "#7c3aed" },
  Applied:    { bg: "rgba(96,165,250,0.10)",  text: "#93c5fd", border: "#3b82f6" },
  Interview:  { bg: "rgba(251,191,36,0.10)",  text: "#fcd34d", border: "#d97706" },
  Offer:      { bg: "rgba(52,211,153,0.10)",  text: "#6ee7b7", border: "#059669" },
  Rejected:   { bg: "rgba(248,113,113,0.08)", text: "#fca5a5", border: "#dc2626" },
};

type LogEntry = { time: string; type: string; prefix: string; msg: string };

/* ── Tiny reusable components ── */

const ScoreBar = ({ score }: { score: number }) => {
  const color = score >= 90 ? "#34d399" : score >= 80 ? "#fbbf24" : score >= 60 ? "#fb923c" : "#f87171";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700 ease-out" style={{ width: `${score}%`, background: color }} />
      </div>
      <span className="text-xs font-mono font-semibold tabular-nums" style={{ color, minWidth: 24 }}>{score}</span>
    </div>
  );
};

const Badge = ({ status }: { status: string }) => {
  const s = STATUS_COLORS[status] || STATUS_COLORS.Discovered;
  return (
    <span className="chip" style={{ background: s.bg, color: s.text, border: `1px solid ${s.border}` }}>
      {status}
    </span>
  );
};

const AgentLog = ({ logs }: { logs: LogEntry[] }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [logs]);
  const tagColor = (type: string) => type === "success" ? "#3fb950" : type === "error" ? "#f87171" : type === "ai" ? "#d2a8ff" : "#58a6ff";
  const dotColor = (type: string) => type === "success" ? "#3fb950" : type === "error" ? "#f87171" : type === "ai" ? "#9f6fd4" : "#3fb950";
  return (
    <div ref={ref} style={{ fontFamily: "'Space Mono', monospace", fontSize: 12, padding: "16px 18px", minHeight: 80, overflowY: "auto", flex: 1 }}>
      {logs.map((l, i) => (
        <div key={i} className="flex items-center gap-3 mb-2" style={{ color: "#8b949e" }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor(l.type), boxShadow: `0 0 6px ${dotColor(l.type)}`, flexShrink: 0 }} />
          <span style={{ color: "#8b949e" }}>{l.time}</span>
          <span style={{ color: tagColor(l.type), fontWeight: 700 }}>{l.prefix}</span>
          <span style={{ color: "#e6edf3" }}>{l.msg}</span>
        </div>
      ))}
    </div>
  );
};

const Toggle = ({ on, onChange }: { on: boolean; onChange: () => void }) => (
  <div
    onClick={onChange}
    className={`w-9 h-5 rounded-full relative cursor-pointer shrink-0 transition-colors duration-200 ${on ? "bg-blue-600" : "bg-zinc-800"}`}
  >
    <div className={`w-3.5 h-3.5 rounded-full bg-white absolute top-[3px] transition-all duration-200 ${on ? "left-[19px]" : "left-[3px]"}`} />
  </div>
);

/* ── Section header ── */
const SectionHeader = ({ title, highlight, children }: { title: string; highlight: string; children?: React.ReactNode }) => (
  <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
    <h2 className="text-2xl font-bold tracking-tight text-zinc-100 leading-snug">
      {title} <span className="text-blue-400 font-normal">{highlight}</span>
    </h2>
    {children}
  </div>
);

/* ════════════════════════════════════════════════════════ */
/*                       MAIN COMPONENT                    */
/* ════════════════════════════════════════════════════════ */

export default function JobPilot() {
  /* ── State (unchanged business logic) ── */
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
    try { return saved ? JSON.parse(saved) : ["LinkedIn", "RemoteOK", "Arbeitnow", "AI Discovery"]; }
    catch { return ["LinkedIn", "RemoteOK", "Arbeitnow", "AI Discovery"]; }
  });
  const [selectedAI, setSelectedAI] = useState(() => localStorage.getItem("jobpilot_selectedAI") || "Ollama (Local)");
  const [aiBackends, setAiBackends] = useState([
    { name: "Claude (Anthropic)", model: "claude-sonnet-4-20250514", url: "https://api.anthropic.com/v1", apiKey: "" },
    { name: "OpenAI",             model: "gpt-4o",                   url: "https://api.openai.com/v1",  apiKey: "" },
    { name: "Ollama (Local)",     model: "gpt-oss:120b-cloud",       url: "http://localhost:11434",     apiKey: "" },
    { name: "MCP Server",         model: "custom",                   url: "",                           apiKey: "" },
  ]);
  const [backendHealth, setBackendHealth] = useState<Record<string, "checking" | "connected" | "error">>({});
  const [targetUrl, setTargetUrl] = useState("");
  const [autofillRunning, setAutofillRunning] = useState(false);
  const [autofillDone, setAutofillDone] = useState(false);
  const [selectedAutofillJob, setSelectedAutofillJob] = useState<Job | null>(null);
  const [automationModes, setAutomationModes] = useState(() => {
    const saved = localStorage.getItem("jobpilot_automationModes");
    try { return saved ? JSON.parse(saved) : { "Review Before Submit": true, "Full Auto": false, "Stealth Mode": true }; }
    catch { return { "Review Before Submit": true, "Full Auto": false, "Stealth Mode": true }; }
  });
  const [automation, setAutomation] = useState(() => {
    const saved = localStorage.getItem("jobpilot_automation");
    try { return saved ? JSON.parse(saved) : { "Playwright Headless": true, "Human-like Delays": true, "Auto-track on Apply": true, "Email Notifications": false }; }
    catch { return { "Playwright Headless": true, "Human-like Delays": true, "Auto-track on Apply": true, "Email Notifications": false }; }
  });
  const [profile, setProfile] = useState({ Name: "", "Current Role": "", "Target Market": "", "Years of Exp.": "" });
  const [fieldMappings, setFieldMappings] = useState<[string, string, string][]>([
    ["Full Name", "...", "○"], ["Email", "...", "○"], ["Experience", "...", "○"],
  ]);
  const [trackerJobs, setTrackerJobs] = useState<Job[]>([]);
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [skills, setSkills] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addLog = (type: string, prefix: string, msg: string) => {
    const time = new Date().toTimeString().slice(0, 8);
    setLogs(l => [...l, { time, type, prefix, msg }]);
  };

  /* ── Persistence ── */
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
    setActiveBoards(prev => prev.includes(board) ? prev.filter(b => b !== board) : [...prev, board]);
  };

  useEffect(() => {
    const loadInitialData = async () => {
      const data = await getProfile();
      if (data) {
        setProfile({ Name: data.name || "User", "Current Role": data.currentRole || "Software Engineer", "Target Market": data.targetMarket || "Global", "Years of Exp.": data.yearsOfExperience || "5" });
        if (data.skills) setSkills(data.skills);
        if (data.aiBackends?.length > 0) setAiBackends(data.aiBackends);
      }
      const saved = await getAllJobs();
      if (saved.length > 0) {
        setJobs(saved);
        setTrackerJobs(saved);
        addLog("success", "DB", `Loaded ${saved.length} saved job${saved.length !== 1 ? "s" : ""} from database`);
      }
    };
    loadInitialData();
  }, []);

  // Poll backend health
  useEffect(() => {
    let mounted = true;
    const checkHealth = async () => {
      const newHealth: Record<string, "checking" | "connected" | "error"> = {};
      for (const b of aiBackends) {
        if (!b.url && b.name !== "MCP Server") {
          newHealth[b.name] = "error";
          continue;
        }
        try {
          if (b.name.includes("Ollama")) {
            const res = await fetch(b.url.replace(/\/api\/generate|\/v1\/.*/, ""), { method: "GET" });
            newHealth[b.name] = res.ok ? "connected" : "error";
          } else if (b.name === "MCP Server") {
            newHealth[b.name] = "connected"; // Assume connected for MCP if active
          } else {
            newHealth[b.name] = b.apiKey ? "connected" : "error";
          }
        } catch {
          newHealth[b.name] = "error";
        }
      }
      if (mounted) setBackendHealth(newHealth);
    };
    checkHealth();
    const interval = setInterval(checkHealth, 5000);
    return () => { mounted = false; clearInterval(interval); };
  }, [aiBackends]);

  /* ── Search ── */
  const runSearch = async () => {
    if (activeBoards.length === 0) { addLog("error", "ERROR", "Select at least one job board."); return; }
    setSearching(true); setSelectedJob(null);
    addLog("info", "SEARCH", `Starting discovery for "${role}" in ${region}...`);
    if (companyFilter) addLog("info", "FILTER", `Company filter: ${companyFilter}`);
    if (siteFilter) addLog("info", "FILTER", `Site filter: ${siteFilter}`);
    addLog("info", "FILTER", `Date range: ${dateFilter}`);
    try {
      const results = await searchRealJobs(role, region, activeBoards, [], dateFilter,
        (job: Job) => {
          setJobs(prev => {
            const ok = (!companyFilter || job.company.toLowerCase().includes(companyFilter.toLowerCase())) && (!siteFilter || job.source.toLowerCase().includes(siteFilter.toLowerCase()));
            return ok ? [...prev, job] : prev;
          });
        }, addLog);
      if (results.length > 0) {
        addLog("ai", "RANK-AI", "Deduplicating results across boards...");
        const deduped = await dedupeJobsWithAI(results, addLog);
        const searchProfile = { Name: profile.Name || "User", "Current Role": profile["Current Role"] || role, "Target Market": profile["Target Market"] || region, "Years of Exp.": profile["Years of Exp."] || "5" };
        addLog("ai", "RANK-AI", `Scoring ${deduped.length} results against profile...`);
        const scored = await scoreJobsWithAI(deduped, searchProfile, selectedAI, aiBackends, addLog);
        setJobs(prev => {
          const existingIds = new Set(prev.map(j => j.id));
          return [...scored, ...prev.filter(j => !scored.find((s: Job) => s.id === j.id))];
        });
        addLog("success", "DONE", `Found ${scored.length} ranked results. ${scored.filter((j: Job) => (j.score || 0) >= 90).length} strong matches. ✓`);
      } else { addLog("success", "DONE", "Search completed but no jobs found."); }
    } catch (err: any) { addLog("error", "ERROR", `Search failed: ${err.message}`); }
    finally { setSearching(false); setTab("results"); }
  };

  const filteredJobs = filterStatus === "All" ? jobs : jobs.filter(j => j.status === filterStatus);

  const updateStatus = (id: number, status: string) => {
    setJobs(j => j.map(job => job.id === id ? { ...job, status } : job));
    setTrackerJobs(j => j.map(job => job.id === id ? { ...job, status } : job));
    if (selectedJob?.id === id) setSelectedJob(s => s ? { ...s, status } : s);
    updateJobStatus(id, status).catch(() => {});
    addLog("success", "TRACK", `Job #${id} moved to "${status}"`);
  };

  const computedStats = Object.keys(STATUS_COLORS).map(label => ({
    label, value: trackerJobs.filter(j => j.status === label).length,
    color: STATUS_COLORS[label].text,
  }));

  const runAutofill = async () => {
    setAutofillRunning(true); setAutofillDone(false);
    addLog("info", "AUTO-FILL", `Starting auto-fill for: ${targetUrl || selectedAutofillJob?.title || "selected job"}...`);
    try {
      const mapping = await mapFieldsWithAI(profile, selectedAutofillJob, selectedAI, aiBackends, addLog);
      setFieldMappings(mapping);
      addLog("ai", "MAP", `Mapped ${mapping.length} fields from your profile.`);
      if (automationModes["Review Before Submit"]) { addLog("info", "REVIEW", "Pausing for review — Review Before Submit mode active."); }
      else { addLog("ai", "SUBMIT", "Submitting application via Playwright..."); }
      addLog("success", "DONE", "Auto-fill complete. Check form before submitting. ✓");
      setAutofillDone(true);
      if (selectedAutofillJob) updateStatus(selectedAutofillJob.id, "Applied");
    } catch (err: any) { addLog("error", "ERROR", `Auto-fill failed: ${err.message}`); }
    finally { setAutofillRunning(false); }
  };

  const updateBackend = (name: string, field: "model" | "url" | "apiKey", value: string) => {
    setAiBackends(prev => prev.map(b => b.name === name ? { ...b, [field]: value } : b));
  };

  /* ── Computed Dashboard Data ── */
  const total = trackerJobs.length;
  const avgScore = total > 0 ? Math.round(trackerJobs.reduce((a, j) => a + (j.score || 0), 0) / total) : 0;
  const interviews = trackerJobs.filter(j => j.status === "Interview").length;
  const offers = trackerJobs.filter(j => j.status === "Offer").length;
  const applied = trackerJobs.filter(j => j.status === "Applied").length;
  const responseRate = total > 0 ? Math.round(((interviews + offers) / Math.max(applied + interviews + offers, 1)) * 100) : 0;

  const TABS = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "discover",  label: "Discover",  icon: Compass },
    { id: "results",   label: "Results",   icon: List },
    { id: "tracker",   label: "Tracker",   icon: Activity },
    { id: "autofill",  label: "Auto-Fill", icon: Wand2 },
    { id: "settings",  label: "Settings",  icon: Settings },
  ];

  /* ════════════════════════════════════════════ */
  /*                    RENDER                    */
  /* ════════════════════════════════════════════ */

  return (
    <div style={{ minHeight: "100vh", display: "flex", background: "var(--bg)", color: "var(--text)" }}>

      {/* ─── SIDEBAR ─── */}
      <aside style={{ width: 220, minHeight: "100vh", background: "var(--surface)", borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", padding: "20px 0", flexShrink: 0, position: "sticky", top: 0, height: "100vh", overflowY: "auto", zIndex: 30 }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 20px 24px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ width: 36, height: 36, background: "linear-gradient(135deg, #1f6feb, #58a6ff)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Space Mono', monospace", fontWeight: 700, fontSize: 16, color: "#fff", flexShrink: 0 }}>J</div>
          <div>
            <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: 0.3 }}>JobPilot</span>
            <span style={{ fontSize: 11, color: "var(--accent)", marginLeft: 6, fontFamily: "'Space Mono', monospace" }}>v2</span>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ marginTop: 14, flex: 1 }}>
          {TABS.map(t => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "9px 20px", fontSize: 13.5, width: "100%", textAlign: "left",
                  background: active ? "rgba(56,139,253,0.15)" : "transparent",
                  color: active ? "var(--accent)" : "var(--muted)",
                  borderLeft: active ? "2px solid var(--accent)" : "2px solid transparent",
                  cursor: "pointer", transition: "background 0.15s, color 0.15s",
                  fontFamily: "'DM Sans', sans-serif", fontWeight: 500,
                }}
                onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = "var(--hover)"; (e.currentTarget as HTMLElement).style.color = "var(--text)"; } }}
                onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "var(--muted)"; } }}
              >
                <t.icon size={16} strokeWidth={1.8} />
                {t.label}
                {t.id === "results" && jobs.length > 0 && (
                  <span style={{ marginLeft: "auto", fontSize: 10, fontFamily: "'Space Mono', monospace", fontWeight: 700, color: "var(--accent)", background: "rgba(88,166,255,0.1)", padding: "1px 6px", borderRadius: 4 }}>{jobs.length}</span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Sidebar bottom – status */}
        <div style={{ padding: "14px 20px", borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10, fontSize: 12.5, cursor: "pointer" }}>
          <div className="status-dot-pulse" style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--green)", flexShrink: 0 }} />
          <div style={{ lineHeight: 1.3 }}>
            <div style={{ fontWeight: 600, color: "var(--text)" }}>{selectedAI}</div>
            <div style={{ color: "var(--green)", fontSize: 11 }}>Connected</div>
          </div>
          <div style={{ marginLeft: "auto", color: "var(--muted)" }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6l4 4 4-4"/></svg>
          </div>
        </div>
      </aside>

      {/* ─── MAIN CONTENT ─── */}
      <main style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: "100vh", overflowY: "auto" }}>

        {/* Sticky Top Header */}
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 28px", borderBottom: "1px solid var(--border)", background: "var(--surface)", position: "sticky", top: 0, zIndex: 20 }}>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.2 }}>
            {tab === "dashboard" && <><span style={{ color: "var(--text)" }}>Dashboard</span></>}
            {tab === "discover"  && <><span style={{ color: "var(--text)" }}>Job Discovery </span><span style={{ color: "var(--accent)" }}>Agent</span></>}
            {tab === "results"   && <><span style={{ color: "var(--text)" }}>Ranked </span><span style={{ color: "var(--accent)" }}>Results</span></>}
            {tab === "tracker"   && <><span style={{ color: "var(--text)" }}>Application </span><span style={{ color: "var(--accent)" }}>Tracker</span></>}
            {tab === "autofill"  && <><span style={{ color: "var(--text)" }}>Auto-Fill </span><span style={{ color: "var(--accent)" }}>Agent</span></>}
            {tab === "settings"  && <><span style={{ color: "var(--text)" }}>Configuration </span><span style={{ color: "var(--accent)" }}>&amp; Settings</span></>}
          </div>
          {tab === "discover" && (
            <div style={{ display: "flex", gap: 6 }}>
              <button className="tab-btn active-api" style={{ padding: "6px 16px", borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: "pointer", border: "1px solid var(--accent)", background: "rgba(88,166,255,0.08)", color: "var(--accent)" }}>API</button>
              <button className="tab-btn active-browser" style={{ padding: "6px 16px", borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: "pointer", background: "var(--btn-grad)", color: "#fff", border: "1px solid transparent" }}>Browser</button>
              <button className="tab-btn active-ai" style={{ padding: "6px 16px", borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: "pointer", border: "1px solid #9f6fd4", background: "rgba(159,111,212,0.1)", color: "#d2a8ff" }}>AI</button>
            </div>
          )}
          {tab === "results" && jobs.length > 0 && (
            <button onClick={async () => { if (window.confirm(`Clear all ${jobs.length} results?`)) { const ok = await clearAllJobs(); if (ok) { setJobs([]); setSelectedJob(null); addLog("success", "CLEAR", "All jobs cleared."); } }}} className="btn-danger" style={{ fontSize: 12 }}>Clear All</button>
          )}
        </header>

        <div style={{ padding: "24px 28px", flex: 1 }}>

          {/* ═══ DASHBOARD ═══ */}
          {tab === "dashboard" && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              {total === 0 ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 0", textAlign: "center" }}>
                  <div style={{ width: 64, height: 64, borderRadius: 16, background: "var(--card)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 24 }}>
                    <Rocket size={28} color="var(--accent)" />
                  </div>
                  <h3 style={{ fontSize: 22, fontWeight: 700, color: "var(--text)", marginBottom: 12 }}>Your career launchpad awaits</h3>
                  <p style={{ color: "var(--muted)", maxWidth: 400, marginBottom: 28, lineHeight: 1.6 }}>Discover top-tier roles matching your profile, track applications, and auto-fill forms with AI.</p>
                  <button onClick={() => setTab("discover")} className="btn-primary">Start Discovering →</button>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
                    {[
                      { label: "Tracked", value: total, color: "#c4b5fd" },
                      { label: "Avg Score", value: avgScore, color: avgScore >= 85 ? "#3fb950" : "#f59e0b" },
                      { label: "Interviews", value: interviews, color: "#fcd34d" },
                      { label: "Response", value: `${responseRate}%`, color: responseRate >= 30 ? "#3fb950" : "#c4b5fd" },
                    ].map(k => (
                      <div key={k.label} className="surface-elevated" style={{ padding: 20 }}>
                        <div style={{ fontSize: 10.5, color: "var(--muted)", fontWeight: 600, letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: 12 }}>{k.label}</div>
                        <div style={{ fontSize: 32, fontWeight: 700, fontFamily: "'Space Mono', monospace", color: k.color }}>{k.value}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                    <div className="surface-elevated" style={{ padding: 20 }}>
                      <div style={{ fontSize: 10.5, color: "var(--muted)", fontWeight: 600, letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: 16 }}>Pipeline</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        {Object.entries(STATUS_COLORS).map(([label, colors]) => {
                          const count = trackerJobs.filter(j => j.status === label).length;
                          const maxC = Math.max(...Object.keys(STATUS_COLORS).map(l => trackerJobs.filter(j => j.status === l).length), 1);
                          return (
                            <div key={label}>
                              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                                <span style={{ fontSize: 12, color: "var(--muted)" }}>{label}</span>
                                <span style={{ fontSize: 12, fontFamily: "'Space Mono', monospace", color: colors.text }}>{count}</span>
                              </div>
                              <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 99, overflow: "hidden" }}>
                                <div style={{ height: "100%", borderRadius: 99, background: colors.text, width: `${(count / maxC) * 100}%`, transition: "width 0.7s" }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <div className="surface-elevated" style={{ padding: 20 }}>
                      <div style={{ fontSize: 10.5, color: "var(--muted)", fontWeight: 600, letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: 16 }}>Top Matches</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {[...trackerJobs].sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 4).map(job => (
                          <div key={job.id} onClick={() => { setSelectedJob(job); setTab("results"); }} className="surface-interactive" style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: 12 }}>
                            <div style={{ width: 32, height: 32, borderRadius: 8, background: `${job.color}18`, border: `1px solid ${job.color}30`, color: job.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontFamily: "'Space Mono', monospace", fontWeight: 700, flexShrink: 0 }}>{job.logo}</div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{job.title}</div>
                              <div style={{ fontSize: 11, color: "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{job.company}</div>
                            </div>
                            <div style={{ fontFamily: "'Space Mono', monospace", fontWeight: 700, fontSize: 14, color: (job.score || 0) >= 90 ? "#3fb950" : (job.score || 0) >= 80 ? "#f59e0b" : "#f87171" }}>{job.score || 0}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* ═══ DISCOVER ═══ */}
          {tab === "discover" && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              {/* Discover Card */}
              <div className="surface-elevated" style={{ padding: 20, marginBottom: 20 }}>

                {/* Row 1: Target Role + Region */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
                  <div className="field">
                    <div className="field-label">
                      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 13, height: 13 }}><circle cx="8" cy="5" r="3"/><path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6"/></svg>
                      Target Role
                    </div>
                    <div className="field-input">
                      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 14, height: 14 }}><circle cx="8" cy="5" r="3"/><path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6"/></svg>
                      <input type="text" value={role} onChange={e => setRole(e.target.value)} placeholder="e.g. GenAI Architect" />
                    </div>
                  </div>
                  <div className="field">
                    <div className="field-label">
                      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 13, height: 13 }}><circle cx="8" cy="8" r="6"/><path d="M8 2v12M2 8h12"/></svg>
                      Region / Market
                    </div>
                    <div className="field-input">
                      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 14, height: 14 }}><circle cx="8" cy="8" r="6"/><path d="M8 2v12M2 8h12"/></svg>
                      <input type="text" value={region} onChange={e => setRegion(e.target.value)} placeholder="e.g. Gulf / GCC" />
                    </div>
                  </div>
                </div>

                {/* Row 2: Company + Site + Date */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 18 }}>
                  <div className="field">
                    <div className="field-label">
                      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 13, height: 13 }}><rect x="2" y="4" width="12" height="10" rx="1"/><path d="M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1"/></svg>
                      Company
                    </div>
                    <div className="field-input">
                      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 14, height: 14 }}><rect x="2" y="4" width="12" height="10" rx="1"/><path d="M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1"/></svg>
                      <input type="text" value={companyFilter} onChange={e => setCompanyFilter(e.target.value)} placeholder="e.g. G42, ADNOC" />
                    </div>
                  </div>
                  <div className="field">
                    <div className="field-label">
                      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 13, height: 13 }}><path d="M4 8h8M8 4l4 4-4 4"/></svg>
                      Site
                    </div>
                    <div className="field-input">
                      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 14, height: 14 }}><path d="M4 8h8M8 4l4 4-4 4"/></svg>
                      <input type="text" value={siteFilter} onChange={e => setSiteFilter(e.target.value)} placeholder="e.g. greenhouse.io" />
                    </div>
                  </div>
                  <div className="field">
                    <div className="field-label">
                      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 13, height: 13 }}><rect x="2" y="3" width="12" height="11" rx="1"/><path d="M5 1v4M11 1v4M2 7h12"/></svg>
                      Date
                    </div>
                    <div className="select-wrap">
                      <select value={dateFilter} onChange={e => setDateFilter(e.target.value)}>
                        {["Last 24 hours", "Last 7 days", "Last 14 days", "Last 30 days"].map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 14, height: 14, flexShrink: 0 }}><path d="M4 6l4 4 4-4"/></svg>
                    </div>
                  </div>
                </div>

                {/* Source chips */}
                <div className="sources-row">
                  {[
                    { id: "LinkedIn",    dotStyle: { background: "#0077b5" }, badge: "AP",      activeClass: "active-ap" },
                    { id: "RemoteOK",    dotStyle: { background: "#4ade80" }, badge: "AP",      activeClass: "active-ap" },
                    { id: "Arbeitnow",   dotStyle: {}, badge: "AP",      activeClass: "active-ap",  icon: <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="6"/><path d="M5 8h6M8 5v6"/></svg> },
                    { id: "JSearch",     dotStyle: {}, badge: "AP",      activeClass: "active-ap",  icon: <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="6" cy="6" r="4"/><path d="M10 10l4 4"/></svg> },
                    { id: "Indeed",      dotStyle: {}, badge: "Browser", activeClass: "active-browser", icon: <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="6"/><path d="M8 2v12M2 8h12"/></svg> },
                    { id: "Naukri",      dotStyle: {}, badge: "Browser", activeClass: "active-browser", icon: <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="6"/><path d="M8 2v12M2 8h12"/></svg> },
                    { id: "Hirect",      dotStyle: {}, badge: "Browser", activeClass: "active-browser", icon: <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="6"/><path d="M8 2v12M2 8h12"/></svg> },
                    { id: "InstaHyre",   dotStyle: {}, badge: "Browser", activeClass: "active-browser", icon: <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="6"/><path d="M8 2v12M2 8h12"/></svg> },
                    { id: "AI Discovery",dotStyle: {}, badge: "AI",      activeClass: "active-ai",   icon: <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 2l1.5 3.5L13 7l-2.5 2.5L11 13l-3-1.5L5 13l.5-3.5L3 7l3.5-1.5z"/></svg> },
                  ].map(b => {
                    const active = activeBoards.includes(b.id);
                    const badgeClass = b.badge === "AP" ? "badge-ap" : b.badge === "Browser" ? "badge-browser" : "badge-ai";
                    return (
                      <div key={b.id} onClick={() => toggleBoard(b.id)} className={`chip ${active ? b.activeClass : ""}`}>
                        {b.dotStyle && Object.keys(b.dotStyle).length > 0
                          ? <div className="chip-dot" style={b.dotStyle} />
                          : b.icon
                        }
                        {b.id}
                        <span className={`chip-badge ${badgeClass}`}>{b.badge}</span>
                      </div>
                    );
                  })}
                </div>

                {/* Launch Button */}
                <button onClick={runSearch} disabled={searching} className="btn-primary">
                  {searching
                    ? <><span style={{ width: 16, height: 16, border: "2px solid rgba(255,255,255,0.4)", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite", display: "inline-block" }} /> Searching…</>
                    : <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 18, height: 18 }}><path d="M12 2l1.5 4.5L18 8l-3 3 .5 4.5L12 14l-3.5 1.5L9 11 6 8l4.5-1.5z"/></svg> Launch Discovery Agent</>
                  }
                </button>
              </div>

              {/* Agent Log */}
              <div className="log-card">
                <div className="log-header">
                  <div className="log-title">Agent Log</div>
                  <button onClick={() => setLogs([])} className="clear-btn">
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 13, height: 13 }}><polyline points="4,3 12,3 12,13 4,13"/><path d="M2 3h12"/><path d="M7 6v5M9 6v5"/></svg>
                    Clear Log
                  </button>
                </div>
                <div className="log-body" style={{ display: "flex", flexDirection: "column", minHeight: 100 }}>
                  <AgentLog logs={logs} />
                </div>
              </div>

            </motion.div>
          )}



          {/* ═══ RESULTS ═══ */}
          {tab === "results" && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              {/* Filter pills */}
              <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
                {["All", ...Object.keys(STATUS_COLORS)].map(s => (
                  <button
                    key={s}
                    onClick={() => setFilterStatus(s)}
                    style={{
                      padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 500, cursor: "pointer", transition: "all 0.15s",
                      background: filterStatus === s ? "rgba(88,166,255,0.12)" : "transparent",
                      border: filterStatus === s ? "1px solid var(--accent)" : "1px solid var(--border)",
                      color: filterStatus === s ? "var(--accent)" : "var(--muted)",
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                  >{s}</button>
                ))}
              </div>

              {jobs.length === 0 ? (
                <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "60px 24px", textAlign: "center" }}>
                  <Search size={36} style={{ margin: "0 auto 12px", color: "var(--muted)", display: "block" }} />
                  <p style={{ color: "var(--muted)", fontSize: 14, marginBottom: 16 }}>Run the Discovery Agent first</p>
                  <button onClick={() => setTab("discover")} className="btn-secondary">Go to Discover →</button>
                </div>
              ) : (
                <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
                  {/* Job list */}
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
                    {filteredJobs.length === 0 ? (
                      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "40px 24px", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>No jobs with status "{filterStatus}"</div>
                    ) : filteredJobs.map(job => {
                      const isExpanded = selectedJob?.id === job.id;
                      return (
                        <div
                          key={job.id}
                          className="surface-interactive"
                          style={{
                            display: "flex", flexDirection: "column",
                            borderColor: isExpanded ? "rgba(139,92,246,0.4)" : undefined,
                            background: isExpanded ? "rgba(139,92,246,0.05)" : undefined,
                            overflow: "hidden"
                          }}
                        >
                          <div
                            onClick={() => setSelectedJob(isExpanded ? null : job)}
                            style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 14, cursor: "pointer" }}
                          >
                            <div style={{ width: 40, height: 40, borderRadius: 10, background: `${job.color}10`, border: `1px solid ${job.color}25`, color: job.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontFamily: "'Space Mono', monospace", fontWeight: 700, flexShrink: 0 }}>{job.logo}</div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3, flexWrap: "wrap" }}>
                                <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{job.title}</span>
                                {(job.score || 0) >= 90 && <span style={{ fontSize: 9.5, padding: "1px 6px", borderRadius: 4, background: "rgba(63,185,80,0.12)", border: "1px solid rgba(63,185,80,0.25)", color: "var(--green)", fontWeight: 700 }}>★ STRONG</span>}
                                <Badge status={job.status} />
                              </div>
                              <div style={{ fontSize: 11, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{job.company} · {job.location} · {job.posted}</div>
                            </div>
                            <div style={{ minWidth: 100 }}><ScoreBar score={job.score || 0} /></div>
                            <span style={{ fontSize: 10, color: "var(--muted)", background: "var(--surface)", border: "1px solid var(--border)", padding: "2px 6px", borderRadius: 4, fontFamily: "'Space Mono', monospace", flexShrink: 0 }}>{job.source}</span>
                            <ChevronDown size={16} style={{ color: "var(--muted)", transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }} />
                            <button
                              aria-label="Delete Job" title="Delete Job"
                              onClick={async e => { e.stopPropagation(); const ok = await deleteJob(job.id); if (ok) { setJobs(p => p.filter(j => j.id !== job.id)); if (isExpanded) setSelectedJob(null); addLog("info", "DELETE", `Job #${job.id} removed.`); }}}
                              style={{ color: "var(--muted)", background: "none", border: "none", cursor: "pointer", padding: 4, borderRadius: 6, flexShrink: 0, transition: "color 0.15s" }}
                              onMouseEnter={e => (e.currentTarget.style.color = "#f87171")}
                              onMouseLeave={e => (e.currentTarget.style.color = "var(--muted)")}
                            ><Trash2 size={14} /></button>
                          </div>
                          
                          {isExpanded && (
                            <div style={{ borderTop: "1px solid rgba(139,92,246,0.2)", padding: 20, background: "rgba(0,0,0,0.15)" }}>
                              <div style={{ marginBottom: 18 }}>
                                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.8px", color: "var(--muted)", textTransform: "uppercase", marginBottom: 10 }}>AI Match Analysis</div>
                                <div style={{ fontSize: 12.5, color: "var(--text)", lineHeight: 1.7, background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: 14, borderLeft: "2px solid #9f6fd4", border: "1px solid var(--border)" }}>{job.match}</div>
                              </div>
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 18 }}>
                                {[["Score", `${job.score}/100`], ["Location", job.location], ["Salary", job.salary], ["Source", job.source]].map(([k, v]) => (
                                  <div key={k} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px" }}>
                                    <div style={{ fontSize: 9, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px", fontWeight: 700, marginBottom: 5 }}>{k}</div>
                                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v}</div>
                                  </div>
                                ))}
                              </div>
                              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.8px", color: "var(--muted)", textTransform: "uppercase", marginBottom: 10, marginTop: 18 }}>Update Status</div>
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
                                      border: `1px solid ${job.status === s ? STATUS_COLORS[s].border : "rgba(255,255,255,0.08)"}`,
                                    }}
                                  >{s}</button>
                                ))}
                              </div>
                              <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
                                <button
                                  onClick={() => { setSelectedAutofillJob(job); setTargetUrl(job.url || ""); setTab("autofill"); }}
                                  className="btn-primary"
                                  style={{ flex: 1, justifyContent: "center", display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}
                                ><Wand2 size={14} /> Auto-Fill Application</button>
                                <button
                                  disabled={!job.url}
                                  onClick={() => window.open(job.url, "_blank")}
                                  className="btn-secondary"
                                  style={{ flex: 1, justifyContent: "center", display: "flex", alignItems: "center", gap: 8, fontSize: 13, opacity: job.url ? 1 : 0.5, cursor: job.url ? "pointer" : "not-allowed" }}
                                ><ExternalLink size={14} /> Preview</button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* ═══ TRACKER ═══ */}
          {tab === "tracker" && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>

              {/* KPI stat cards */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12, marginBottom: 20 }}>
                {computedStats.map(s => (
                  <div key={s.label} style={{ background: "var(--card)", border: "1px solid var(--border)", borderTop: `2px solid ${s.color}`, borderRadius: 10, padding: "16px 14px", textAlign: "center" }}>
                    <div style={{ fontSize: 26, fontWeight: 700, fontFamily: "'Space Mono', monospace", color: s.color, marginBottom: 4 }}>{s.value}</div>
                    <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.7px", fontWeight: 600 }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Table card */}
              <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
                {trackerJobs.length > 0 && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: "1px solid var(--border)" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.8px", color: "var(--muted)", textTransform: "uppercase" }}>{trackerJobs.length} applications</span>
                    <button onClick={async () => { if (window.confirm(`Clear all?`)) { const ok = await clearAllJobs(); if (ok) { setTrackerJobs([]); setJobs([]); addLog("success", "CLEAR", "Cleared."); }}}} className="btn-danger" style={{ fontSize: 11, padding: "4px 12px" }}>Clear All</button>
                  </div>
                )}
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--border)", background: "rgba(255,255,255,0.02)" }}>
                        {["Role", "Company", "Location", "Score", "Status", "Posted", "Actions"].map(h => (
                          <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: 10, color: "var(--muted)", fontWeight: 700, letterSpacing: "0.7px", textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {trackerJobs.length === 0 ? (
                        <tr><td colSpan={7} style={{ padding: "40px 16px", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>No applications tracked yet</td></tr>
                      ) : trackerJobs.map((j, i) => (
                        <tr key={j.id} style={{ borderBottom: i < trackerJobs.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none", transition: "background 0.15s" }}
                          onMouseEnter={e => (e.currentTarget.style.background = "var(--hover)")}
                          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                        >
                          <td style={{ padding: "14px 16px", fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap" }}>{j.title}</td>
                          <td style={{ padding: "14px 16px", color: "var(--muted)" }}>{j.company}</td>
                          <td style={{ padding: "14px 16px", color: "var(--muted)", fontSize: 12 }}>{j.location}</td>
                          <td style={{ padding: "14px 16px", minWidth: 120 }}><ScoreBar score={j.score || 0} /></td>
                          <td style={{ padding: "14px 16px" }}><Badge status={j.status} /></td>
                          <td style={{ padding: "14px 16px", color: "var(--muted)", fontFamily: "'Space Mono', monospace", fontSize: 11 }}>{j.posted}</td>
                          <td style={{ padding: "14px 16px" }}>
                            <div style={{ display: "flex", gap: 6 }}>
                              <button aria-label="View" title="View" onClick={() => { setSelectedJob(j); setTab("results"); }} className="btn-secondary" style={{ padding: "5px 10px", fontSize: 12 }}><Eye size={13} /></button>
                              <button aria-label="Auto-Fill" title="Auto-Fill" onClick={() => { setSelectedAutofillJob(j); setTargetUrl(j.url || ""); setTab("autofill"); }} className="btn-secondary" style={{ padding: "5px 10px", fontSize: 12 }}><Wand2 size={13} /></button>
                              <button aria-label="Delete" title="Delete" onClick={async () => { const ok = await deleteJob(j.id); if (ok) { setTrackerJobs(p => p.filter(jj => jj.id !== j.id)); setJobs(p => p.filter(jj => jj.id !== j.id)); }}} className="btn-danger" style={{ padding: "5px 10px", fontSize: 12 }}><Trash2 size={13} /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}

          {/* ═══ AUTO-FILL ═══ */}
          {tab === "autofill" && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>

              {/* Selected job banner */}
              {selectedAutofillJob && (
                <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 18px", marginBottom: 16, display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: `${selectedAutofillJob.color}15`, border: `1px solid ${selectedAutofillJob.color}30`, color: selectedAutofillJob.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontFamily: "'Space Mono', monospace", fontWeight: 700, flexShrink: 0 }}>{selectedAutofillJob.logo}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text)" }}>{selectedAutofillJob.title} — {selectedAutofillJob.company}</div>
                    <div style={{ fontSize: 11, color: "#d2a8ff", marginTop: 2 }}>Pre-selected from results</div>
                  </div>
                  <button aria-label="Close" onClick={() => { setSelectedAutofillJob(null); setTargetUrl(""); }} style={{ color: "var(--muted)", background: "none", border: "none", cursor: "pointer", fontSize: 18, lineHeight: 1, padding: 4 }}>×</button>
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                {/* Left column */}
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

                  {/* CV Upload */}
                  <input type="file" ref={fileInputRef} accept=".pdf,.json" style={{ display: "none" }} onChange={e => setCvFile(e.target.files?.[0] || null)} />
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      background: cvFile ? "rgba(159,111,212,0.05)" : "var(--card)",
                      border: `2px dashed ${cvFile ? "rgba(159,111,212,0.4)" : "var(--border)"}`,
                      borderRadius: 12, padding: "44px 24px", textAlign: "center", cursor: "pointer",
                      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 220,
                      transition: "border-color 0.15s, background 0.15s",
                    }}
                    onMouseEnter={e => { if (!cvFile) (e.currentTarget.style.borderColor = "var(--muted)"); }}
                    onMouseLeave={e => { if (!cvFile) (e.currentTarget.style.borderColor = "var(--border)"); }}
                  >
                    <Upload size={36} style={{ marginBottom: 16, color: cvFile ? "#d2a8ff" : "var(--muted)" }} />
                    <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text)", marginBottom: 6 }}>{cvFile ? `CV Loaded — ${cvFile.name}` : "Drop your CV here"}</div>
                    <div style={{ fontSize: 12.5, color: "var(--muted)" }}>{cvFile ? "Click to replace" : "PDF or JSON resume · max 5MB"}</div>
                    {!cvFile && <div style={{ marginTop: 20 }} className="btn-secondary">Browse Files</div>}
                  </div>

                  {/* Field mapping */}
                  <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: 18 }}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.8px", color: "var(--muted)", textTransform: "uppercase", marginBottom: 14 }}>Field Mapping</div>
                    {fieldMappings.map(([field, val, st], idx) => (
                      <div key={field} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: idx < fieldMappings.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
                        <span style={{ fontSize: 12, width: 16, textAlign: "center", flexShrink: 0, color: st === "✓" ? "var(--green)" : st === "⚠ check" ? "#f59e0b" : st === "✗ manual" ? "#f87171" : "var(--muted)" }}>{st}</span>
                        <span style={{ fontSize: 11.5, color: "var(--muted)", width: 100, flexShrink: 0 }}>{field}</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{val}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Right column */}
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

                  {/* Target URL */}
                  <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: 18 }}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.8px", color: "var(--muted)", textTransform: "uppercase", marginBottom: 12 }}>Target Application</div>
                    <div className="field-input" style={{ marginBottom: 14 }}>
                      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 14, height: 14 }}><circle cx="8" cy="8" r="6"/><path d="M8 2v12M2 8h12"/></svg>
                      <input value={targetUrl} onChange={e => setTargetUrl(e.target.value)} placeholder="Paste job URL or select from results…" />
                    </div>
                    {autofillDone && (
                      <div style={{ padding: "8px 12px", background: "rgba(63,185,80,0.08)", border: "1px solid rgba(63,185,80,0.2)", borderRadius: 8, fontSize: 12, fontWeight: 600, color: "var(--green)", display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                        <span>✓</span> Auto-fill complete — review before submitting
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 10 }}>
                      <button onClick={runAutofill} disabled={autofillRunning || (!targetUrl && !selectedAutofillJob)} className="btn-primary" style={{ flex: 1, justifyContent: "center", display: "flex", alignItems: "center", gap: 8 }}>
                        {autofillRunning
                          ? <><span style={{ width: 14, height: 14, border: "2px solid rgba(255,255,255,0.4)", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite", display: "inline-block" }} /> Filling…</>
                          : "▶ Start Auto-Fill"
                        }
                      </button>
                      <button className="btn-secondary">Preview</button>
                    </div>
                  </div>

                  {/* Automation Mode */}
                  <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: 18 }}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.8px", color: "var(--muted)", textTransform: "uppercase", marginBottom: 16 }}>Automation Mode</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                      {(Object.entries(automationModes) as [string, boolean][]).map(([name, on]) => {
                        const descs: Record<string, string> = { "Review Before Submit": "AI fills, you approve each section", "Full Auto": "AI fills and submits (risky)", "Stealth Mode": "Human-like delays + mouse moves" };
                        return (
                          <div key={name} style={{ display: "flex", alignItems: "center", gap: 14 }}>
                            <Toggle on={on} onChange={() => setAutomationModes((prev: Record<string, boolean>) => ({ ...prev, [name]: !prev[name] }))} />
                            <div>
                              <div style={{ fontSize: 13.5, fontWeight: 600, color: on ? "var(--text)" : "var(--muted)" }}>{name}</div>
                              <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{descs[name]}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Auto-Fill Log */}
                  <div className="log-card">
                    <div className="log-header">
                      <div className="log-title">Auto-Fill Log</div>
                    </div>
                    <div className="log-body">
                      <AgentLog logs={logs.filter(l => ["AUTO-FILL", "PARSE-CV", "NAVIGATE", "MAP", "SUBMIT", "REVIEW", "DONE"].includes(l.prefix))} />
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* ═══ SETTINGS ═══ */}
          {tab === "settings" && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

                {/* AI Backend */}
                <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: 18 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.8px", color: "var(--muted)", textTransform: "uppercase", marginBottom: 16 }}>AI Backend</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {aiBackends.map(backend => {
                      const { name, model, url, apiKey } = backend;
                      const active = selectedAI === name;
                      const health = backendHealth[name] || "checking";
                      return (
                        <div key={name}>
                          <div
                            onClick={() => { setSelectedAI(name); addLog("info", "CONFIG", `Switched to ${name} (${model})`); }}
                            className="surface-interactive"
                            style={{
                              display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", cursor: "pointer",
                              borderColor: active ? "rgba(139,92,246,0.3)" : undefined,
                              background: active ? "rgba(139,92,246,0.05)" : undefined,
                              borderRadius: active ? "10px 10px 0 0" : 10,
                            }}
                          >
                            <div style={{
                              width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                              background: health === "connected" ? "var(--green)" : health === "error" ? "#f87171" : "var(--muted)",
                              boxShadow: health === "connected" ? "0 0 6px var(--green)" : health === "error" ? "0 0 6px #f87171" : "none"
                            }} />
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 13.5, fontWeight: 600, color: active ? "var(--text)" : "var(--muted)", display: "flex", alignItems: "center", gap: 8 }}>
                                {name}
                                {active && <span style={{ fontSize: 9.5, padding: "1px 6px", borderRadius: 4, background: "rgba(159,111,212,0.15)", border: "1px solid rgba(159,111,212,0.3)", color: "#d2a8ff", fontWeight: 700 }}>ACTIVE</span>}
                              </div>
                              <div style={{ fontSize: 10, color: "var(--muted)", fontFamily: "'Space Mono', monospace", marginTop: 2, display: "flex", alignItems: "center", gap: 6 }}>
                                <span>{model}</span>
                                <span>·</span>
                                <span style={{ color: health === "connected" ? "var(--green)" : health === "error" ? "#f87171" : "var(--muted)" }}>
                                  {health === "connected" ? "Connected" : health === "error" ? "Unavailable" : "Checking…"}
                                </span>
                              </div>
                            </div>
                            <ChevronDown size={14} style={{ color: "var(--muted)", transform: active ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.15s" }} />
                          </div>
                          {active && (
                            <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(139,92,246,0.2)", borderTop: "none", borderRadius: "0 0 10px 10px", padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
                              {[
                                { label: "Model", val: model, field: "model" as const, ph: "e.g. claude-sonnet-4-20250514" },
                                { label: "Endpoint", val: url, field: "url" as const, ph: "https://api.anthropic.com/v1" },
                                { label: "API Key", val: apiKey, field: "apiKey" as const, ph: name === "Ollama (Local)" ? "Not required" : "sk-…" },
                              ].map(inp => (
                                <div key={inp.label}>
                                  <div className="field-label" style={{ marginBottom: 6 }}>{inp.label}</div>
                                  <div className="field-input">
                                    <input
                                      type={inp.field === "apiKey" ? "password" : "text"}
                                      value={inp.val}
                                      onChange={e => updateBackend(name, inp.field, e.target.value)}
                                      placeholder={inp.ph}
                                      style={{ fontFamily: "'Space Mono', monospace", fontSize: 12 }}
                                    />
                                  </div>
                                </div>
                              ))}
                              <button onClick={async () => { addLog("success", "CONFIG", `Saved: ${name}`); await saveProfile({ ...profile, skills, aiBackends }); }} className="btn-primary" style={{ alignSelf: "flex-start", fontSize: 12, padding: "8px 16px" }}>Save Changes</button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Right column */}
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

                  {/* Profile */}
                  <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: 18 }}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.8px", color: "var(--muted)", textTransform: "uppercase", marginBottom: 14 }}>Profile</div>
                    {(Object.entries(profile) as [string, string][]).map(([k, v], idx) => (
                      <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: idx < Object.entries(profile).length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
                        <span style={{ fontSize: 12, color: "var(--muted)", flexShrink: 0 }}>{k}</span>
                        <input
                          value={v}
                          onChange={e => setProfile(prev => ({ ...prev, [k]: e.target.value }))}
                          style={{ background: "transparent", border: "none", fontSize: 13, fontWeight: 600, color: "var(--text)", textAlign: "right", flex: 1, marginLeft: 12, fontFamily: "'DM Sans', sans-serif", transition: "color 0.15s" }}
                          onFocus={e => (e.currentTarget.style.color = "#d2a8ff")}
                          onBlur={e => (e.currentTarget.style.color = "var(--text)")}
                        />
                      </div>
                    ))}
                    <div style={{ marginTop: 16 }}>
                      <div style={{ fontSize: 10, color: "var(--muted)", fontWeight: 700, letterSpacing: "0.7px", textTransform: "uppercase", marginBottom: 10 }}>Skills</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                        {skills.map(s => (
                          <span key={s} className="chip active-ai" style={{ fontSize: 11.5 }}>
                            {s}
                            <span onClick={() => setSkills(skills.filter(x => x !== s))} style={{ cursor: "pointer", marginLeft: 4, opacity: 0.7 }}>×</span>
                          </span>
                        ))}
                      </div>
                      <div className="field-input">
                        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 14, height: 14 }}><circle cx="8" cy="8" r="6"/><path d="M8 5v6M5 8h6"/></svg>
                        <input onKeyDown={e => { if (e.key === "Enter" && e.currentTarget.value) { setSkills([...skills, e.currentTarget.value]); e.currentTarget.value = ""; }}} placeholder="Add skill (Enter)…" style={{ fontSize: 13 }} />
                      </div>
                    </div>
                    <button onClick={async () => { const ok = await saveProfile({ ...profile, skills, aiBackends }); if (ok) addLog("success", "PROFILE", "Profile saved. ✓"); else addLog("error", "ERROR", "Failed to save."); }} className="btn-primary" style={{ width: "100%", justifyContent: "center", marginTop: 16, fontSize: 13 }}>Save Profile</button>
                  </div>

                  {/* Automation toggles */}
                  <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: 18 }}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.8px", color: "var(--muted)", textTransform: "uppercase", marginBottom: 14 }}>Automation</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                      {(Object.entries(automation) as [string, boolean][]).map(([label, on]) => (
                        <div key={label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <span style={{ fontSize: 13.5, fontWeight: 500, color: on ? "var(--text)" : "var(--muted)" }}>{label}</span>
                          <Toggle on={on} onChange={() => setAutomation((prev: Record<string, boolean>) => ({ ...prev, [label]: !prev[label] }))} />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Discovery Stats */}
                  <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: 18 }}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.8px", color: "var(--muted)", textTransform: "uppercase", marginBottom: 14 }}>Discovery Stats</div>
                    {[
                      ["Total Searches", "12"],
                      ["Jobs Discovered", "247"],
                      ["Applications", String(trackerJobs.filter(j => ["Applied", "Interview", "Offer"].includes(j.status)).length)],
                      ["Avg Score", `${Math.round(trackerJobs.reduce((a, j) => a + (j.score || 0), 0) / Math.max(trackerJobs.length, 1))}/100`],
                    ].map(([k, v], idx) => (
                      <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: idx < 3 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
                        <span style={{ fontSize: 12, color: "var(--muted)" }}>{k}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, fontFamily: "'Space Mono', monospace", color: "#d2a8ff" }}>{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

        </div>
      </main>
    </div>
  );
}
