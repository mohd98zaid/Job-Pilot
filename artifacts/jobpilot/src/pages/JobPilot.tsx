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
  return (
    <div ref={ref} className="font-mono text-[12px] text-zinc-500 p-6 h-full overflow-y-auto leading-loose">
      {logs.map((l, i) => {
        const colorClass = l.type === "success" ? "bg-emerald-500 text-emerald-400" : l.type === "error" ? "bg-red-500 text-red-400" : l.type === "ai" ? "bg-blue-500 text-blue-400" : "bg-emerald-500 text-zinc-200";
        const dotBg = l.type === "success" ? "bg-emerald-500" : l.type === "error" ? "bg-red-500" : l.type === "ai" ? "bg-blue-500" : "bg-emerald-500";
        return (
          <div key={i} className="mb-2 flex gap-4 items-start">
            <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${dotBg}`} />
            <span className="text-zinc-600 font-semibold">{l.time}</span>
            <span className={`font-bold uppercase tracking-wide ${colorClass.split(' ')[1]}`}>{l.prefix}</span>
            <span className="text-zinc-400">{l.msg}</span>
          </div>
        );
      })}
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
    <div className="min-h-screen flex relative z-10">

      {/* ─── SIDEBAR ─── */}
      <aside className="w-[240px] shrink-0 h-screen sticky top-0 flex flex-col border-r border-white/5 bg-[#0D1017] z-30">
        {/* Logo */}
        <div className="px-6 pt-7 pb-6 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-blue-500 flex items-center justify-center text-white text-sm font-bold shadow-lg shadow-blue-500/20">
            J
          </div>
          <span className="font-bold text-base text-zinc-100 tracking-tight">
            JobPilot
          </span>
          <span className="text-[9px] text-zinc-500 font-mono ml-1 px-1.5 py-0.5 rounded bg-white/5">v2</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 flex flex-col gap-1">
          {TABS.map(t => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`relative flex items-center gap-3 px-4 py-3 rounded-lg text-[13px] font-medium transition-all duration-150 border border-transparent cursor-pointer ${
                  active ? "nav-active" : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900"
                }`}
              >
                <t.icon size={16} strokeWidth={active ? 2.2 : 1.8} />
                {t.label}
                {t.id === "results" && jobs.length > 0 && (
                  <span className="ml-auto text-[10px] font-mono font-bold text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded">{jobs.length}</span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Sidebar bottom – status */}
        <div className="px-4 py-4 mt-auto">
          <div className="bg-[#11141C] border border-white/5 rounded-xl p-3 cursor-pointer hover:bg-[#161B22] transition-colors flex items-center justify-between">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-zinc-200">{selectedAI}</span>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" style={{ animation: "pulse-dot 2s infinite" }} />
                <span className="text-[10px] text-emerald-400 font-medium">Connected</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md flex items-center justify-center hover:bg-white/5 transition-colors">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-500"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>
              </div>
              <ChevronDown size={14} className="text-zinc-500" />
            </div>
          </div>
        </div>
      </aside>

      {/* ─── MAIN CONTENT ─── */}
      <main className="flex-1 min-w-0 overflow-y-auto">
        <div className="max-w-[1200px] mx-auto px-8 md:px-12 py-10">

          {/* ═══ DASHBOARD ═══ */}
          {tab === "dashboard" && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="animate-fade-in-up">
              <div className="mb-10">
                <p className="text-[11px] text-blue-400 font-semibold tracking-widest uppercase mb-2">Dashboard</p>
                <h1 className="text-3xl font-bold tracking-tight text-zinc-100">
                  {profile.Name ? `Welcome back, ${profile.Name}` : "Welcome"}
                </h1>
                <p className="text-sm text-zinc-500 mt-2">Here's your career pipeline at a glance.</p>
              </div>

              {total === 0 ? (
                /* Empty state */
                <div className="flex flex-col items-center justify-center py-28 text-center">
                  <div className="w-24 h-24 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-8">
                    <Rocket size={36} className="text-blue-400" />
                  </div>
                  <h3 className="text-2xl font-bold text-zinc-200 mb-3">Your career launchpad awaits</h3>
                  <p className="text-zinc-500 max-w-md mb-10 text-base leading-relaxed">
                    Discover top-tier roles matching your profile, track applications, and auto-fill forms with AI.
                  </p>
                  <button onClick={() => setTab("discover")} className="btn-primary flex items-center gap-2 text-base px-8 py-3">
                    Start Discovering <ArrowUpRight size={18} />
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-8">
                  {/* KPI row */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
                    {[
                      { label: "Tracked", value: total, color: "#c4b5fd", icon: LayoutDashboard },
                      { label: "Avg Score", value: avgScore, color: avgScore >= 85 ? "#6ee7b7" : "#fbbf24", icon: Activity },
                      { label: "Interviews", value: interviews, color: "#fcd34d", icon: Briefcase },
                      { label: "Response", value: `${responseRate}%`, color: responseRate >= 30 ? "#6ee7b7" : "#c4b5fd", icon: TrendingUp },
                    ].map(k => (
                      <div key={k.label} className="surface-elevated p-6 group hover:border-zinc-700 transition-colors">
                        <div className="flex items-center justify-between mb-4">
                          <span className="text-[11px] text-zinc-500 font-semibold tracking-wider uppercase">{k.label}</span>
                          <k.icon size={18} className="text-zinc-600 group-hover:text-zinc-400 transition-colors" />
                        </div>
                        <div className="text-4xl font-bold font-mono tabular-nums tracking-tight" style={{ color: k.color }}>{k.value}</div>
                      </div>
                    ))}
                  </div>

                  {/* Pipeline + source */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    <div className="surface-elevated p-7">
                      <div className="text-xs font-semibold text-zinc-400 mb-5 tracking-wider uppercase">Pipeline</div>
                      <div className="flex flex-col gap-4">
                        {Object.entries(STATUS_COLORS).map(([label, colors]) => {
                          const count = trackerJobs.filter(j => j.status === label).length;
                          const maxC = Math.max(...Object.keys(STATUS_COLORS).map(l => trackerJobs.filter(j => j.status === l).length), 1);
                          return (
                            <div key={label}>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs text-zinc-500">{label}</span>
                                <span className="text-xs font-mono font-semibold" style={{ color: colors.text }}>{count}</span>
                              </div>
                              <div className="h-1 bg-zinc-800/80 rounded-full overflow-hidden">
                                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${(count / maxC) * 100}%`, background: colors.text }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="surface-elevated p-7">
                      <div className="text-xs font-semibold text-zinc-400 mb-5 tracking-wider uppercase">Top Matches</div>
                      <div className="flex flex-col gap-3">
                        {[...trackerJobs].sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 4).map(job => (
                          <div
                            key={job.id}
                            onClick={() => { setSelectedJob(job); setTab("results"); }}
                            className="surface-interactive p-4 flex items-center gap-4 cursor-pointer"
                          >
                            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold font-mono shrink-0" style={{ background: `${job.color}12`, border: `1px solid ${job.color}25`, color: job.color }}>{job.logo}</div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-semibold text-zinc-300 truncate">{job.title}</div>
                              <div className="text-[11px] text-zinc-600 truncate">{job.company}</div>
                            </div>
                            <div className="text-lg font-bold font-mono tabular-nums" style={{ color: (job.score || 0) >= 90 ? "#34d399" : (job.score || 0) >= 80 ? "#fbbf24" : "#f87171" }}>{job.score || 0}</div>
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
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-8">
              
              <div className="flex items-center justify-between">
                <h2 className="text-[26px] font-bold tracking-tight text-zinc-100">
                  Job Discovery <span className="text-emerald-400 font-normal">Agent</span>
                </h2>
                <div className="flex gap-1.5 text-xs font-semibold">
                  <span className="px-4 py-1.5 rounded-full border border-teal-500/30 bg-teal-500/10 text-teal-400">API</span>
                  <span className="px-4 py-1.5 rounded-full bg-blue-600 text-white shadow-lg shadow-blue-500/25 border border-blue-500">Browser</span>
                  <span className="px-4 py-1.5 rounded-full border border-purple-500/30 bg-purple-500/10 text-purple-400">AI</span>
                </div>
              </div>

              {/* Main Search Panel */}
              <div className="surface-elevated p-8">
                
                {/* Form Grid - Row 1: Target Role + Region */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-6 mb-6">
                  {/* Target Role - 7 cols */}
                  <div className="col-span-7 bg-[#1A1F2E] border border-white/[0.06] rounded-2xl p-6">
                    <label className="flex items-center gap-2 text-[11px] text-zinc-400 font-bold tracking-widest uppercase mb-4">
                      <User size={13} className="text-zinc-500" /> Target Role
                    </label>
                    <div className="bg-[#0F1219] border border-white/[0.06] rounded-xl flex items-center px-4 py-1">
                      <User size={15} className="text-zinc-600 shrink-0" />
                      <input value={role} onChange={e => setRole(e.target.value)} placeholder="e.g. GenAI Architect" className="input-base bg-transparent border-none focus:ring-0 focus:box-shadow-none px-3 py-3" />
                    </div>
                  </div>

                  {/* Region - 5 cols */}
                  <div className="col-span-5 bg-[#1A1F2E] border border-white/[0.06] rounded-2xl p-6">
                    <label className="flex items-center gap-2 text-[11px] text-zinc-400 font-bold tracking-widest uppercase mb-4">
                      <Globe size={13} className="text-zinc-500" /> Region / Market
                    </label>
                    <div className="bg-[#0F1219] border border-white/[0.06] rounded-xl flex items-center px-4 py-1">
                      <Globe size={15} className="text-zinc-600 shrink-0" />
                      <input value={region} onChange={e => setRegion(e.target.value)} placeholder="e.g. Gulf / GCC" className="input-base bg-transparent border-none focus:ring-0 focus:box-shadow-none px-3 py-3" />
                    </div>
                  </div>
                </div>

                {/* Form Grid - Row 2: Company + Site + Date */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                  {/* Company */}
                  <div className="bg-[#1A1F2E] border border-white/[0.06] rounded-2xl p-6">
                    <label className="flex items-center gap-2 text-[11px] text-zinc-400 font-bold tracking-widest uppercase mb-4">
                      <Building2 size={13} className="text-zinc-500" /> Company
                    </label>
                    <div className="bg-[#0F1219] border border-white/[0.06] rounded-xl flex items-center px-4 py-1">
                      <Building2 size={15} className="text-zinc-600 shrink-0" />
                      <input value={companyFilter} onChange={e => setCompanyFilter(e.target.value)} placeholder="e.g. G42, ADNOC" className="input-base bg-transparent border-none focus:ring-0 focus:box-shadow-none px-3 py-3" />
                    </div>
                  </div>

                  {/* Site */}
                  <div className="bg-[#1A1F2E] border border-white/[0.06] rounded-2xl p-6">
                    <label className="flex items-center gap-2 text-[11px] text-zinc-400 font-bold tracking-widest uppercase mb-4">
                      <Link size={13} className="text-zinc-500" /> Site
                    </label>
                    <div className="bg-[#0F1219] border border-white/[0.06] rounded-xl flex items-center px-4 py-1">
                      <Link size={15} className="text-zinc-600 shrink-0" />
                      <input value={siteFilter} onChange={e => setSiteFilter(e.target.value)} placeholder="e.g. greenhouse.io" className="input-base bg-transparent border-none focus:ring-0 focus:box-shadow-none px-3 py-3" />
                    </div>
                  </div>

                  {/* Date */}
                  <div className="bg-[#1A1F2E] border border-white/[0.06] rounded-2xl p-6">
                    <label className="flex items-center gap-2 text-[11px] text-zinc-400 font-bold tracking-widest uppercase mb-4">
                      <CalendarDays size={13} className="text-zinc-500" /> Date
                    </label>
                    <div className="bg-[#0F1219] border border-white/[0.06] rounded-xl flex items-center px-3 py-1">
                      <CalendarDays size={15} className="text-zinc-600 shrink-0 ml-1" />
                      <select value={dateFilter} onChange={e => setDateFilter(e.target.value)} className="input-base bg-transparent border-none focus:ring-0 focus:box-shadow-none px-3 py-3 cursor-pointer text-zinc-300 font-medium appearance-none">
                        {["Last 24 hours", "Last 7 days", "Last 14 days", "Last 30 days"].map(o => <option key={o} value={o} className="bg-[#0F1219]">{o}</option>)}
                      </select>
                      <ChevronDown size={14} className="text-zinc-500 shrink-0 mr-1" />
                    </div>
                  </div>
                </div>

                {/* Job Boards Selection */}
                <div className="mb-8 flex gap-2 flex-wrap items-center">
                  {[
                    { id: "LinkedIn", color: "#0ea5e9", badge: "AP" },
                    { id: "RemoteOK", color: "#10b981", badge: "AP" },
                    { id: "Arbeitnow", color: "#8b5cf6", badge: "AP" },
                    { id: "JSearch", color: "#f59e0b", badge: "AP" },
                    { id: "Indeed", color: "#6b7280", badge: "Browser" },
                    { id: "Naukri", color: "#f97316", badge: "Browser" },
                    { id: "Hirect", color: "#6366f1", badge: "Browser" },
                    { id: "InstaHyre", color: "#10b981", badge: "Browser" },
                  ].map(b => {
                    const active = activeBoards.includes(b.id);
                    return (
                      <button
                        key={b.id}
                        onClick={() => toggleBoard(b.id)}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-medium cursor-pointer transition-all duration-200 select-none"
                        style={{
                          background: active ? `${b.color}20` : "transparent",
                          border: `1px solid ${active ? `${b.color}50` : "rgba(255,255,255,0.08)"}`,
                          color: active ? "#f1f5f9" : "#71717a",
                        }}
                      >
                        <span 
                          className="w-2 h-2 rounded-full shrink-0 inline-block"
                          style={{ background: active ? b.color : "#52525b" }}
                        />
                        <span>{b.id}</span>
                        <span 
                          className="text-[9px] font-semibold px-1.5 py-px rounded"
                          style={{
                            background: active ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.04)",
                            color: active ? "#e2e8f0" : "#52525b",
                          }}
                        >{b.badge}</span>
                      </button>
                    );
                  })}
                  
                  {/* AI Discovery Special Button */}
                  <button
                    onClick={() => toggleBoard("AI Discovery")}
                    className="flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[11px] font-bold cursor-pointer transition-all duration-200 select-none"
                    style={{
                      background: activeBoards.includes("AI Discovery") ? "#2563eb" : "transparent",
                      border: `1px solid ${activeBoards.includes("AI Discovery") ? "#3b82f6" : "rgba(255,255,255,0.08)"}`,
                      color: activeBoards.includes("AI Discovery") ? "#ffffff" : "#71717a",
                      boxShadow: activeBoards.includes("AI Discovery") ? "0 4px 12px rgba(37,99,235,0.3)" : "none",
                    }}
                  >
                    <Sparkles size={12} /> AI Discovery
                    <span 
                      className="text-[9px] font-semibold px-1.5 py-px rounded"
                      style={{
                        background: activeBoards.includes("AI Discovery") ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.04)",
                        color: activeBoards.includes("AI Discovery") ? "#ffffff" : "#52525b",
                      }}
                    >AI</span>
                  </button>
                </div>

                {/* Launch Button */}
                <button onClick={runSearch} disabled={searching} className="btn-primary flex items-center gap-3 px-10 py-4 text-[15px] font-bold rounded-xl">
                  {searching
                    ? <><span className="w-4 h-4 border-2 border-white/50 border-t-transparent rounded-full animate-spin" /> Searching…</>
                    : <><Sparkles size={18} /> Launch Discovery Agent</>
                  }
                </button>
              </div>

              {/* Agent Log Panel */}
              <div className="surface-elevated overflow-hidden flex flex-col h-[300px]">
                <div className="px-7 py-5 border-b border-white/[0.06] flex items-center justify-between shrink-0">
                  <span className="text-[13px] font-bold text-zinc-300 uppercase tracking-wider">Agent Log</span>
                  <button onClick={() => setLogs([])} className="text-[11px] text-zinc-500 hover:text-zinc-300 font-semibold flex items-center gap-1.5 transition-colors">
                    <Trash2 size={12} /> Clear Log
                  </button>
                </div>
                <div className="flex-1 p-0 overflow-y-auto bg-[#0B0F15]">
                  <AgentLog logs={logs} />
                </div>
              </div>

            </motion.div>
          )}



          {/* ═══ RESULTS ═══ */}
          {tab === "results" && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <SectionHeader title="Ranked" highlight="Results">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-zinc-500">{jobs.length} jobs</span>
                  {jobs.length > 0 && (
                    <button onClick={async () => { if (window.confirm(`Clear all ${jobs.length} results?`)) { const ok = await clearAllJobs(); if (ok) { setJobs([]); setSelectedJob(null); addLog("success", "CLEAR", "All jobs cleared."); } }}} className="btn-danger text-[11px]">Clear All</button>
                  )}
                </div>
              </SectionHeader>

              {/* Filter pills */}
              <div className="flex gap-3 mb-8 flex-wrap">
                {["All", ...Object.keys(STATUS_COLORS)].map(s => (
                  <button
                    key={s}
                    onClick={() => setFilterStatus(s)}
                    className={`px-4 py-2.5 rounded-xl text-xs font-medium cursor-pointer transition-all duration-200 border ${
                      filterStatus === s ? "shadow-lg shadow-black/20 border-violet-500/40 bg-violet-500/15 text-violet-300" : "bg-transparent border-zinc-800/60 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300 hover:bg-zinc-900/50"
                    }`}
                  >{s}</button>
                ))}
              </div>

              {jobs.length === 0 ? (
                <div className="surface-elevated text-center py-16 text-zinc-600">
                  <Search size={36} className="mx-auto mb-3 text-zinc-700" />
                  <p className="text-sm mb-4">Run the Discovery Agent first</p>
                  <button onClick={() => setTab("discover")} className="btn-secondary text-sm">Go to Discover →</button>
                </div>
              ) : (
                <div className="flex gap-6 items-start">
                  {/* Job list */}
                  <div className="flex-1 flex flex-col gap-3 min-w-0">
                    {filteredJobs.length === 0 ? (
                      <div className="surface text-center py-10 text-zinc-600 text-sm">No jobs with status "{filterStatus}"</div>
                    ) : filteredJobs.map(job => (
                      <div
                        key={job.id}
                        onClick={() => setSelectedJob(job)}
                        className={`surface-interactive p-4 flex items-center gap-4 cursor-pointer ${selectedJob?.id === job.id ? "!border-violet-500/40 !bg-violet-500/5" : ""}`}
                      >
                        <div className="w-10 h-10 rounded-lg flex items-center justify-center text-xs font-bold font-mono shrink-0" style={{ background: `${job.color}10`, border: `1px solid ${job.color}25`, color: job.color }}>{job.logo}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                            <span className="text-sm font-semibold text-zinc-200 truncate">{job.title}</span>
                            {(job.score || 0) >= 90 && <span className="chip bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[9px]">★ STRONG</span>}
                            <Badge status={job.status} />
                          </div>
                          <div className="text-[11px] text-zinc-600 truncate">{job.company} · {job.location} · {job.posted}</div>
                        </div>
                        <div className="min-w-[100px]"><ScoreBar score={job.score || 0} /></div>
                        <span className="text-[10px] text-zinc-600 bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded font-mono shrink-0">{job.source}</span>
                        <button
                          aria-label="Delete Job"
                          title="Delete Job"
                          onClick={async e => { e.stopPropagation(); const ok = await deleteJob(job.id); if (ok) { setJobs(p => p.filter(j => j.id !== job.id)); if (selectedJob?.id === job.id) setSelectedJob(null); addLog("info", "DELETE", `Job #${job.id} removed.`); }}}
                          className="text-zinc-700 hover:text-red-400 cursor-pointer p-1 rounded transition-colors hover:bg-red-500/10 shrink-0"
                        ><Trash2 size={14} /></button>
                      </div>
                    ))}
                  </div>

                  {/* Detail Panel */}
                  {selectedJob && (
                    <div className="w-[340px] shrink-0 surface-elevated p-6 h-fit sticky top-10">
                      <div className="flex justify-between items-start mb-6">
                        <div>
                          <div className="font-bold text-lg text-zinc-100 leading-tight mb-1">{selectedJob.title}</div>
                          <div className="text-zinc-400 text-sm">{selectedJob.company}</div>
                        </div>
                        <button aria-label="Close Job Details" title="Close" onClick={() => setSelectedJob(null)} className="text-zinc-500 hover:text-zinc-200 cursor-pointer text-2xl p-0 bg-transparent border-none transition-colors">×</button>
                      </div>
                      <div className="mb-6">
                        <div className="text-[11px] text-zinc-400 font-semibold tracking-widest uppercase mb-3">AI Match Analysis</div>
                        <div className="text-sm text-zinc-300 leading-relaxed bg-zinc-900/60 rounded-xl p-5 border-l-2 border-l-violet-500 border border-zinc-800 shadow-inner">{selectedJob.match}</div>
                      </div>
                      <div className="grid grid-cols-2 gap-3 mb-5">
                        {[["Score", `${selectedJob.score}/100`], ["Location", selectedJob.location], ["Salary", selectedJob.salary], ["Source", selectedJob.source]].map(([k, v]) => (
                          <div key={k} className="bg-zinc-900/60 rounded-xl p-3 border border-zinc-800">
                            <div className="text-[9px] text-zinc-600 uppercase tracking-widest font-semibold mb-1">{k}</div>
                            <div className="text-xs font-medium text-zinc-300 truncate">{v}</div>
                          </div>
                        ))}
                      </div>
                      <div className="text-[11px] text-zinc-400 font-semibold tracking-widest uppercase mb-3 mt-6">Update Status</div>
                      <div className="flex flex-wrap gap-2.5 mb-8">
                        {Object.keys(STATUS_COLORS).map(s => (
                          <button
                            key={s}
                            onClick={() => updateStatus(selectedJob.id, s)}
                            className="px-3 py-1.5 rounded-lg text-[11px] font-semibold cursor-pointer transition-all border"
                            style={{ borderColor: selectedJob.status === s ? STATUS_COLORS[s].border : "rgba(255,255,255,0.08)", background: selectedJob.status === s ? STATUS_COLORS[s].bg : "transparent", color: selectedJob.status === s ? STATUS_COLORS[s].text : "#a1a1aa" }}
                          >{s}</button>
                        ))}
                      </div>
                      <button
                        onClick={() => { setSelectedAutofillJob(selectedJob); setTargetUrl(selectedJob.url || ""); setTab("autofill"); }}
                        className="btn-primary w-full flex items-center justify-center gap-2 text-sm"
                      ><Wand2 size={14} /> Auto-Fill Application</button>
                      {selectedJob.url && (
                        <a
                          href={selectedJob.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-secondary w-full flex items-center justify-center gap-2 text-sm mt-3"
                        ><ExternalLink size={14} /> View Job Posting</a>
                      )}
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          )}

          {/* ═══ TRACKER ═══ */}
          {tab === "tracker" && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <SectionHeader title="Application" highlight="Tracker">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-zinc-500">{trackerJobs.length} applications</span>
                  {trackerJobs.length > 0 && (
                    <button onClick={async () => { if (window.confirm(`Clear all?`)) { const ok = await clearAllJobs(); if (ok) { setTrackerJobs([]); setJobs([]); addLog("success", "CLEAR", "Cleared."); }}}} className="btn-danger text-[11px]">Clear All</button>
                  )}
                </div>
              </SectionHeader>

              {/* Status pills */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-5 mb-10">
                {computedStats.map(s => (
                  <div key={s.label} className="surface-elevated text-center p-6 border-t-2" style={{ borderTopColor: s.color }}>
                    <div className="text-3xl font-bold font-mono tabular-nums mb-1" style={{ color: s.color }}>{s.value}</div>
                    <div className="text-[10px] text-zinc-500 mt-1 uppercase tracking-widest font-semibold">{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Table */}
              <div className="surface-elevated overflow-hidden overflow-x-auto rounded-2xl">
                <table className="w-full border-collapse text-sm text-left">
                  <thead>
                    <tr className="border-b border-zinc-800/60 bg-zinc-900/30">
                      {["Role", "Company", "Location", "Score", "Status", "Posted", "Actions"].map(h => (
                        <th key={h} className="py-4 px-6 text-[10px] text-zinc-400 font-semibold uppercase tracking-widest">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {trackerJobs.map((j, i) => (
                      <tr key={j.id} className={`transition-colors hover:bg-zinc-800/30 ${i < trackerJobs.length - 1 ? "border-b border-zinc-800/40" : ""}`}>
                        <td className="py-5 px-6 font-semibold text-zinc-200">{j.title}</td>
                        <td className="py-5 px-6 text-zinc-400">{j.company}</td>
                        <td className="py-5 px-6 text-zinc-500">{j.location}</td>
                        <td className="py-5 px-6 w-[140px]"><ScoreBar score={j.score || 0} /></td>
                        <td className="py-5 px-6"><Badge status={j.status} /></td>
                        <td className="py-5 px-6 text-zinc-500 font-mono text-xs">{j.posted}</td>
                        <td className="py-5 px-6">
                          <div className="flex gap-2">
                            <button aria-label="View Job Details" title="View Job Details" onClick={() => { setSelectedJob(j); setTab("results"); }} className="btn-secondary text-xs px-3 py-1.5"><Eye size={14} /></button>
                            <button aria-label="Auto-Fill Application" title="Auto-Fill Application" onClick={() => { setSelectedAutofillJob(j); setTargetUrl(j.url || ""); setTab("autofill"); }} className="btn-secondary text-xs px-3 py-1.5"><Wand2 size={14} /></button>
                            <button aria-label="Delete Job" title="Delete Job" onClick={async () => { const ok = await deleteJob(j.id); if (ok) { setTrackerJobs(p => p.filter(jj => jj.id !== j.id)); setJobs(p => p.filter(jj => jj.id !== j.id)); }}} className="btn-danger text-xs px-2.5 py-1.5"><Trash2 size={14} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}

          {/* ═══ AUTO-FILL ═══ */}
          {tab === "autofill" && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <SectionHeader title="Auto-Fill" highlight="Agent" />
              <p className="text-zinc-500 text-sm -mt-5 mb-8">Upload your CV. The AI maps your profile to application form fields.</p>

              {selectedAutofillJob && (
                <div className="surface-elevated p-5 mb-8 flex items-center gap-4">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold font-mono" style={{ background: `${selectedAutofillJob.color}15`, border: `1px solid ${selectedAutofillJob.color}30`, color: selectedAutofillJob.color }}>{selectedAutofillJob.logo}</div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-zinc-200">{selectedAutofillJob.title} — {selectedAutofillJob.company}</div>
                    <div className="text-[11px] text-violet-400">Pre-selected from results</div>
                  </div>
                  <button aria-label="Close Auto-Fill" title="Close" onClick={() => { setSelectedAutofillJob(null); setTargetUrl(""); }} className="text-zinc-600 hover:text-zinc-300 cursor-pointer text-lg bg-transparent border-none transition-colors">×</button>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="flex flex-col gap-6">
                  {/* CV Upload */}
                  <input type="file" ref={fileInputRef} accept=".pdf,.json" className="hidden" onChange={e => setCvFile(e.target.files?.[0] || null)} />
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className={`surface-interactive border-2 border-dashed border-zinc-700/50 hover:border-zinc-500 p-12 text-center cursor-pointer flex flex-col items-center justify-center min-h-[240px] rounded-2xl transition-all ${cvFile ? "!border-violet-500/40 !bg-violet-500/5" : ""}`}
                  >
                    <Upload size={40} className={`mb-5 ${cvFile ? "text-violet-400" : "text-zinc-500"}`} />
                    <div className="text-lg font-semibold text-zinc-200 mb-2">{cvFile ? `CV Loaded — ${cvFile.name}` : "Drop your CV here"}</div>
                    <div className="text-sm text-zinc-500">{cvFile ? "Click to replace" : "PDF or JSON resume · max 5MB"}</div>
                    {!cvFile && <div className="mt-6 btn-secondary">Browse Files</div>}
                  </div>

                  {/* Field mapping */}
                  <div className="surface-elevated p-8">
                    <div className="text-[11px] text-zinc-400 font-semibold tracking-widest uppercase mb-5">Field Mapping</div>
                    {fieldMappings.map(([field, val, st], idx) => (
                      <div key={field} className={`flex items-center gap-4 py-3 ${idx < fieldMappings.length - 1 ? "border-b border-zinc-800/50" : ""}`}>
                        <span className="w-4 text-center text-xs" style={{ color: st === "✓" ? "#34d399" : st === "⚠ check" ? "#fbbf24" : st === "✗ manual" ? "#f87171" : "#3f3f46" }}>{st}</span>
                        <span className="text-xs text-zinc-500 w-24 shrink-0">{field}</span>
                        <span className="text-xs font-semibold text-zinc-300 truncate">{val}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-6">
                  {/* Target URL */}
                  <div className="surface-elevated p-8">
                    <div className="text-[11px] text-zinc-400 font-semibold tracking-widest uppercase mb-4">Target Application</div>
                    <input value={targetUrl} onChange={e => setTargetUrl(e.target.value)} placeholder="Paste job URL or select from results…" className="input-base mb-5" />
                    {autofillDone && (
                      <div className="px-3 py-2 bg-emerald-500/8 border border-emerald-500/20 rounded-lg text-xs font-semibold text-emerald-400 flex items-center gap-2 mb-3">
                        <span>✓</span> Auto-fill complete — review before submitting
                      </div>
                    )}
                    <div className="flex gap-3 mt-1">
                      <button onClick={runAutofill} disabled={autofillRunning || (!targetUrl && !selectedAutofillJob)} className="btn-primary flex-1 flex items-center justify-center gap-2 text-sm">
                        {autofillRunning ? <><span className="w-3.5 h-3.5 border-2 border-violet-300 border-t-transparent rounded-full animate-spin" /> Filling…</> : "▶ Start Auto-Fill"}
                      </button>
                      <button className="btn-secondary text-sm">Preview</button>
                    </div>
                  </div>

                  {/* Automation Mode */}
                  <div className="surface-elevated p-8">
                    <div className="text-[11px] text-zinc-400 font-semibold tracking-widest uppercase mb-6">Automation Mode</div>
                    <div className="flex flex-col gap-4">
                      {(Object.entries(automationModes) as [string, boolean][]).map(([name, on]) => {
                        const descs: Record<string, string> = { "Review Before Submit": "AI fills, you approve each section", "Full Auto": "AI fills and submits (risky)", "Stealth Mode": "Human-like delays + mouse moves" };
                        return (
                          <div key={name} className="flex items-center gap-4">
                            <Toggle on={on} onChange={() => setAutomationModes((prev: Record<string, boolean>) => ({ ...prev, [name]: !prev[name] }))} />
                            <div>
                              <div className={`text-sm font-semibold ${on ? "text-zinc-200" : "text-zinc-500"}`}>{name}</div>
                              <div className="text-[11px] text-zinc-600">{descs[name]}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Log */}
                  <div className="surface-elevated p-8">
                    <div className="text-[11px] text-zinc-400 font-semibold tracking-widest uppercase mb-4">Auto-Fill Log</div>
                    <AgentLog logs={logs.filter(l => ["AUTO-FILL", "PARSE-CV", "NAVIGATE", "MAP", "SUBMIT", "REVIEW", "DONE"].includes(l.prefix))} />
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* ═══ SETTINGS ═══ */}
          {tab === "settings" && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <SectionHeader title="Configuration" highlight="& Settings" />

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* AI Backend */}
                <div className="surface-elevated p-8">
                  <div className="text-[11px] text-zinc-400 font-semibold tracking-widest uppercase mb-6">AI Backend</div>
                  <div className="flex flex-col gap-3">
                    {aiBackends.map(backend => {
                      const { name, model, url, apiKey } = backend;
                      const active = selectedAI === name;
                      return (
                        <div key={name}>
                          <div
                            onClick={() => { setSelectedAI(name); addLog("info", "CONFIG", `Switched to ${name} (${model})`); }}
                            className={`surface-interactive flex items-center gap-3 px-3.5 py-3 cursor-pointer ${active ? "!border-violet-500/30 !bg-violet-500/5" : ""} ${active ? "rounded-b-none" : ""}`}
                          >
                            <div className={`w-2 h-2 rounded-full shrink-0 ${active ? "bg-emerald-400" : "bg-zinc-700"}`} />
                            <div className="flex-1">
                              <div className={`text-sm font-semibold ${active ? "text-zinc-100" : "text-zinc-500"}`}>{name}</div>
                              <div className="text-[10px] text-zinc-600 font-mono">{model}</div>
                            </div>
                            {active ? <span className="chip bg-violet-500/10 text-violet-400 border border-violet-500/20">Active</span> : <ChevronDown size={14} className="text-zinc-600" />}
                          </div>
                          {active && (
                            <div className="bg-zinc-900/60 border border-violet-500/20 border-t-0 rounded-b-xl p-5 flex flex-col gap-4">
                              {[
                                { label: "Model", val: model, field: "model" as const, ph: "e.g. claude-sonnet-4-20250514" },
                                { label: "Endpoint", val: url, field: "url" as const, ph: "https://api.anthropic.com/v1" },
                                { label: "API Key", val: apiKey, field: "apiKey" as const, ph: name === "Ollama (Local)" ? "Not required" : "sk-…" },
                              ].map(inp => (
                                <div key={inp.label}>
                                  <div className="text-[11px] text-zinc-400 font-semibold tracking-widest uppercase mb-2">{inp.label}</div>
                                  <input
                                    type={inp.field === "apiKey" ? "password" : "text"}
                                    value={inp.val}
                                    onChange={e => updateBackend(name, inp.field, e.target.value)}
                                    placeholder={inp.ph}
                                    className="input-base text-xs font-mono"
                                  />
                                </div>
                              ))}
                              <button
                                onClick={async () => { addLog("success", "CONFIG", `Saved: ${name}`); await saveProfile({ ...profile, skills, aiBackends }); }}
                                className="btn-primary self-start text-xs mt-1"
                              >Save Changes</button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="flex flex-col gap-6">
                  {/* Profile */}
                  <div className="surface-elevated p-8">
                    <div className="text-[11px] text-zinc-400 font-semibold tracking-widest uppercase mb-6">Profile</div>
                    {(Object.entries(profile) as [string, string][]).map(([k, v], idx) => (
                      <div key={k} className={`flex justify-between items-center py-3 ${idx < Object.entries(profile).length - 1 ? "border-b border-zinc-800/50" : ""}`}>
                        <span className="text-xs text-zinc-500">{k}</span>
                        <input value={v} onChange={e => setProfile(prev => ({ ...prev, [k]: e.target.value }))} className="bg-transparent border-none text-sm font-semibold text-zinc-200 text-right focus:outline-none focus:text-violet-400 transition-colors flex-1 ml-4" />
                      </div>
                    ))}
                    <div className="mt-6">
                      <div className="text-[10px] text-zinc-500 font-semibold tracking-widest uppercase mb-3">Skills</div>
                      <div className="flex flex-wrap gap-2 mb-3">
                        {skills.map(s => (
                          <span key={s} className="chip bg-violet-500/10 text-violet-400 border border-violet-500/20">
                            {s}
                            <span onClick={() => setSkills(skills.filter(x => x !== s))} className="cursor-pointer hover:text-white transition-colors ml-1">×</span>
                          </span>
                        ))}
                      </div>
                      <input
                        onKeyDown={e => { if (e.key === "Enter" && e.currentTarget.value) { setSkills([...skills, e.currentTarget.value]); e.currentTarget.value = ""; }}}
                        placeholder="Add skill (Enter)…"
                        className="input-base text-xs"
                      />
                    </div>
                    <button
                      onClick={async () => { const ok = await saveProfile({ ...profile, skills, aiBackends }); if (ok) addLog("success", "PROFILE", "Profile saved. ✓"); else addLog("error", "ERROR", "Failed to save."); }}
                      className="btn-primary w-full mt-6 text-sm"
                    >Save Profile</button>
                  </div>

                  {/* Automation */}
                  <div className="surface-elevated p-8">
                    <div className="text-[11px] text-zinc-400 font-semibold tracking-widest uppercase mb-6">Automation Configurations</div>
                    <div className="flex flex-col gap-4">
                      {(Object.entries(automation) as [string, boolean][]).map(([label, on]) => (
                        <div key={label} className="flex items-center justify-between">
                          <span className={`text-sm font-semibold ${on ? "text-zinc-200" : "text-zinc-600"}`}>{label}</span>
                          <Toggle on={on} onChange={() => setAutomation((prev: Record<string, boolean>) => ({ ...prev, [label]: !prev[label] }))} />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="surface-elevated p-8">
                    <div className="text-[11px] text-zinc-400 font-semibold tracking-widest uppercase mb-6">Discovery Stats</div>
                    {[
                      ["Total Searches", "12"],
                      ["Jobs Discovered", "247"],
                      ["Applications", String(trackerJobs.filter(j => ["Applied", "Interview", "Offer"].includes(j.status)).length)],
                      ["Avg Score", `${Math.round(trackerJobs.reduce((a, j) => a + (j.score || 0), 0) / Math.max(trackerJobs.length, 1))}/100`],
                    ].map(([k, v], idx) => (
                      <div key={k} className={`flex justify-between items-center py-3 ${idx < 3 ? "border-b border-zinc-800/50" : ""}`}>
                        <span className="text-xs text-zinc-500">{k}</span>
                        <span className="text-sm font-bold font-mono text-violet-400">{v}</span>
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
