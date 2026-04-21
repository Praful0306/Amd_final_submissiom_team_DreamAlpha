import { useEffect, useState, useCallback } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import {
  ArrowLeft, User, Activity, FileText, Download, Eye, Bell, Send,
  X, CheckCircle, AlertTriangle, Phone,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { RiskBadge } from "@/components/shared/RiskBadge"
import { HealthScore } from "@/components/shared/HealthScore"
import { VAPICallButton } from "@/components/shared/VAPICallButton"
import { getPatientProfile, getReports, type Patient, type MedicalReport } from "@/lib/api"
import { formatDate } from "@/lib/utils"
import { downloadPatientReportPDF } from "@/lib/pdfReport"
import { triggerAlert, sendSMS } from "@/lib/makecom"
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from "recharts"


// ── Report Viewer Modal ──────────────────────────────────────────────────────
function ReportModal({ report, patient, onClose }: { report: MedicalReport; patient: Patient; onClose: () => void }) {
  const vitals = [
    { label: "Heart Rate",     value: report.heart_rate  ? `${report.heart_rate} bpm` : "—",   status: report.heart_rate  && report.heart_rate  > 100 ? "elevated" : "normal", color: "text-red-400"    },
    { label: "SpO₂",          value: report.spo2        ? `${report.spo2}%`          : "—",   status: report.spo2        && report.spo2        < 95  ? "low"      : "normal", color: "text-green-400"  },
    { label: "Temperature",   value: report.temperature ? `${report.temperature}°C`  : "—",   status: report.temperature && report.temperature > 38  ? "fever"    : "normal", color: "text-orange-400" },
    { label: "Blood Pressure",value: report.bp_systolic ? `${report.bp_systolic}/${report.bp_diastolic} mmHg` : "—",
      status: report.bp_systolic && report.bp_systolic > 140 ? "high" : "normal", color: "text-blue-400" },
  ]

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-lg bg-[#1a1a22] border border-[#2a2a35] rounded-2xl overflow-hidden shadow-2xl"
      >
        {/* Modal header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#2a2a35]">
          <div>
            <h3 className="font-semibold text-white">{report.diagnosis ?? "Medical Report"}</h3>
            <p className="text-xs text-gray-500 mt-0.5">{patient.name} · {report.created_at ? formatDate(report.created_at) : "—"}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Vitals grid */}
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {vitals.map(v => (
              <div key={v.label} className="bg-white/[0.03] border border-white/5 rounded-xl p-3">
                <p className="text-[10px] text-gray-500 uppercase tracking-wider">{v.label}</p>
                <p className={`text-xl font-bold mt-1 ${v.color}`}>{v.value}</p>
                <p className={`text-[10px] mt-0.5 capitalize ${v.status === "normal" ? "text-green-500" : "text-yellow-400"}`}>
                  {v.status !== "normal" ? "⚠ " : "✓ "}{v.status}
                </p>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between pt-1">
            <RiskBadge level={report.risk_level ?? "LOW"} />
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="border-[#2a2a35] text-gray-400 hover:text-white gap-1.5"
                onClick={() => downloadPatientReportPDF(patient, [report], 0)}
              >
                <Download className="w-3.5 h-3.5" />
                Download PDF
              </Button>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ── Alert toast ──────────────────────────────────────────────────────────────
function AlertToast({ msg, type, onClose }: { msg: string; type: "success" | "error"; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 4000); return () => clearTimeout(t) }, [onClose])
  return (
    <motion.div
      initial={{ opacity: 0, y: -16, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={`fixed top-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border text-sm ${
        type === "success"
          ? "bg-green-900/80 border-green-500/30 text-green-200"
          : "bg-red-900/80 border-red-500/30 text-red-200"
      }`}
    >
      {type === "success" ? <CheckCircle className="w-4 h-4 text-green-400 shrink-0" /> : <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />}
      {msg}
      <button onClick={onClose} className="ml-2 opacity-60 hover:opacity-100"><X className="w-3.5 h-3.5" /></button>
    </motion.div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function PatientDetail() {
  const { id }      = useParams()
  const navigate    = useNavigate()
  const [patient,  setPatient]  = useState<Patient | null>(null)
  const [reports,  setReports]  = useState<MedicalReport[]>([])
  const [loading,  setLoading]  = useState(true)
  const [viewReport, setViewReport] = useState<MedicalReport | null>(null)
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null)
  const [alertSending, setAlertSending] = useState(false)

  const fetchData = useCallback(() => {
    if (!id) return
    Promise.all([
      getPatientProfile(id).catch(() => null),
      getReports(id).catch(() => []),
    ]).then(([p, r]) => {
      setPatient(p as Patient | null)
      setReports(r as MedicalReport[])
    }).finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    fetchData()
    // Auto-refresh when window regains focus (patient may have uploaded a new report)
    const onFocus = () => fetchData()
    window.addEventListener("focus", onFocus)
    return () => window.removeEventListener("focus", onFocus)
  }, [fetchData])

  const chartData = [...reports].reverse().slice(0, 7).map(r => ({
    date: r.created_at ? formatDate(r.created_at).split(" ")[0] : "—",
    HR:   r.heart_rate,
    SpO2: r.spo2,
    BP:   r.bp_systolic,
  }))

  const handleSendAlert = async () => {
    if (!patient) return
    setAlertSending(true)
    const ok = await triggerAlert({
      name:         patient.name ?? "Unknown",
      phone:        patient.phone,
      risk_level:   patient.risk_level ?? "HIGH",
      diagnosis:    patient.diagnosis,
      health_score: patient.health_score,
      village:      patient.village,
    })
    setAlertSending(false)
    setToast({ msg: ok ? "Alert sent via Make.com ✓" : "Make.com webhook not configured. Add VITE_MAKECOM_ALERT_WEBHOOK to .env", type: ok ? "success" : "error" })
  }

  const handleSendSMS = async () => {
    if (!patient?.phone) return
    const ok = await sendSMS(patient.phone, `Dr. wants to see you. Please visit the clinic. — Sahayak AI`)
    setToast({ msg: ok ? `SMS sent to ${patient.phone} ✓` : "SMS webhook not configured. Add VITE_MAKECOM_SMS_WEBHOOK to .env", type: ok ? "success" : "error" })
  }

  if (loading) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-4">
        <Skeleton className="h-10 w-40 bg-white/5" />
        <Skeleton className="h-40 bg-white/5 rounded-2xl" />
        <Skeleton className="h-60 bg-white/5 rounded-2xl" />
      </div>
    )
  }

  if (!patient) {
    return (
      <div className="p-6 flex flex-col items-center gap-4 text-center">
        <p className="text-white font-medium">Patient not found</p>
        <Button variant="outline" className="border-white/10 text-gray-400" onClick={() => navigate("/doctor")}>
          Back to Dashboard
        </Button>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Toast */}
      <AnimatePresence>
        {toast && <AlertToast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      </AnimatePresence>

      {/* Report view modal */}
      <AnimatePresence>
        {viewReport && <ReportModal report={viewReport} patient={patient} onClose={() => setViewReport(null)} />}
      </AnimatePresence>

      {/* Back */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-gray-500 hover:text-white text-sm transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back
      </button>

      {/* Profile card */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="bg-[#1a1a22] border-[#2a2a35]">
          <CardContent className="p-6">
            <div className="flex flex-wrap items-start gap-6">
              {/* Avatar */}
              <div className="w-16 h-16 rounded-2xl bg-brand-500/20 flex items-center justify-center text-2xl font-bold text-brand-400">
                {patient.name?.split(" ").map(n => n[0]).join("").slice(0, 2)}
              </div>
              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1 flex-wrap">
                  <h2 className="text-2xl font-bold text-white">{patient.name}</h2>
                  <RiskBadge level={patient.risk_level ?? "LOW"} />
                </div>
                <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-gray-400">
                  <span>{patient.age} years · {patient.gender === "F" ? "Female" : "Male"}</span>
                  {patient.blood_group && <span>Blood: {patient.blood_group}</span>}
                  {patient.phone && <span>📞 {patient.phone}</span>}
                  {patient.village && <span>📍 {patient.village}, {patient.district}</span>}
                  {patient.is_pregnant && <span className="text-pink-400">🤰 Pregnant</span>}
                </div>
                {patient.medical_history && (
                  <p className="text-sm text-gray-500 mt-2 bg-white/5 px-3 py-2 rounded-lg border border-white/[0.08]">
                    <span className="text-gray-400 font-medium">History: </span>
                    {patient.medical_history}
                  </p>
                )}

                {/* Action buttons */}
                <div className="flex flex-wrap gap-2 mt-3">
                  {/* Download full PDF */}
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-[#2a2a35] text-gray-400 hover:text-white gap-1.5"
                    onClick={() => downloadPatientReportPDF(patient, reports)}
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download PDF
                  </Button>

                  {/* Send SMS via Make.com */}
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-blue-500/30 text-blue-400 hover:text-blue-300 gap-1.5"
                    onClick={handleSendSMS}
                  >
                    <Send className="w-3.5 h-3.5" />
                    SMS Patient
                  </Button>

                  {/* High-risk alert via Make.com */}
                  {["HIGH", "EMERGENCY"].includes(patient.risk_level ?? "") && (
                    <Button
                      size="sm"
                      className="bg-red-600/80 hover:bg-red-600 text-white gap-1.5"
                      onClick={handleSendAlert}
                      disabled={alertSending}
                    >
                      <Bell className="w-3.5 h-3.5" />
                      {alertSending ? "Alerting..." : "Send Alert"}
                    </Button>
                  )}

                  {/* VAPI call */}
                  <VAPICallButton
                    patientName={patient.name ?? "Patient"}
                    patientPhone={patient.phone}
                    patientId={patient.id}
                    context={patient.diagnosis ?? patient.medical_history}
                    language="hi-IN"
                    compact
                  />
                </div>
              </div>
              {/* Health score */}
              <HealthScore score={patient.health_score ?? 70} size={90} />
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Vitals trend chart */}
      {chartData.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="bg-[#1a1a22] border-[#2a2a35]">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold text-white flex items-center gap-2">
                <Activity className="w-4 h-4 text-brand-400" /> Vitals Trend
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="hrG"   x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#f97316" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="spo2G" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="bpG"   x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: "#1a1a22", border: "1px solid #2a2a35", borderRadius: 8 }} labelStyle={{ color: "#9ca3af" }} />
                  <Area type="monotone" dataKey="HR"   stroke="#f97316" fill="url(#hrG)"   strokeWidth={2} dot={false} name="Heart Rate" />
                  <Area type="monotone" dataKey="SpO2" stroke="#22c55e" fill="url(#spo2G)" strokeWidth={2} dot={false} name="SpO₂" />
                  <Area type="monotone" dataKey="BP"   stroke="#3b82f6" fill="url(#bpG)"   strokeWidth={2} dot={false} name="BP Sys" />
                </AreaChart>
              </ResponsiveContainer>
              <div className="flex gap-4 mt-2 justify-center">
                {[["HR", "#f97316", "Heart Rate"], ["SpO2", "#22c55e", "SpO₂"], ["BP", "#3b82f6", "BP Systolic"]].map(([, color, label]) => (
                  <span key={label} className="flex items-center gap-1.5 text-xs text-gray-400">
                    <span className="w-2.5 h-1.5 rounded-sm" style={{ background: color }} />
                    {label}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Latest Vitals Snapshot — Radar */}
      {reports[0] && (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <Card className="bg-[#1a1a22] border-[#2a2a35]">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold text-white flex items-center gap-2">
                <Activity className="w-4 h-4 text-purple-400" /> Latest Vitals Snapshot
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid sm:grid-cols-2 gap-6 items-center">
                <ResponsiveContainer width="100%" height={200}>
                  <RadarChart data={[
                    { metric: "Heart Rate", value: Math.min(100, Math.round(((reports[0].heart_rate ?? 80) / 120) * 100)) },
                    { metric: "SpO₂",       value: reports[0].spo2 ?? 98 },
                    { metric: "Temp Score", value: Math.max(0, 100 - Math.abs(((reports[0].temperature ?? 37) - 37) * 20)) },
                    { metric: "BP Score",   value: Math.max(0, 100 - Math.abs(((reports[0].bp_systolic ?? 120) - 120) / 2)) },
                    { metric: "Stability",  value: patient.health_score ?? 70 },
                    { metric: "ICMR Match", value: 87 },
                  ]} margin={{ top: 10, right: 20, bottom: 10, left: 20 }}>
                    <PolarGrid stroke="#2a2a35" />
                    <PolarAngleAxis dataKey="metric" tick={{ fill: "#6b7280", fontSize: 10 }} />
                    <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                    <Radar dataKey="value" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.2} strokeWidth={2} dot={{ fill: "#8b5cf6", r: 3 }} />
                    <Tooltip
                      contentStyle={{ background: "#1a1a22", border: "1px solid #2a2a35", borderRadius: 8, fontSize: 12 }}
          formatter={(value) => [value == null ? "—" : String(value), "Score"] as [string, string]}
                    />
                  </RadarChart>
                </ResponsiveContainer>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Heart Rate",     value: `${reports[0].heart_rate ?? "—"} bpm`,                                          color: "text-red-400"    },
                    { label: "SpO₂",           value: `${reports[0].spo2 ?? "—"}%`,                                                  color: "text-green-400"  },
                    { label: "Temperature",    value: `${reports[0].temperature ?? "—"}°C`,                                           color: "text-orange-400" },
                    { label: "Blood Pressure", value: `${reports[0].bp_systolic ?? "—"}/${reports[0].bp_diastolic ?? "—"}`,           color: "text-blue-400"   },
                  ].map(v => (
                    <div key={v.label} className="bg-white/[0.03] rounded-xl p-3 border border-white/5">
                      <p className="text-[10px] text-gray-500 uppercase tracking-wide">{v.label}</p>
                      <p className={`text-lg font-bold mt-0.5 ${v.color}`}>{v.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Reports list */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <Card className="bg-[#1a1a22] border-[#2a2a35]">
          <CardHeader className="flex-row items-center justify-between pb-2">
            <CardTitle className="text-base font-semibold text-white flex items-center gap-2">
              <FileText className="w-4 h-4 text-gray-400" /> Medical Reports ({reports.length})
            </CardTitle>
            {reports.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                className="border-[#2a2a35] text-gray-400 hover:text-white gap-1.5 text-xs"
                onClick={() => downloadPatientReportPDF(patient, reports)}
              >
                <Download className="w-3 h-3" />
                Download All
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {reports.length === 0 ? (
              <p className="text-sm text-gray-600 py-4">No reports on file</p>
            ) : (
              <div className="divide-y divide-[#2a2a35]">
                {reports.map((r, idx) => (
                  <div key={r.id} className="flex items-center justify-between py-3 gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-white truncate">{r.diagnosis ?? "General Checkup"}</p>
                      <div className="flex gap-4 mt-1 text-xs text-gray-500">
                        {r.heart_rate   && <span>HR: {r.heart_rate}</span>}
                        {r.spo2         && <span>SpO₂: {r.spo2}%</span>}
                        {r.bp_systolic  && <span>BP: {r.bp_systolic}/{r.bp_diastolic}</span>}
                        {r.temperature  && <span>Temp: {r.temperature}°C</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <p className="text-xs text-gray-600 hidden sm:block">{r.created_at ? formatDate(r.created_at) : ""}</p>
                      <RiskBadge level={r.risk_level ?? "LOW"} size="sm" />
                      {/* View button */}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs text-gray-400 hover:text-white gap-1"
                        onClick={() => setViewReport(r)}
                      >
                        <Eye className="w-3 h-3" />
                        View
                      </Button>
                      {/* Download single report PDF */}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs text-gray-400 hover:text-white gap-1"
                        onClick={() => downloadPatientReportPDF(patient, reports, idx)}
                      >
                        <Download className="w-3 h-3" />
                        PDF
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}
