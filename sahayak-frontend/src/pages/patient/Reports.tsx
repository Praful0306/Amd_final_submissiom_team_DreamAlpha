import { useEffect, useState, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  FileText, TrendingUp, TrendingDown, Minus, Download,
  Activity, Droplets, Thermometer, Heart, Wind, Zap,
  Brain, Calendar, ChevronRight, Stethoscope, FlaskConical
} from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { RiskBadge } from "@/components/shared/RiskBadge"
import { getReports, resolvePatientId, type MedicalReport, type Patient } from "@/lib/api"
import { useStore } from "@/store/useStore"
import { formatDate } from "@/lib/utils"
import { downloadPatientReportPDF } from "@/lib/pdfReport"

/* ── Vital definitions ───────────────────────────────────────────────────── */
const VITALS = [
  { key: "heart_rate",          label: "Heart Rate",    unit: "bpm",   normal: [60,100]  as [number,number], icon: Heart,       color: "#f97316", gradient: "from-orange-500/20 to-orange-500/5"  },
  { key: "spo2",                label: "SpO₂",          unit: "%",     normal: [95,100]  as [number,number], icon: Wind,        color: "#06b6d4", gradient: "from-cyan-500/20 to-cyan-500/5"      },
  { key: "temperature",         label: "Temperature",   unit: "°C",    normal: [36.1,37.2] as [number,number], icon: Thermometer, color: "#a78bfa", gradient: "from-violet-500/20 to-violet-500/5"  },
  { key: "blood_sugar_fasting", label: "Fasting Sugar", unit: "mg/dL", normal: [70,100]  as [number,number], icon: Droplets,    color: "#f43f5e", gradient: "from-rose-500/20 to-rose-500/5"      },
  { key: "hemoglobin",          label: "Hemoglobin",    unit: "g/dL",  normal: [12,17]   as [number,number], icon: FlaskConical,color: "#10b981", gradient: "from-emerald-500/20 to-emerald-500/5" },
  { key: "bp_systolic",         label: "BP Systolic",   unit: "mmHg",  normal: [90,120]  as [number,number], icon: Activity,    color: "#3b82f6", gradient: "from-blue-500/20 to-blue-500/5"      },
] as const

const RISK_CONFIG: Record<string, { gradient: string; text: string; glow: string; border: string }> = {
  LOW:       { gradient: "from-emerald-500/15 to-emerald-500/0", text: "text-emerald-400", glow: "shadow-emerald-500/10", border: "border-emerald-500/20" },
  MEDIUM:    { gradient: "from-amber-500/15 to-amber-500/0",    text: "text-amber-400",   glow: "shadow-amber-500/10",   border: "border-amber-500/20"   },
  HIGH:      { gradient: "from-orange-500/15 to-orange-500/0",  text: "text-orange-400",  glow: "shadow-orange-500/10",  border: "border-orange-500/20"  },
  EMERGENCY: { gradient: "from-red-500/20 to-red-500/0",        text: "text-red-400",     glow: "shadow-red-500/10",     border: "border-red-500/25"     },
  PENDING:   { gradient: "from-gray-500/10 to-gray-500/0",      text: "text-gray-400",    glow: "shadow-gray-500/5",     border: "border-gray-500/20"    },
}

/* ── Arc gauge for a vital value ─────────────────────────────────────────── */
function ArcGauge({ value, min, max, color }: { value: number; min: number; max: number; color: string }) {
  const pct = Math.min(1, Math.max(0, (value - min) / (max - min)))
  const R = 20, cx = 24, cy = 28, sweep = 200
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const startAngle = -100 + 270
  const endAngle   = startAngle + sweep * pct
  const x1 = cx + R * Math.cos(toRad(startAngle - 90))
  const y1 = cy + R * Math.sin(toRad(startAngle - 90))
  const x2 = cx + R * Math.cos(toRad(endAngle - 90))
  const y2 = cy + R * Math.sin(toRad(endAngle - 90))
  const large = sweep * pct > 180 ? 1 : 0
  return (
    <svg width="48" height="38" viewBox="0 0 48 38">
      {/* track */}
      <path d={`M ${cx + R * Math.cos(toRad(startAngle - 90))} ${cy + R * Math.sin(toRad(startAngle - 90))} A ${R} ${R} 0 1 1 ${cx + R * Math.cos(toRad(startAngle + sweep - 90))} ${cy + R * Math.sin(toRad(startAngle + sweep - 90))}`}
        fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="3" strokeLinecap="round" />
      {/* fill */}
      {pct > 0.01 && (
        <path d={`M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2}`}
          fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" />
      )}
    </svg>
  )
}

