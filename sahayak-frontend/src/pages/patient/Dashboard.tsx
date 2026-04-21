import { useEffect, useState, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { motion, type Variants } from "framer-motion"
import {
  Mic, Upload, FileText, Share2, Activity, Heart,
  Thermometer, Droplets, TrendingUp, TrendingDown,
  Minus, ChevronRight, Zap, Shield, Clock, Phone,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useStore } from "@/store/useStore"
import { getPatientProfile, getReports, resolvePatientId, type Patient, type MedicalReport } from "@/lib/api"
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts"
import { formatDate } from "@/lib/utils"

/* ── helpers ──────────────────────────────────────────────────────────────── */
function greet() {
  const h = new Date().getHours()
  if (h < 12) return "Good morning"
  if (h < 17) return "Good afternoon"
  return "Good evening"
}

function Trend({ cur, prev }: { cur?: number | null; prev?: number | null }) {
  if (!cur || !prev || cur === prev) return <Minus className="w-3.5 h-3.5 text-gray-500" />
  return cur > prev
    ? <TrendingUp className="w-3.5 h-3.5 text-red-400" />
    : <TrendingDown className="w-3.5 h-3.5 text-emerald-400" />
}

/* Circular health-score gauge */
function HealthRing({ score }: { score: number }) {
  const r = 52, circ = 2 * Math.PI * r
  const fill = circ - (score / 100) * circ
  const color = score >= 75 ? "#22c55e" : score >= 50 ? "#f97316" : "#ef4444"
  return (
    <svg width={128} height={128} className="drop-shadow-lg">
      <circle cx={64} cy={64} r={r} fill="none" stroke="#1f2937" strokeWidth={10} />
      <circle cx={64} cy={64} r={r} fill="none" stroke={color} strokeWidth={10}
        strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={fill}
        transform="rotate(-90 64 64)"
        style={{ transition: "stroke-dashoffset 1s ease" }} />
      <text x={64} y={60} textAnchor="middle" fill="white" fontSize={26} fontWeight="700">{score}</text>
      <text x={64} y={78} textAnchor="middle" fill="#6b7280" fontSize={11}>/ 100</text>
    </svg>
  )
}

/* Small sparkline bar for a vital */
function Spark({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return null
  const max = Math.max(...values), min = Math.min(...values)
  const h = 28, w = 60
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w
    const y = h - ((v - min) / (max - min + 0.001)) * h
    return `${x},${y}`
  }).join(" ")
  return (
    <svg width={w} height={h} className="opacity-70">
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  )
}

