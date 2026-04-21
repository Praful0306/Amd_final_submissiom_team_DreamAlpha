import { useEffect, useState, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { motion } from "framer-motion"
import {
  Users, Activity, Calendar, AlertTriangle, TrendingUp, Heart,
  FileText, ChevronRight, FolderOpen, RefreshCw,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { RiskBadge } from "@/components/shared/RiskBadge"
import { useStore } from "@/store/useStore"
import { getDoctorPatients, type Patient } from "@/lib/api"
import { formatDate } from "@/lib/utils"
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  AreaChart, Area, XAxis, YAxis, RadarChart, Radar,
  PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from "recharts"

const WEEKLY_ACTIVITY = [
  { day: "Mon", patients: 4, critical: 1 },
  { day: "Tue", patients: 7, critical: 2 },
  { day: "Wed", patients: 5, critical: 1 },
  { day: "Thu", patients: 9, critical: 3 },
  { day: "Fri", patients: 6, critical: 2 },
  { day: "Sat", patients: 3, critical: 1 },
  { day: "Sun", patients: 2, critical: 0 },
]

const RISK_COLORS: Record<string, string> = {
  EMERGENCY: "#ef4444",
  HIGH:      "#f97316",
  MEDIUM:    "#eab308",
  LOW:       "#22c55e",
}

const OUTCOME_DATA = [
  { metric: "Recovery",    value: 82 },
  { metric: "Referrals",  value: 65 },
  { metric: "Follow-ups", value: 78 },
  { metric: "ICMR Match", value: 94 },
  { metric: "Response",   value: 88 },
  { metric: "Accuracy",   value: 91 },
]

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: (i = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.4, delay: i * 0.07 } }),
}

const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }> }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-[#1a1a22] border border-[#2a2a35] rounded-lg px-3 py-2 text-xs">
      {payload.map(p => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-gray-400">{p.name}:</span>
          <span className="text-white font-medium">{p.value}</span>
        </div>
      ))}
    </div>
  )
}