/* ── Single vital card ───────────────────────────────────────────────────── */
function VitalCard({ vitalDef, value, prevValue }: {
  vitalDef: (typeof VITALS)[number]
  value?: number | null
  prevValue?: number | null
}) {
  const { label, unit, normal, icon: Icon, color, gradient } = vitalDef
  const isHigh = value != null && value > normal[1]
  const isLow  = value != null && value < normal[0]
  const delta  = value != null && prevValue != null ? value - prevValue : null
  const statusColor = isHigh ? "#f43f5e" : isLow ? "#fbbf24" : color

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`relative overflow-hidden rounded-2xl border p-4 bg-gradient-to-br ${
        isHigh ? "border-rose-500/25 bg-rose-500/5" : isLow ? "border-amber-500/25 bg-amber-500/5" : `border-white/[0.06] bg-gradient-to-br ${gradient}`
      }`}
      style={{ background: `linear-gradient(135deg, ${statusColor}18 0%, transparent 70%)` }}
    >
      {/* top row */}
      <div className="flex items-center justify-between mb-2">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: `${statusColor}22` }}>
          <Icon className="w-4 h-4" style={{ color: statusColor }} />
        </div>
        {value != null && (
          <ArcGauge value={value} min={normal[0] * 0.7} max={normal[1] * 1.3} color={statusColor} />
        )}
      </div>

      {/* value */}
      <div className="mt-1">
        {value != null ? (
          <span className="text-2xl font-bold text-white tracking-tight">{value}</span>
        ) : (
          <span className="text-2xl font-bold text-white/20">—</span>
        )}
        <span className="text-xs text-gray-500 ml-1.5">{unit}</span>
      </div>

      {/* label + trend */}
      <div className="flex items-center justify-between mt-1.5">
        <p className="text-[11px] text-gray-400 font-medium">{label}</p>
        {delta != null && (
          <span className={`text-[10px] font-semibold flex items-center gap-0.5 ${delta > 0 ? "text-rose-400" : delta < 0 ? "text-emerald-400" : "text-gray-500"}`}>
            {delta > 0 ? <TrendingUp className="w-2.5 h-2.5" /> : delta < 0 ? <TrendingDown className="w-2.5 h-2.5" /> : <Minus className="w-2.5 h-2.5" />}
            {delta > 0 ? "+" : ""}{delta.toFixed(1)}
          </span>
        )}
      </div>

      {/* status pill */}
      {(isHigh || isLow) && (
        <div className={`absolute top-2 right-2 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${isHigh ? "bg-red-500/20 text-red-400" : "bg-emerald-500/20 text-emerald-400"}`}>
          {isHigh ? "HIGH" : "LOW"}
        </div>
      )}
    </motion.div>
  )
}