/* ── main ─────────────────────────────────────────────────────────────────── */
export default function PatientDashboard() {
  const navigate = useNavigate()
  const { user }  = useStore()
  const [profile,  setProfile]  = useState<Patient | null>(null)
  const [reports,  setReports]  = useState<MedicalReport[]>([])
  const [loading,  setLoading]  = useState(true)

  const fetchAll = useCallback(() => {
    if (!user) { setLoading(false); return }
    setLoading(true)
    resolvePatientId(user).then(pid =>
      Promise.all([
        getPatientProfile(pid).catch(() => null),
        getReports(pid).catch(() => []),
      ])
    ).then(([p, r]) => {
      setProfile(p)
      setReports(r as MedicalReport[])
    }).finally(() => setLoading(false))
  }, [user])

  useEffect(() => { fetchAll() }, [fetchAll])

  // Refetch whenever user navigates back after saving a report
  useEffect(() => {
    const onFocus = () => {
      const saved = sessionStorage.getItem("sahayak_report_saved")
      if (saved) {
        sessionStorage.removeItem("sahayak_report_saved")
        fetchAll()
      }
    }
    window.addEventListener("focus", onFocus)
    // Also check on mount (same-tab navigation)
    onFocus()
    return () => window.removeEventListener("focus", onFocus)
  }, [fetchAll])

  const latest  = reports[0]
  const prev    = reports[1]
  const score   = profile?.health_score ?? (reports.length ? 68 : 0)
  const risk    = latest?.risk_level ?? profile?.risk_level ?? "UNKNOWN"
  const isEmpty = !loading && reports.length === 0

  const riskColor: Record<string, string> = {
    LOW: "text-emerald-400", MEDIUM: "text-amber-400",
    HIGH: "text-red-400", CRITICAL: "text-red-500", UNKNOWN: "text-gray-400",
  }
  const riskBg: Record<string, string> = {
    LOW: "bg-emerald-500/10 border-emerald-500/30",
    MEDIUM: "bg-amber-500/10 border-amber-500/30",
    HIGH: "bg-red-500/10 border-red-500/30",
    CRITICAL: "bg-red-600/20 border-red-600/40",
    UNKNOWN: "bg-gray-500/10 border-gray-500/20",
  }

  // Chart data
  const chartData = [...reports].reverse().slice(-8).map((r) => ({
    date: r.created_at ? formatDate(r.created_at).slice(0, 6) : "",
    HR:   r.heart_rate ?? null,
    SpO2: r.spo2 ?? null,
    BP:   r.bp_systolic ?? null,
  }))

  const fadeUp: Variants = {
    hidden: { opacity: 0, y: 20 },
    show: (i = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.45, delay: i * 0.07, ease: [0.16, 1, 0.3, 1] } }),
  }

  /* ── VITALS ROW ── */
  const vitals = [
    {
      label: "Heart Rate", unit: "bpm", icon: Heart, color: "#f97316", bgGlow: "rgba(249,115,22,0.12)",
      val: latest?.heart_rate, prev: prev?.heart_rate,
      normal: [60, 100],
      spark: reports.slice(0,6).map(r=>r.heart_rate).filter(Boolean) as number[],
    },
    {
      label: "Blood Oxygen", unit: "%", icon: Activity, color: "#22c55e", bgGlow: "rgba(34,197,94,0.12)",
      val: latest?.spo2, prev: prev?.spo2,
      normal: [95, 100],
      spark: reports.slice(0,6).map(r=>r.spo2).filter(Boolean) as number[],
    },
    {
      label: "Temperature", unit: "°C", icon: Thermometer, color: "#3b82f6", bgGlow: "rgba(59,130,246,0.12)",
      val: latest?.temperature, prev: prev?.temperature,
      normal: [36.1, 37.2],
      spark: reports.slice(0,6).map(r=>r.temperature).filter(Boolean) as number[],
    },
    {
      label: "Blood Pressure", unit: "mmHg", icon: Droplets, color: "#a855f7", bgGlow: "rgba(168,85,247,0.12)",
      val: latest?.bp_systolic ? `${latest.bp_systolic}/${latest.bp_diastolic ?? "—"}` : null,
      prev: prev?.bp_systolic,
      normal: [90, 120],
      spark: reports.slice(0,6).map(r=>r.bp_systolic).filter(Boolean) as number[],
      isString: true,
    },
  ]

  const actions = [
    { label: "AI Diagnosis",  sub: "Describe symptoms", icon: Mic,      href: "/patient/diagnose", grad: "from-orange-600 to-orange-500" },
    { label: "Upload Report", sub: "PDF / image scan",  icon: Upload,   href: "/patient/upload",   grad: "from-blue-600 to-blue-500" },
    { label: "View Reports",  sub: "All your records",  icon: FileText, href: "/patient/reports",  grad: "from-purple-600 to-purple-500" },
    { label: "Share Access",  sub: "With your doctor",  icon: Share2,   href: "/patient/access",   grad: "from-emerald-600 to-emerald-500" },
    { label: "Call Doctor",   sub: "Book appointment",  icon: Phone,    href: "/patient/call",     grad: "from-sky-600 to-blue-500" },
    { label: "Call ASHA",     sub: "Health guidance",   icon: Heart,    href: "/patient/call",     grad: "from-pink-600 to-rose-500" },
  ]

  return (
    <div className="min-h-screen bg-[#0b0b10] px-4 py-6 max-w-6xl mx-auto space-y-6">

      {/* ── HERO ── */}
      <motion.div variants={fadeUp} initial="hidden" animate="show" custom={0}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#1a1035] via-[#160d2e] to-[#0b0b10] border border-white/5 p-6">
        {/* bg glow blobs */}
        <div className="absolute -top-20 -right-20 w-72 h-72 bg-brand-600/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-10 w-56 h-56 bg-purple-700/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative flex flex-col sm:flex-row items-start sm:items-center gap-6">
          {/* Health ring */}
          <div className="shrink-0">
            {loading ? <Skeleton className="w-32 h-32 rounded-full bg-white/5" /> : <HealthRing score={score} />}
          </div>

          {/* Welcome text */}
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-400">{greet()},</p>
            <h1 className="text-2xl sm:text-3xl font-bold text-white mt-0.5 truncate">
              {user?.name?.split(" ")[0] ?? "Patient"} 👋
            </h1>
            <p className="text-gray-400 text-sm mt-1.5">
              {isEmpty
                ? "Welcome! Upload your first report to start tracking your health."
                : `${reports.length} report${reports.length !== 1 ? "s" : ""} on file · Last checkup ${latest?.created_at ? formatDate(latest.created_at) : "—"}`}
            </p>
            {!isEmpty && (
              <div className={`inline-flex items-center gap-2 mt-3 px-3 py-1.5 rounded-full border text-sm font-medium ${riskBg[risk] ?? riskBg.UNKNOWN}`}>
                <span className={`w-2 h-2 rounded-full animate-pulse ${risk === "LOW" ? "bg-emerald-400" : risk === "MEDIUM" ? "bg-amber-400" : "bg-red-400"}`} />
                <span className={riskColor[risk] ?? "text-gray-400"}>{risk} Risk</span>
              </div>
            )}
          </div>

          {/* Health score label */}
          {!loading && !isEmpty && (
            <div className="hidden sm:flex flex-col items-end shrink-0">
              <span className="text-xs text-gray-500 uppercase tracking-widest">Health Score</span>
              <span className="text-4xl font-black text-white mt-1">{score}</span>
              <span className="text-xs text-gray-600 mt-0.5">out of 100</span>
            </div>
          )}
        </div>
      </motion.div>

      {/* ── VITALS ROW ── */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl bg-white/5" />)}
        </div>
      ) : isEmpty ? null : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {vitals.map((v, i) => {
            const Icon = v.icon
            const isAbnormal = !v.isString && v.val != null && typeof v.val === "number" &&
              (v.val < v.normal[0] || v.val > v.normal[1])
            return (
              <motion.div key={v.label} variants={fadeUp} initial="hidden" animate="show" custom={i + 1}>
                <div className="relative overflow-hidden rounded-2xl border border-white/5 p-4 h-full"
                  style={{ background: `radial-gradient(ellipse at top left, ${v.bgGlow}, #0f0f16 70%)` }}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center"
                      style={{ background: `${v.color}20` }}>
                      <Icon className="w-4 h-4" style={{ color: v.color }} />
                    </div>
                    <Trend cur={typeof v.prev === "number" ? (v.val as number) : undefined} prev={v.prev} />
                  </div>
                  <div className="flex items-end gap-1 mb-0.5">
                    <span className={`text-2xl font-black ${isAbnormal ? "text-red-400" : "text-white"}`}>
                      {v.val ?? "—"}
                    </span>
                    <span className="text-xs text-gray-500 mb-1">{v.unit}</span>
                  </div>
                  <p className="text-xs text-gray-500 mb-2">{v.label}</p>
                  {v.spark.length > 1 && <Spark values={v.spark.reverse()} color={v.color} />}
                  {isAbnormal && (
                    <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-red-400 animate-ping" />
                  )}
                </div>
              </motion.div>
            )
          })}
        </div>
      )}

      {/* ── CHART + ACTIONS ── */}
      <div className="grid lg:grid-cols-3 gap-4">
        {/* Chart */}
        <motion.div variants={fadeUp} initial="hidden" animate="show" custom={5}
          className="lg:col-span-2 rounded-2xl border border-white/5 bg-[#0f0f16] p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-white">Vitals Trend</h3>
              <p className="text-xs text-gray-500 mt-0.5">Heart Rate · SpO₂ · Blood Pressure</p>
            </div>
            {reports.length > 0 && (
              <button onClick={() => navigate("/patient/reports")}
                className="flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300 transition-colors">
                Full report <ChevronRight className="w-3 h-3" />
              </button>
            )}
          </div>
          {loading ? <Skeleton className="h-48 rounded-xl bg-white/5" />
            : chartData.length >= 2 ? (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <defs>
                    {[["hr","#f97316"],["sp","#22c55e"],["bp","#a855f7"]].map(([id,c])=>(
                      <linearGradient key={id} id={`g_${id}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={c} stopOpacity={0.25} />
                        <stop offset="95%" stopColor={c} stopOpacity={0} />
                      </linearGradient>
                    ))}
                  </defs>
                  <XAxis dataKey="date" tick={{ fill:"#4b5563", fontSize:10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill:"#4b5563", fontSize:10 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background:"#13131a", border:"1px solid #1f2937", borderRadius:10, fontSize:12 }}
                    labelStyle={{ color:"#9ca3af" }} />
                  <Area type="monotone" dataKey="HR"   stroke="#f97316" fill="url(#g_hr)" strokeWidth={2} dot={false} name="Heart Rate" />
                  <Area type="monotone" dataKey="SpO2" stroke="#22c55e" fill="url(#g_sp)" strokeWidth={2} dot={false} name="SpO₂" />
                  <Area type="monotone" dataKey="BP"   stroke="#a855f7" fill="url(#g_bp)" strokeWidth={2} dot={false} name="BP Sys" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-48 flex flex-col items-center justify-center gap-3 text-center">
                <TrendingUp className="w-10 h-10 text-gray-700" />
                <p className="text-sm text-gray-500">Upload at least 2 reports to see trends</p>
                <Button size="sm" className="bg-brand-600 hover:bg-brand-700 text-white text-xs"
                  onClick={() => navigate("/patient/upload")}>
                  Upload Report
                </Button>
              </div>
            )}
        </motion.div>

        {/* Quick actions */}
        <motion.div variants={fadeUp} initial="hidden" animate="show" custom={6}
          className="rounded-2xl border border-white/5 bg-[#0f0f16] p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Quick Actions</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {actions.map((a) => {
              const Icon = a.icon
              return (
                <button key={a.label} onClick={() => navigate(a.href)}
                  className={`group relative overflow-hidden rounded-xl p-3.5 text-left bg-gradient-to-br ${a.grad} hover:brightness-110 active:scale-95 transition-all duration-150`}>
                  <Icon className="w-5 h-5 text-white mb-2" />
                  <p className="text-white text-xs font-semibold leading-tight">{a.label}</p>
                  <p className="text-white/60 text-[10px] mt-0.5 leading-tight">{a.sub}</p>
                  <div className="absolute bottom-0 right-0 w-12 h-12 bg-white/10 rounded-full translate-x-3 translate-y-3 group-hover:scale-125 transition-transform duration-300" />
                </button>
              )
            })}
          </div>
        </motion.div>
      </div>

      {/* ── LAB VALUES ── */}
      {!isEmpty && !loading && (latest?.hemoglobin || latest?.blood_sugar_fasting || latest?.creatinine) && (
        <motion.div variants={fadeUp} initial="hidden" animate="show" custom={7}
          className="rounded-2xl border border-white/5 bg-[#0f0f16] p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Latest Lab Values</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {[
              { label:"Hemoglobin", val: latest.hemoglobin, unit:"g/dL", normal:[12,17], color:"#ec4899" },
              { label:"Fasting Sugar", val: latest.blood_sugar_fasting, unit:"mg/dL", normal:[70,99], color:"#f59e0b" },
              { label:"Creatinine", val: latest.creatinine, unit:"mg/dL", normal:[0.6,1.2], color:"#06b6d4" },
              { label:"Weight", val: latest.weight_kg, unit:"kg", normal:[40,100], color:"#84cc16" },
            ].filter(x => x.val != null).map(({ label, val, unit, normal, color }) => {
              const num = Number(val)
              const pct = Math.min(100, Math.max(0, ((num - normal[0]) / (normal[1] - normal[0])) * 100))
              const ok  = num >= normal[0] && num <= normal[1]
              return (
                <div key={label} className="rounded-xl bg-white/[0.03] border border-white/5 p-3.5">
                  <p className="text-xs text-gray-500 mb-1.5">{label}</p>
                  <p className={`text-lg font-bold ${ok ? "text-white" : "text-red-400"}`}>{val} <span className="text-xs font-normal text-gray-500">{unit}</span></p>
                  <div className="mt-2 h-1.5 rounded-full bg-white/5 overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${pct}%`, background: ok ? color : "#ef4444" }} />
                  </div>
                  <p className="text-[10px] text-gray-600 mt-1">Normal {normal[0]}–{normal[1]}</p>
                </div>
              )
            })}
          </div>
        </motion.div>
      )}

      {/* ── RECENT REPORTS ── */}
      {!loading && reports.length > 0 && (
        <motion.div variants={fadeUp} initial="hidden" animate="show" custom={8}
          className="rounded-2xl border border-white/5 bg-[#0f0f16] p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white">Recent Reports</h3>
            <button onClick={() => navigate("/patient/reports")}
              className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1 transition-colors">
              View all <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          <div className="space-y-2">
            {reports.slice(0, 4).map((r, i) => {
              const rc = { LOW:"text-emerald-400 bg-emerald-500/10", MEDIUM:"text-amber-400 bg-amber-500/10", HIGH:"text-red-400 bg-red-500/10" }
              const lvl = (r.risk_level ?? "LOW") as keyof typeof rc
              return (
                <motion.div key={r.id} variants={fadeUp} initial="hidden" animate="show" custom={i}
                  className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.025] hover:bg-white/[0.05] transition-colors cursor-pointer group"
                  onClick={() => navigate("/patient/reports")}>
                  <div className="w-9 h-9 rounded-xl bg-brand-600/20 flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4 text-brand-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{r.diagnosis ?? "Medical Report"}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{r.created_at ? formatDate(r.created_at) : "—"}</p>
                  </div>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${rc[lvl] ?? "text-gray-400 bg-gray-500/10"}`}>
                    {lvl}
                  </span>
                  <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-gray-400 transition-colors shrink-0" />
                </motion.div>
              )
            })}
          </div>
        </motion.div>
      )}

      {/* ── EMPTY STATE (new user) ── */}
      {isEmpty && (
        <motion.div variants={fadeUp} initial="hidden" animate="show" custom={2}
          className="rounded-2xl border border-dashed border-white/10 bg-[#0f0f16] p-10 text-center">
          <div className="w-16 h-16 rounded-2xl bg-brand-600/20 flex items-center justify-center mx-auto mb-4">
            <Zap className="w-8 h-8 text-brand-400" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">Start your health journey</h3>
          <p className="text-gray-500 text-sm max-w-sm mx-auto mb-6">
            Upload a lab report or describe your symptoms to get AI-powered insights and track your health over time.
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <Button className="bg-brand-600 hover:bg-brand-700 text-white gap-2"
              onClick={() => navigate("/patient/upload")}>
              <Upload className="w-4 h-4" /> Upload Report
            </Button>
            <Button variant="outline" className="border-white/10 text-gray-300 hover:bg-white/5 gap-2"
              onClick={() => navigate("/patient/diagnose")}>
              <Mic className="w-4 h-4" /> AI Diagnosis
            </Button>
          </div>
          {/* Feature hints */}
          <div className="grid grid-cols-3 gap-3 mt-8 text-left">
            {[
              { icon: Shield, title: "Private & Secure", desc: "Your data is encrypted and only visible to you" },
              { icon: Activity, title: "Vital Tracking", desc: "Monitor BP, sugar, hemoglobin over time" },
              { icon: Clock,  title: "Instant AI Analysis", desc: "Get risk assessment in under 3 seconds" },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="rounded-xl bg-white/[0.02] border border-white/5 p-3.5">
                <Icon className="w-5 h-5 text-brand-400 mb-2" />
                <p className="text-xs font-semibold text-white mb-1">{title}</p>
                <p className="text-[11px] text-gray-500 leading-snug">{desc}</p>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  )
}
