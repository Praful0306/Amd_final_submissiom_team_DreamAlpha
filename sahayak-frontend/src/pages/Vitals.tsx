import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import {
  HeartPulse, Activity, Thermometer, Droplets, Wind, TrendingUp, TrendingDown, Minus,
  AlertTriangle, CheckCircle2, Info
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import {
  AreaChart, Area, BarChart, Bar, RadialBarChart, RadialBar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Cell, Legend
} from "recharts"
import { getReports, type MedicalReport } from "@/lib/api"
import { useStore } from "@/store/useStore"
import { formatDate } from "@/lib/utils"

// ── ICMR Normal Ranges ────────────────────────────────────────────────────────
const RANGES = {
  heart_rate:          { min: 60,  max: 100, unit: "bpm",   label: "Heart Rate",      icon: HeartPulse,  color: "#ef4444", gradId: "hrGrad"   },
  spo2:                { min: 95,  max: 100, unit: "%",     label: "SpO₂",            icon: Activity,    color: "#22c55e", gradId: "spo2Grad" },
  temperature:         { min: 36.1,max: 37.2,unit: "°C",   label: "Temperature",     icon: Thermometer, color: "#f97316", gradId: "tmpGrad"  },
  bp_systolic:         { min: 90,  max: 120, unit: "mmHg",  label: "BP Systolic",     icon: Wind,        color: "#8b5cf6", gradId: "bpGrad"   },
  hemoglobin:          { min: 11,  max: 17,  unit: "g/dL",  label: "Hemoglobin",      icon: Droplets,    color: "#ec4899", gradId: "hbGrad"   },
  blood_sugar_fasting: { min: 70,  max: 100, unit: "mg/dL", label: "Fasting Sugar",   icon: Activity,    color: "#eab308", gradId: "bsGrad"   },
}

type VitalKey = keyof typeof RANGES

// ── Mock data (used when no real reports) ─────────────────────────────────────
const MOCK: MedicalReport[] = [
  { id: 1, heart_rate: 80, spo2: 99, temperature: 36.6, bp_systolic: 116, bp_diastolic: 74, hemoglobin: 12.5, blood_sugar_fasting: 88,  created_at: "2026-04-11T09:00:00", risk_level: "LOW"    } as MedicalReport,
  { id: 2, heart_rate: 85, spo2: 98, temperature: 37.0, bp_systolic: 120, bp_diastolic: 76, hemoglobin: 11.8, blood_sugar_fasting: 95,  created_at: "2026-03-28T09:00:00", risk_level: "LOW"    } as MedicalReport,
  { id: 3, heart_rate: 95, spo2: 96, temperature: 38.2, bp_systolic: 128, bp_diastolic: 82, hemoglobin: 9.2,  blood_sugar_fasting: 102, created_at: "2026-02-14T09:00:00", risk_level: "MEDIUM" } as MedicalReport,
  { id: 4, heart_rate: 78, spo2: 99, temperature: 36.8, bp_systolic: 112, bp_diastolic: 72, hemoglobin: 12.9, blood_sugar_fasting: 85,  created_at: "2026-01-20T09:00:00", risk_level: "LOW"    } as MedicalReport,
  { id: 5, heart_rate: 72, spo2: 99, temperature: 36.5, bp_systolic: 110, bp_diastolic: 70, hemoglobin: 13.1, blood_sugar_fasting: 82,  created_at: "2025-12-05T09:00:00", risk_level: "LOW"    } as MedicalReport,
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function getStatus(key: VitalKey, val?: number | null) {
  if (val == null) return "unknown"
  const { min, max } = RANGES[key]
  if (val < min) return "low"
  if (val > max) return "high"
  return "normal"
}

function statusBadge(status: string) {
  if (status === "normal") return <Badge className="text-[10px] bg-green-500/15 text-green-400 border border-green-500/20">Normal</Badge>
  if (status === "high")   return <Badge className="text-[10px] bg-red-500/15 text-red-400 border border-red-500/20">High</Badge>
  if (status === "low")    return <Badge className="text-[10px] bg-yellow-500/15 text-yellow-400 border border-yellow-500/20">Low</Badge>
  return null
}

// ── Custom Tooltip ────────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-[#1a1a22] border border-[#2a2a35] rounded-xl p-3 shadow-xl text-xs">
      <p className="text-gray-400 mb-2">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 mb-1">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-gray-300">{p.name}:</span>
          <span className="text-white font-bold">{p.value}</span>
        </div>
      ))}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function Vitals() {
  const { user } = useStore()
  const [reports, setReports] = useState<MedicalReport[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user?.id) { setReports(MOCK); setLoading(false); return }
    getReports(user.id)
      .then((r) => setReports(r.length > 0 ? r : MOCK))
      .catch(() => setReports(MOCK))
      .finally(() => setLoading(false))
  }, [user?.id])

  // Chronological for charts (oldest → newest)
  const chronological = [...reports].reverse().slice(-8)

  const chartData = chronological.map((r) => ({
    date:  r.created_at ? formatDate(r.created_at).split(" ")[0] : "—",
    HR:    r.heart_rate,
    SpO2:  r.spo2,
    Temp:  r.temperature,
    BPSys: r.bp_systolic,
    Hb:    r.hemoglobin,
    Sugar: r.blood_sugar_fasting,
  }))

  // Latest values for summary cards
  const latest = reports[0]

  // Gauge data for radial chart
  const gaugeItems: { name: string; value: number; fill: string; max: number }[] = [
    { name: "Heart Rate", value: latest?.heart_rate ?? 0,   fill: "#ef4444", max: 160 },
    { name: "SpO₂",       value: latest?.spo2 ?? 0,         fill: "#22c55e", max: 100 },
    { name: "Hemoglobin", value: (latest?.hemoglobin ?? 0) * 10, fill: "#ec4899", max: 170 },
  ]

  // Vital summary cards
  const summaryCards = (Object.entries(RANGES) as [VitalKey, typeof RANGES[VitalKey]][]).map(([key, cfg]) => {
    const val = latest?.[key as keyof MedicalReport] as number | undefined
    const prev = reports[1]?.[key as keyof MedicalReport] as number | undefined
    const status = getStatus(key, val)
    const trend = val == null || prev == null ? "flat"
      : val > prev ? "up" : val < prev ? "down" : "flat"
    return { key, val, prev, status, trend, ...cfg }
  })

  const fadeUp = {
    hidden: { opacity: 0, y: 16 },
    visible: (i: number) => ({ opacity: 1, y: 0, transition: { duration: 0.4, delay: i * 0.06 } }),
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-gray-500 text-sm">Loading vitals…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={0}>
        <h2 className="text-2xl font-bold text-white">Vitals Analysis</h2>
        <p className="text-gray-500 mt-0.5">
          {reports.length} reading{reports.length !== 1 ? "s" : ""} on file
          {latest?.created_at && (
            <span className="ml-2 text-gray-600">· Last updated {formatDate(latest.created_at)}</span>
          )}
        </p>
      </motion.div>

      {/* Summary metric cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {summaryCards.map(({ key, val, status, trend, label, unit, color, icon: Icon }, i) => (
          <motion.div key={key} variants={fadeUp} initial="hidden" animate="visible" custom={i + 1}>
            <Card className={`bg-[#1a1a22] border-[#2a2a35] relative overflow-hidden cursor-default hover:border-white/10 transition-colors ${
              status === "high"   ? "ring-1 ring-red-500/30"
              : status === "low" ? "ring-1 ring-yellow-500/30"
              : ""
            }`}>
              {/* Glow bar */}
              <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: color, opacity: 0.6 }} />
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <Icon className="w-4 h-4" style={{ color }} />
                  {trend === "up"   && <TrendingUp   className="w-3.5 h-3.5 text-red-400" />}
                  {trend === "down" && <TrendingDown className="w-3.5 h-3.5 text-green-400" />}
                  {trend === "flat" && <Minus        className="w-3.5 h-3.5 text-gray-600" />}
                </div>
                <p className="text-xl font-extrabold text-white leading-none">
                  {val != null ? val : <span className="text-gray-600 text-sm">—</span>}
                </p>
                <p className="text-[10px] text-gray-500 mt-0.5">{unit}</p>
                <p className="text-xs text-gray-400 mt-1.5 font-medium truncate">{label}</p>
                <div className="mt-2">{statusBadge(status)}</div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Charts Tabs */}
      <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={8}>
        <Tabs defaultValue="trend" className="space-y-4">
          <TabsList className="bg-[#1a1a22] border border-[#2a2a35]">
            <TabsTrigger value="trend"  className="data-[state=active]:bg-brand-600 data-[state=active]:text-white text-gray-400 text-sm">Trend</TabsTrigger>
            <TabsTrigger value="vitals" className="data-[state=active]:bg-brand-600 data-[state=active]:text-white text-gray-400 text-sm">Vitals</TabsTrigger>
            <TabsTrigger value="blood"  className="data-[state=active]:bg-brand-600 data-[state=active]:text-white text-gray-400 text-sm">Blood</TabsTrigger>
          </TabsList>

          {/* Heart Rate + SpO2 trend */}
          <TabsContent value="trend">
            <Card className="bg-[#1a1a22] border-[#2a2a35]">
              <CardHeader className="pb-2 flex-row items-center justify-between">
                <CardTitle className="text-sm font-semibold text-white">Heart Rate & SpO₂ Trend</CardTitle>
                <div className="flex items-center gap-4 text-xs text-gray-500">
                  <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-[#ef4444] inline-block" />HR (bpm)</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-[#22c55e] inline-block" />SpO₂ (%)</span>
                </div>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                    <defs>
                      <linearGradient id="hrGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%"   stopColor="#ef4444" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#ef4444" stopOpacity={0}    />
                      </linearGradient>
                      <linearGradient id="spo2Grad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%"   stopColor="#22c55e" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#22c55e" stopOpacity={0}    />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} domain={["auto", "auto"]} />
                    <Tooltip content={<ChartTooltip />} />
                    {/* ICMR normal zone */}
                    <ReferenceLine y={60}  stroke="#ef4444" strokeDasharray="4 4" strokeOpacity={0.3} />
                    <ReferenceLine y={100} stroke="#ef4444" strokeDasharray="4 4" strokeOpacity={0.3} />
                    <Area type="monotone" dataKey="HR"   stroke="#ef4444" fill="url(#hrGrad)"   strokeWidth={2.5} dot={{ fill: "#ef4444", r: 3, strokeWidth: 0 }} name="Heart Rate" />
                    <Area type="monotone" dataKey="SpO2" stroke="#22c55e" fill="url(#spo2Grad)" strokeWidth={2.5} dot={{ fill: "#22c55e", r: 3, strokeWidth: 0 }} name="SpO₂" />
                  </AreaChart>
                </ResponsiveContainer>

                {/* ICMR Reference note */}
                <div className="flex items-center gap-1.5 mt-2 text-xs text-gray-600">
                  <Info className="w-3 h-3" />
                  Dashed lines = ICMR normal boundaries (HR: 60–100 bpm, SpO₂: ≥95%)
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* BP + Temperature */}
          <TabsContent value="vitals">
            <div className="grid lg:grid-cols-2 gap-4">
              <Card className="bg-[#1a1a22] border-[#2a2a35]">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-white">Blood Pressure Trend</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                      <defs>
                        <linearGradient id="bpGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%"   stopColor="#8b5cf6" stopOpacity={0.9} />
                          <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.5} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="date" tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} domain={[70, 150]} />
                      <Tooltip content={<ChartTooltip />} />
                      <ReferenceLine y={120} stroke="#8b5cf6" strokeDasharray="4 4" strokeOpacity={0.4} label={{ value: "Normal Max", fill: "#6b7280", fontSize: 9 }} />
                      <Bar dataKey="BPSys" name="Systolic BP" fill="url(#bpGrad)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="bg-[#1a1a22] border-[#2a2a35]">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-white">Temperature Trend</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                      <defs>
                        <linearGradient id="tmpGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%"   stopColor="#f97316" stopOpacity={0.4} />
                          <stop offset="100%" stopColor="#f97316" stopOpacity={0}   />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="date" tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} domain={[35.5, 40]} />
                      <Tooltip content={<ChartTooltip />} />
                      <ReferenceLine y={37.2} stroke="#f97316" strokeDasharray="4 4" strokeOpacity={0.4} label={{ value: "Fever threshold", fill: "#6b7280", fontSize: 9 }} />
                      <Area type="monotone" dataKey="Temp" stroke="#f97316" fill="url(#tmpGrad)" strokeWidth={2.5}
                        dot={({ cx, cy, payload }) => {
                          const isFever = (payload.Temp ?? 0) > 37.2
                          return <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={4} fill={isFever ? "#ef4444" : "#f97316"} stroke="none" />
                        }}
                        name="Temperature"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Blood markers */}
          <TabsContent value="blood">
            <div className="grid lg:grid-cols-2 gap-4">
              <Card className="bg-[#1a1a22] border-[#2a2a35]">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-white">Hemoglobin (g/dL)</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                      <defs>
                        <linearGradient id="hbGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%"   stopColor="#ec4899" stopOpacity={0.4} />
                          <stop offset="100%" stopColor="#ec4899" stopOpacity={0}   />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="date" tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} domain={[6, 18]} />
                      <Tooltip content={<ChartTooltip />} />
                      <ReferenceLine y={11}  stroke="#ec4899" strokeDasharray="4 4" strokeOpacity={0.4} label={{ value: "Anaemia threshold", fill: "#6b7280", fontSize: 9 }} />
                      <ReferenceLine y={17}  stroke="#ec4899" strokeDasharray="4 4" strokeOpacity={0.3} />
                      <Area type="monotone" dataKey="Hb" stroke="#ec4899" fill="url(#hbGrad)" strokeWidth={2.5}
                        dot={({ cx, cy, payload }) => {
                          const isLow = (payload.Hb ?? 12) < 11
                          return <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={4} fill={isLow ? "#ef4444" : "#ec4899"} stroke="none" />
                        }}
                        name="Hemoglobin"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="bg-[#1a1a22] border-[#2a2a35]">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-white">Fasting Blood Sugar (mg/dL)</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                      <XAxis dataKey="date" tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} domain={[60, 140]} />
                      <Tooltip content={<ChartTooltip />} />
                      <ReferenceLine y={100} stroke="#eab308" strokeDasharray="4 4" strokeOpacity={0.5} label={{ value: "Pre-diabetic", fill: "#6b7280", fontSize: 9 }} />
                      <ReferenceLine y={126} stroke="#ef4444" strokeDasharray="4 4" strokeOpacity={0.5} label={{ value: "Diabetic", fill: "#9ca3af", fontSize: 9 }} />
                      <Bar dataKey="Sugar" name="Fasting Sugar" radius={[4, 4, 0, 0]}>
                        {chartData.map((entry, idx) => (
                          <Cell key={idx} fill={
                            (entry.Sugar ?? 0) >= 126 ? "#ef4444"
                            : (entry.Sugar ?? 0) >= 100 ? "#eab308"
                            : "#22c55e"
                          } />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </motion.div>

      {/* ICMR Reference Panel */}
      <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={9}>
        <Card className="bg-[#1a1a22] border-[#2a2a35]">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
              <Info className="w-4 h-4 text-brand-400" />
              ICMR Normal Reference Ranges
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {(Object.entries(RANGES) as [VitalKey, typeof RANGES[VitalKey]][]).map(([key, cfg]) => {
                const val = latest?.[key as keyof MedicalReport] as number | undefined
                const status = getStatus(key, val)
                const Icon = cfg.icon
                return (
                  <div key={key} className={`flex items-center gap-3 p-3 rounded-xl border ${
                    status === "high"   ? "border-red-500/25 bg-red-500/5"
                    : status === "low" ? "border-yellow-500/25 bg-yellow-500/5"
                    : "border-white/5 bg-white/[0.02]"
                  }`}>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: cfg.color + "20" }}>
                      <Icon className="w-4 h-4" style={{ color: cfg.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-400 font-medium truncate">{cfg.label}</p>
                      <p className="text-[10px] text-gray-600 mt-0.5">Normal: {cfg.min}–{cfg.max} {cfg.unit}</p>
                    </div>
                    <div className="text-right shrink-0">
                      {val != null ? (
                        <>
                          <p className="text-sm font-bold text-white">{val}</p>
                          <div className="mt-0.5">{statusBadge(status)}</div>
                        </>
                      ) : (
                        <p className="text-xs text-gray-600">No data</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Health alerts */}
            {summaryCards.some(c => c.status !== "normal" && c.val != null) && (
              <div className="mt-4 space-y-2">
                {summaryCards.filter(c => c.status !== "normal" && c.val != null).map(({ key, label, val, status, unit }) => (
                  <div key={key} className={`flex items-center gap-2 text-sm rounded-xl px-4 py-2.5 border ${
                    status === "high" ? "bg-red-500/10 border-red-500/20 text-red-300"
                    : "bg-yellow-500/10 border-yellow-500/20 text-yellow-300"
                  }`}>
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span><strong>{label}</strong> is {status} ({val} {unit}) — consult your doctor</span>
                  </div>
                ))}
              </div>
            )}

            {summaryCards.every(c => c.status === "normal" || c.val == null) && (
              <div className="mt-4 flex items-center gap-2 text-sm text-green-400 bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-2.5">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                All recorded vitals are within ICMR normal range — good health!
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}