/* ── Report list item ────────────────────────────────────────────────────── */
function ReportItem({ report, index, isSelected, onClick }: {
  report: MedicalReport; index: number; isSelected: boolean; onClick: () => void
}) {
  const risk = report.risk_level ?? "PENDING"
  const cfg  = RISK_CONFIG[risk] ?? RISK_CONFIG.PENDING
  return (
    <motion.button
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.04 }}
      onClick={onClick}
      className={`w-full text-left px-4 py-3 rounded-2xl border transition-all duration-200 group ${
        isSelected
          ? `bg-gradient-to-r ${cfg.gradient} ${cfg.border} shadow-sm ${cfg.glow}`
          : "border-white/[0.05] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/10"
      }`}
    >
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${isSelected ? cfg.border + " bg-white/5" : "bg-white/[0.04] border border-white/[0.06]"}`}>
          <Stethoscope className={`w-4 h-4 ${isSelected ? cfg.text : "text-gray-500"}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold truncate ${isSelected ? "text-white" : "text-gray-300"}`}>
            {report.diagnosis || report.ai_summary?.slice(0, 40) || "Medical Report"}
          </p>
          <p className="text-[11px] text-gray-600 mt-0.5 flex items-center gap-1">
            <Calendar className="w-2.5 h-2.5" />
            {report.created_at ? formatDate(report.created_at) : "—"}
          </p>
        </div>
        <div className="shrink-0">
          <RiskBadge level={risk} size="sm" />
        </div>
      </div>
    </motion.button>
  )
}

/* ── Main page ───────────────────────────────────────────────────────────── */
export default function PatientReports() {
  const { user } = useStore()
  const [reports, setReports]   = useState<MedicalReport[]>([])
  const [loading, setLoading]   = useState(true)
  const [selected, setSelected] = useState<MedicalReport | null>(null)

  const fetchReports = useCallback(() => {
    if (!user) return
    setLoading(true)
    resolvePatientId(user)
      .then(pid => getReports(pid))
      .then(r => { setReports(r); setSelected(r[0] ?? null) })
      .catch(() => { setReports([]); setSelected(null) })
      .finally(() => setLoading(false))
  }, [user])

  useEffect(() => { fetchReports() }, [fetchReports])
  useEffect(() => {
    const onFocus = () => fetchReports()
    window.addEventListener("focus", onFocus)
    return () => window.removeEventListener("focus", onFocus)
  }, [fetchReports])

  const prevReport = selected ? reports[reports.indexOf(selected) + 1] ?? null : null
  const risk = selected?.risk_level ?? "PENDING"
  const cfg  = RISK_CONFIG[risk] ?? RISK_CONFIG.PENDING
  const reportPatient: Patient = {
    id: user?.id as number,
    name: user?.full_name ?? user?.name ?? "Patient",
    age: 0,
    gender: "",
    risk_level: risk,
  }

  return (
    <div className="min-h-screen p-4 sm:p-6 max-w-6xl mx-auto">

      {/* ── Page header ── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Medical Reports</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {loading ? "Loading…" : `${reports.length} record${reports.length !== 1 ? "s" : ""} on file`}
          </p>
        </div>
      </div>

      {/* ── Loading skeletons ── */}
      {loading && (
        <div className="grid lg:grid-cols-3 gap-4">
          <div className="space-y-3">
            {[1,2,3].map(i => <Skeleton key={i} className="h-[68px] rounded-2xl bg-white/[0.04]" />)}
          </div>
          <div className="lg:col-span-2 space-y-4">
            <Skeleton className="h-32 rounded-2xl bg-white/[0.04]" />
            <div className="grid grid-cols-3 gap-3">
              {[1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-28 rounded-2xl bg-white/[0.04]" />)}
            </div>
          </div>
        </div>
      )}

      {/* ── Empty state ── */}
      {!loading && reports.length === 0 && (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-3xl border border-white/[0.06] bg-white/[0.02] p-16 flex flex-col items-center gap-4 text-center"
        >
          <div className="w-20 h-20 rounded-3xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center">
            <FileText className="w-9 h-9 text-brand-400" />
          </div>
          <div>
            <p className="text-lg font-semibold text-white">No reports yet</p>
            <p className="text-sm text-gray-500 mt-1">Upload a medical report to start tracking your health</p>
          </div>
        </motion.div>
      )}

      {/* ── Main layout ── */}
      {!loading && reports.length > 0 && (
        <div className="grid lg:grid-cols-[280px_1fr] gap-4">

          {/* Left: report list */}
          <div className="space-y-2">
            {reports.map((r, i) => (
              <ReportItem key={r.id} report={r} index={i}
                isSelected={selected?.id === r.id}
                onClick={() => setSelected(r)} />
            ))}
          </div>

          {/* Right: detail panel */}
          <AnimatePresence mode="wait">
            {selected && (
              <motion.div key={selected.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                className="space-y-4"
              >

                {/* ── Report header card ── */}
                <div className={`rounded-3xl border p-5 bg-gradient-to-br ${cfg.gradient} ${cfg.border} shadow-sm ${cfg.glow}`}>
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <RiskBadge level={risk} size="md" />
                      {Boolean(selected.is_ai_extracted) && (
                          <span className="text-[10px] font-bold bg-brand-500/20 text-brand-300 border border-brand-500/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <Brain className="w-2.5 h-2.5" /> AI Extracted
                          </span>
                        )}
                      </div>
                      <h2 className="text-xl font-bold text-white leading-snug">
                        {selected.diagnosis || selected.ai_summary?.slice(0, 60) || "Medical Report"}
                      </h2>
                      {selected.created_at && (
                        <p className="text-sm text-gray-400 mt-1.5 flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5" />
                          {formatDate(selected.created_at)}
                        </p>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-white/10 bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white gap-2 rounded-xl h-9 shrink-0"
                    onClick={() => downloadPatientReportPDF(reportPatient, [selected], 0)}
                    >
                      <Download className="w-3.5 h-3.5" /> PDF
                    </Button>
                  </div>
                </div>

                {/* ── Vitals grid ── */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {VITALS.map(v => (
                    <VitalCard
                      key={v.key}
                      vitalDef={v}
                      value={selected[v.key as keyof MedicalReport] as number | undefined}
                      prevValue={prevReport ? prevReport[v.key as keyof MedicalReport] as number | undefined : null}
                    />
                  ))}
                </div>

                {/* ── AI summary + symptoms ── */}
                {(selected.ai_summary || selected.symptoms || selected.notes) && (
                  <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 space-y-4">
                    {selected.ai_summary && (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-6 h-6 rounded-lg bg-brand-500/20 flex items-center justify-center">
                            <Brain className="w-3.5 h-3.5 text-brand-400" />
                          </div>
                          <span className="text-xs font-semibold text-brand-400 uppercase tracking-wider">AI Insight</span>
                        </div>
                        <p className="text-sm text-gray-300 leading-relaxed">{selected.ai_summary}</p>
                      </div>
                    )}
                    {selected.symptoms && (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-6 h-6 rounded-lg bg-violet-500/20 flex items-center justify-center">
                            <Zap className="w-3.5 h-3.5 text-violet-400" />
                          </div>
                          <span className="text-xs font-semibold text-violet-400 uppercase tracking-wider">Symptoms</span>
                        </div>
                        <p className="text-sm text-gray-300 leading-relaxed">{selected.symptoms}</p>
                      </div>
                    )}
                    {selected.notes && (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-6 h-6 rounded-lg bg-sky-500/20 flex items-center justify-center">
                            <FileText className="w-3.5 h-3.5 text-sky-400" />
                          </div>
                          <span className="text-xs font-semibold text-sky-400 uppercase tracking-wider">Doctor Notes</span>
                        </div>
                        <p className="text-sm text-gray-300 leading-relaxed">{selected.notes}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* ── BP pair if both present ── */}
                {selected.bp_systolic && selected.bp_diastolic && (
                  <div className="rounded-2xl border border-blue-500/15 bg-gradient-to-r from-blue-500/10 to-transparent p-4 flex items-center gap-4">
                    <div className="w-10 h-10 rounded-2xl bg-blue-500/20 flex items-center justify-center shrink-0">
                      <Activity className="w-5 h-5 text-blue-400" />
                    </div>
                    <div>
                      <p className="text-[11px] text-gray-500 uppercase tracking-wider font-semibold mb-0.5">Blood Pressure</p>
                      <p className="text-2xl font-bold text-white">
                        {selected.bp_systolic}<span className="text-gray-500 text-lg font-normal">/</span>{selected.bp_diastolic}
                        <span className="text-sm text-gray-500 font-normal ml-1.5">mmHg</span>
                      </p>
                    </div>
                    {(() => {
                      const sys = selected.bp_systolic
                      const isHigh = sys > 140, isLow = sys < 90
                      return isHigh || isLow ? (
                        <span className={`ml-auto text-xs font-bold px-2.5 py-1 rounded-full ${isHigh ? "bg-red-500/20 text-red-400" : "bg-emerald-500/20 text-emerald-400"}`}>
                          {isHigh ? "ELEVATED" : "LOW"}
                        </span>
                      ) : (
                        <span className="ml-auto text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400">NORMAL</span>
                      )
                    })()}
                  </div>
                )}

              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}