/* ── Patient card for "My Patients" section ─────────────────────────────────── */
function PatientCard({ p, index, onClick }: { p: Patient; index: number; onClick: () => void }) {
  const risk = p.risk_level ?? p.last_risk_level ?? "LOW"
  const riskColor =
    risk === "EMERGENCY" ? "border-red-500/30 bg-red-500/[0.04]"
    : risk === "HIGH"    ? "border-orange-500/25 bg-orange-500/[0.03]"
    : risk === "MEDIUM"  ? "border-yellow-500/20 bg-yellow-500/[0.02]"
    :                      "border-white/[0.06] bg-white/[0.02]"

  return (
    <motion.button
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      onClick={onClick}
      className={`text-left w-full p-4 rounded-xl border ${riskColor} hover:bg-white/[0.05] hover:border-white/10 transition-all group`}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-brand-500/20 flex items-center justify-center text-brand-400 text-xs font-bold shrink-0">
            {p.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate leading-tight">{p.name}</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {p.age}y · {p.gender === "F" ? "Female" : p.gender === "M" ? "Male" : p.gender}
              {p.village ? ` · ${p.village}` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <RiskBadge level={risk} size="sm" />
          <ChevronRight className="w-3.5 h-3.5 text-gray-600 group-hover:text-gray-400 transition-colors" />
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-white/[0.03] border border-white/[0.05] px-3 py-2 text-center">
          <p className="text-lg font-bold text-white leading-none">{p.total_reports ?? 0}</p>
          <p className="text-[10px] text-gray-500 mt-0.5">Reports</p>
        </div>
        <div className="rounded-lg bg-white/[0.03] border border-white/[0.05] px-2 py-2 text-center">
          <p className="text-xs font-medium text-gray-300 truncate leading-none">
            {p.last_report_date
              ? formatDate(p.last_report_date).split(",")[0]
              : "—"}
          </p>
          <p className="text-[10px] text-gray-500 mt-0.5">Last Report</p>
        </div>
      </div>

      {/* Diagnosis label */}
      {p.diagnosis && (
        <p className="text-xs text-gray-600 mt-2 truncate">
          <span className="text-gray-500">Dx: </span>{p.diagnosis}
        </p>
      )}
    </motion.button>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════ */

export default function DoctorDashboard() {
  const navigate                = useNavigate()
  const { user }                = useStore()
  const [patients,  setPatients]  = useState<Patient[]>([])
  const [loading,   setLoading]   = useState(true)
  const [fetchErr,  setFetchErr]  = useState("")

  const fetchPatients = useCallback(() => {
    setFetchErr("")
    getDoctorPatients()
      .then(p => { setPatients(p); setLoading(false) })
      .catch(err => {
        setFetchErr(err instanceof Error ? err.message : "Failed to load patients")
        setPatients([])
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    fetchPatients()
    // Refetch when window regains focus (picks up newly added patients / new reports)
    const onFocus = () => fetchPatients()
    window.addEventListener("focus", onFocus)
    return () => window.removeEventListener("focus", onFocus)
  }, [fetchPatients])

  // Derived chart data
  const riskDist = Object.entries(
    patients.reduce<Record<string, number>>((acc, p) => {
      const r = p.risk_level ?? p.last_risk_level ?? "LOW"
      acc[r] = (acc[r] ?? 0) + 1
      return acc
    }, {})
  ).map(([name, value]) => ({ name, value }))

  const stats = [
    { label: "Total Patients",  value: patients.length,                                                                                     icon: Users,         color: "text-blue-400"   },
    { label: "High Risk",       value: patients.filter(p => ["HIGH","EMERGENCY"].includes(p.risk_level ?? p.last_risk_level ?? "")).length,  icon: AlertTriangle, color: "text-red-400"    },
    { label: "Active Today",    value: Math.ceil(patients.length * 0.3),                                                                     icon: Activity,      color: "text-green-400"  },
    { label: "Appointments",    value: 3,                                                                                                    icon: Calendar,      color: "text-purple-400" },
  ]

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <motion.div variants={fadeUp} initial="hidden" animate="visible">
        <h2 className="text-2xl font-bold text-white">
          Welcome, <span className="gradient-text">Dr. {user?.name?.split(" ").slice(-1)[0]}</span>
        </h2>
        <p className="text-gray-500 mt-0.5">{formatDate(new Date())} · Clinical Dashboard</p>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 bg-white/5 rounded-2xl" />)
          : stats.map((s, i) => {
              const Icon = s.icon
              return (
                <motion.div key={s.label} variants={fadeUp} initial="hidden" animate="visible" custom={i}>
                  <Card className="bg-[#1a1a22] border-[#2a2a35]">
                    <CardContent className="p-5">
                      <Icon className={`w-5 h-5 mb-3 ${s.color}`} />
                      <p className="text-3xl font-extrabold text-white">{s.value}</p>
                      <p className="text-xs text-gray-500 mt-1">{s.label}</p>
                    </CardContent>
                  </Card>
                </motion.div>
              )
            })}
      </div>

      {/* Charts row */}
      <div className="grid lg:grid-cols-3 gap-4">

        {/* Risk Distribution — Donut */}
        <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={4}>
          <Card className="bg-[#1a1a22] border-[#2a2a35] h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold text-white flex items-center gap-2">
                <Heart className="w-4 h-4 text-red-400" /> Risk Distribution
              </CardTitle>
            </CardHeader>
            <CardContent>
              {riskDist.length === 0 ? (
                <div className="flex items-center justify-center h-[180px] text-gray-600 text-sm">
                  No patient data
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie
                      data={riskDist}
                      cx="50%" cy="50%"
                      innerRadius={48} outerRadius={72}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {riskDist.map((entry, i) => (
                        <Cell key={i} fill={RISK_COLORS[entry.name] ?? "#6b7280"} />
                      ))}
                    </Pie>
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null
                        const d = payload[0]
                        return (
                          <div className="bg-[#1a1a22] border border-[#2a2a35] rounded-lg px-3 py-2 text-xs">
                            <span style={{ color: d.payload.fill }} className="font-medium">{d.name}</span>
                            <span className="text-gray-400 ml-2">{d.value} patients</span>
                          </div>
                        )
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
              <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-1 justify-center">
                {riskDist.map(r => (
                  <span key={r.name} className="flex items-center gap-1.5 text-xs text-gray-400">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: RISK_COLORS[r.name] ?? "#6b7280" }} />
                    {r.name} ({r.value})
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Weekly Activity — Area Chart */}
        <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={5} className="lg:col-span-2">
          <Card className="bg-[#1a1a22] border-[#2a2a35] h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold text-white flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-brand-400" /> Weekly Patient Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={WEEKLY_ACTIVITY} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="patG" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#f97316" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="critG" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#ef4444" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="day" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="patients" stroke="#f97316" fill="url(#patG)"  strokeWidth={2} dot={{ fill: "#f97316", r: 3 }} name="Patients" color="#f97316" />
                  <Area type="monotone" dataKey="critical" stroke="#ef4444" fill="url(#critG)" strokeWidth={2} dot={{ fill: "#ef4444", r: 3 }} name="Critical"  color="#ef4444" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Outcome Radar + Recent patients */}
      <div className="grid lg:grid-cols-3 gap-4">

        {/* Clinical Outcomes Radar */}
        <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={6}>
          <Card className="bg-[#1a1a22] border-[#2a2a35] h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold text-white">Clinical Outcomes</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <RadarChart data={OUTCOME_DATA} margin={{ top: 10, right: 20, bottom: 10, left: 20 }}>
                  <PolarGrid stroke="#2a2a35" />
                  <PolarAngleAxis dataKey="metric" tick={{ fill: "#6b7280", fontSize: 10 }} />
                  <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                  <Radar
                    name="Score"
                    dataKey="value"
                    stroke="#f97316"
                    fill="#f97316"
                    fillOpacity={0.2}
                    strokeWidth={2}
                    dot={{ fill: "#f97316", r: 3 }}
                  />
                  <Tooltip
                    contentStyle={{ background: "#1a1a22", border: "1px solid #2a2a35", borderRadius: 8, fontSize: 12 }}
                    formatter={(value) => [value == null ? "—" : `${value}%`, "Score"] as [string, string]}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>

        {/* Recent patients */}
        <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={7} className="lg:col-span-2">
          <Card className="bg-[#1a1a22] border-[#2a2a35] h-full">
            <CardHeader className="flex-row items-center justify-between pb-3">
              <CardTitle className="text-base font-semibold text-white">Recent Patients</CardTitle>
              <Button
                variant="ghost" size="sm"
                className="text-gray-400 hover:text-white text-xs"
                onClick={() => navigate("/doctor/access")}
              >
                Access by code
              </Button>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 bg-white/5 rounded-xl" />)}
                </div>
              ) : patients.length === 0 ? (
                <p className="text-sm text-gray-600 py-4 text-center">No patients linked yet</p>
              ) : (
                <div className="space-y-2">
                  {patients.slice(0, 6).map((p, i) => (
                    <motion.button
                      key={p.id}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.06 }}
                      onClick={() => navigate(`/doctor/patient/${p.id}`)}
                      className="w-full flex items-center justify-between p-3 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/5 hover:border-white/10 transition-all text-left"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-brand-500/20 flex items-center justify-center text-brand-400 text-xs font-bold shrink-0">
                          {p.name.split(" ").map(n => n[0]).join("").slice(0,2)}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-white">{p.name}</p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {p.age}y · {p.gender} · {p.village ?? "—"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {(p.total_reports ?? 0) > 0 && (
                          <span className="text-xs text-gray-600 hidden sm:flex items-center gap-1">
                            <FileText className="w-3 h-3" /> {p.total_reports}
                          </span>
                        )}
                        <RiskBadge level={p.risk_level ?? p.last_risk_level ?? "LOW"} size="sm" />
                      </div>
                    </motion.button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* ── MY PATIENTS ──────────────────────────────────────────────────────── */}
      <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={8}>
        <Card className="bg-[#1a1a22] border-[#2a2a35]">
          <CardHeader className="flex-row items-center justify-between pb-4">
            <CardTitle className="text-base font-semibold text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-400" />
              My Patients
              {!loading && patients.length > 0 && (
                <span className="text-xs font-normal text-gray-500 ml-1">({patients.length})</span>
              )}
            </CardTitle>
            <div className="flex items-center gap-2">
              <button
                onClick={fetchPatients}
                className="p-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-all"
                title="Refresh patient list"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
              <Button
                variant="ghost" size="sm"
                className="text-blue-400 hover:text-blue-300 text-xs border border-blue-500/20 hover:bg-blue-500/10"
                onClick={() => navigate("/doctor/access")}
              >
                + Access Patient
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-32 bg-white/5 rounded-xl" />
                ))}
              </div>
            ) : fetchErr ? (
              <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
                <AlertTriangle className="w-8 h-8 text-red-400/70" />
                <div>
                  <p className="text-red-300 font-medium text-sm">Could not load patients</p>
                  <p className="text-gray-600 text-xs mt-1 max-w-xs">{fetchErr}</p>
                </div>
                <button
                  onClick={fetchPatients}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white text-sm transition-all"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Retry
                </button>
              </div>
            ) : patients.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-14 gap-4">
                <div className="w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/15 flex items-center justify-center">
                  <FolderOpen className="w-7 h-7 text-blue-400/60" />
                </div>
                <div className="text-center">
                  <p className="text-white font-medium">No patients linked yet</p>
                  <p className="text-gray-500 text-sm mt-1">
                    Ask your patient to share their code, then enter it below
                  </p>
                </div>
                <Button
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                  onClick={() => navigate("/doctor/access")}
                >
                  Access First Patient
                </Button>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {patients.map((p, i) => (
                  <PatientCard
                    key={p.id}
                    p={p}
                    index={i}
                    onClick={() => navigate(`/doctor/patient/${p.id}`)}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* High-risk alerts */}
      {patients.filter(p => ["HIGH","EMERGENCY"].includes(p.risk_level ?? p.last_risk_level ?? "")).length > 0 && (
        <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={9}>
          <Card className="bg-[#1a1a22] border-red-500/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-white flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                High-Risk Alerts
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {patients
                  .filter(p => ["HIGH","EMERGENCY"].includes(p.risk_level ?? p.last_risk_level ?? ""))
                  .slice(0, 4)
                  .map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between p-3 rounded-xl bg-red-500/5 border border-red-500/15"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center text-red-400 text-xs font-bold shrink-0">
                          {p.name.split(" ").map(n => n[0]).join("").slice(0,2)}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-white">{p.name}</p>
                          <p className="text-xs text-gray-500">{p.age}y · {p.village ?? "—"} · {p.diagnosis ?? "—"}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <RiskBadge level={p.risk_level ?? p.last_risk_level ?? "HIGH"} size="sm" />
                        <Button
                          size="sm"
                          className="h-7 text-xs bg-red-600/80 hover:bg-red-600 text-white"
                          onClick={() => navigate(`/doctor/patient/${p.id}`)}
                        >
                          View
                        </Button>
                      </div>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  )
}
