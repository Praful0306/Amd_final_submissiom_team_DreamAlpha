import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { motion } from "framer-motion"
import { Users, Mic, Map, CheckSquare, Trophy, Star, Zap, AlertTriangle, Bell, Send } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Progress } from "@/components/ui/progress"
import { RiskBadge } from "@/components/shared/RiskBadge"
import { VAPICallButton } from "@/components/shared/VAPICallButton"
import { useStore } from "@/store/useStore"
import { getMyPatients, getAnalyticsStats, getDeepImpact, type Patient } from "@/lib/api"
import { formatDate } from "@/lib/utils"
import { triggerAlert, sendSMS } from "@/lib/makecom"
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts"

const COLORS = ["#f97316", "#3b82f6", "#22c55e", "#eab308", "#ef4444", "#8b5cf6"]

const MOCK_PATIENTS: Patient[] = [
  { id: 1, name: "Priya Devi",    age: 28, gender: "F", village: "Rampur",    risk_level: "HIGH",      diagnosis: "Suspected Dengue" },
  { id: 2, name: "Rajesh Kumar",  age: 45, gender: "M", village: "Sitapur",   risk_level: "MEDIUM",    diagnosis: "Hypertension" },
  { id: 3, name: "Sunita Bai",    age: 32, gender: "F", village: "Rampur",    risk_level: "LOW",       diagnosis: "Anaemia" },
  { id: 4, name: "Arun Singh",    age: 8,  gender: "M", village: "Hardoi",    risk_level: "HIGH",      diagnosis: "Malaria Suspect" },
  { id: 5, name: "Meera Devi",    age: 25, gender: "F", village: "Rampur",    risk_level: "LOW",       diagnosis: "ANC 2nd Visit" },
  { id: 6, name: "Ravi Prasad",   age: 60, gender: "M", village: "Lakhimpur", risk_level: "EMERGENCY", diagnosis: "Chest Pain" },
  { id: 7, name: "Kavita Singh",  age: 22, gender: "F", village: "Sitapur",   risk_level: "MEDIUM",    diagnosis: "Typhoid Suspect" },
  { id: 8, name: "Mohan Lal",     age: 38, gender: "M", village: "Rampur",    risk_level: "LOW",       diagnosis: "TB Screening" },
]

const MOCK_STATS = {
  disease_distribution: { "Malaria": 8, "Dengue": 5, "TB": 3, "Anaemia": 12, "Hypertension": 7, "Maternal": 6, "Dengue Fever": 4 },
  diagnoses_today: 4,
}

const MOCK_IMPACT = {
  impact_score: 847,
  badges: ["First Diagnosis 🎉", "10 Patients 👥", "ASHA Champion 🏆", "Disease Detective 🔍"],
  summary: "Outstanding community health work",
}

const QUICK = [
  { label: "Diagnose Patient", icon: Mic,        href: "/asha/diagnose",  color: "bg-brand-600 hover:bg-brand-700" },
  { label: "Add Patient",      icon: Users,      href: "/asha/patients",  color: "bg-blue-600 hover:bg-blue-700" },
  { label: "Disease Map",      icon: Map,        href: "/asha/heatmap",   color: "bg-purple-600 hover:bg-purple-700" },
  { label: "My Tasks",         icon: CheckSquare,href: "/asha/tasks",     color: "bg-green-600 hover:bg-green-700" },
]

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: (i = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.4, delay: i * 0.07 } }),
}

export default function AshaDashboard() {
  const navigate           = useNavigate()
  const { user }           = useStore()
  const [patients, setPatients]   = useState<Patient[]>([])
  const [stats,    setStats]      = useState<Record<string, unknown> | null>(null)
  const [impact,   setImpact]     = useState<{ impact_score: number; badges: string[]; summary: string } | null>(null)
  const [loading,  setLoading]    = useState(true)

  useEffect(() => {
    const uid = user?.id?.toString() ?? ""
    Promise.all([
      getMyPatients().catch(() => []),
      getAnalyticsStats(uid).catch(() => null),
      getDeepImpact(uid).catch(() => null),
    ]).then(([p, s, imp]) => {
      setPatients((p as Patient[]).length > 0 ? (p as Patient[]) : MOCK_PATIENTS)
      setStats((s ?? MOCK_STATS) as Record<string, unknown>)
      setImpact((imp ?? MOCK_IMPACT) as { impact_score: number; badges: string[]; summary: string })
    }).finally(() => setLoading(false))
  }, [user?.id])

  const [alerting, setAlerting] = useState<Record<number, boolean>>({})
  const [toast, setToast]       = useState<string | null>(null)

  const diseaseDistrib = stats?.disease_distribution
    ? Object.entries(stats.disease_distribution as Record<string, number>).map(([name, value]) => ({ name, value }))
    : []

  const highRisk = patients.filter(p => ["HIGH","EMERGENCY"].includes(p.risk_level ?? ""))
  const impactScore = impact?.impact_score ?? 0

  const handleSendAlert = async (p: Patient) => {
    setAlerting(prev => ({ ...prev, [p.id]: true }))
    await triggerAlert({ name: p.name ?? "Patient", risk_level: p.risk_level ?? "HIGH", diagnosis: p.diagnosis, village: p.village })
    setAlerting(prev => ({ ...prev, [p.id]: false }))
    setToast(`Alert sent for ${p.name}`)
    setTimeout(() => setToast(null), 3000)
  }

  const handleSendSMS = async (p: Patient) => {
    if (!p.phone) { setToast("No phone number for this patient"); setTimeout(() => setToast(null), 3000); return }
    await sendSMS(p.phone, `Sahayak AI: ${p.name}, please see Dr. immediately for ${p.diagnosis ?? "health issue"}.`)
    setToast(`SMS sent to ${p.name}`)
    setTimeout(() => setToast(null), 3000)
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Toast */}
      {toast && (
        <motion.div
          initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
          className="fixed top-4 right-4 z-50 bg-green-900/80 border border-green-500/30 text-green-200 text-sm px-4 py-2.5 rounded-xl shadow-lg"
        >
          ✓ {toast}
        </motion.div>
      )}

      {/* Header */}
      <motion.div variants={fadeUp} initial="hidden" animate="visible">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-2xl font-bold text-white">
              Namaste, <span className="gradient-text">{user?.name?.split(" ")[0]}</span>
            </h2>
            <p className="text-gray-500 mt-0.5">{formatDate(new Date())} · Community Health Worker</p>
          </div>
          {/* VAPI AI help call */}
          <VAPICallButton
            patientName={user?.name ?? "ASHA Worker"}
            context="Provide clinical decision support for rural ASHA workers in India"
            language="hi-IN"
            callType="asha_ai_help"
          />
        </div>
      </motion.div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 bg-white/5 rounded-2xl" />)
        ) : (
          [
            { label: "My Patients",    value: patients.length,                            icon: Users,       color: "text-blue-400" },
            { label: "High Risk",      value: highRisk.length,                            icon: AlertTriangle,color: "text-red-400" },
            { label: "Diagnoses Today",value: (stats?.diagnoses_today as number) ?? 0,   icon: Mic,          color: "text-brand-400" },
            { label: "Impact Score",   value: Math.round(impactScore),                    icon: Trophy,       color: "text-yellow-400" },
          ].map((s, i) => {
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
          })
        )}
      </div>

      {/* Quick actions */}
      <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={4}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {QUICK.map((q) => {
            const Icon = q.icon
            return (
              <Button
                key={q.href}
                className={`h-20 flex-col gap-2 text-sm font-medium ${q.color} text-white rounded-2xl`}
                onClick={() => navigate(q.href)}
              >
                <Icon className="w-6 h-6" />
                {q.label}
              </Button>
            )
          })}
        </div>
      </motion.div>

      {/* Charts + Impact */}
      <div className="grid lg:grid-cols-3 gap-4">
        {/* Disease distribution pie */}
        <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={5} className="lg:col-span-2">
          <Card className="bg-[#1a1a22] border-[#2a2a35] h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold text-white">Disease Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              {diseaseDistrib.length > 0 ? (
                <div className="flex items-center gap-6">
                  <ResponsiveContainer width={160} height={160}>
                    <PieChart>
                      <Pie data={diseaseDistrib} cx="50%" cy="50%" innerRadius={45} outerRadius={70} dataKey="value" paddingAngle={3}>
                        {diseaseDistrib.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={{ background: "#1a1a22", border: "1px solid #2a2a35", borderRadius: 8 }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex-1 space-y-2">
                    {diseaseDistrib.slice(0, 6).map((d, i) => (
                      <div key={d.name} className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2 text-gray-400">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                          {d.name}
                        </span>
                        <span className="font-medium text-white">{d.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="h-40 flex items-center justify-center text-gray-600 text-sm">
                  No diagnosis data yet
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Impact score / gamification */}
        <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={6}>
          <Card className="bg-[#1a1a22] border-[#2a2a35] h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold text-white flex items-center gap-2">
                <Star className="w-4 h-4 text-yellow-400" /> Impact Score
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-center py-4">
                <p className="text-6xl font-extrabold text-yellow-400">{Math.round(impactScore)}</p>
                <p className="text-gray-500 text-sm mt-1">Community Health Points</p>
              </div>

              <div>
                <div className="flex justify-between text-xs text-gray-500 mb-1.5">
                  <span>Progress to next level</span>
                  <span>{Math.round(impactScore % 100)}/100</span>
                </div>
                <Progress value={impactScore % 100} className="h-2 bg-white/10" />
              </div>

              {impact?.badges?.length ? (
                <div>
                  <p className="text-xs text-gray-500 mb-2">Badges Earned</p>
                  <div className="flex flex-wrap gap-1.5">
                    {impact.badges.map((b) => (
                      <span key={b} className="text-[10px] bg-yellow-500/15 text-yellow-400 border border-yellow-500/25 px-2 py-0.5 rounded-full">
                        {b}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {["First Diagnosis 🎉", "10 Patients 👥", "ASHA Champion 🏆"].map((b) => (
                    <span key={b} className="text-[10px] bg-yellow-500/10 text-yellow-500/60 border border-yellow-500/15 px-2 py-0.5 rounded-full">
                      {b}
                    </span>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* High-risk patients */}
      {highRisk.length > 0 && (
        <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={7}>
          <Card className="bg-[#1a1a22] border-red-500/20">
            <CardHeader className="flex-row items-center justify-between pb-2">
              <CardTitle className="text-base font-semibold text-white flex items-center gap-2">
                <Zap className="w-4 h-4 text-red-400" /> Requires Immediate Attention ({highRisk.length})
              </CardTitle>
              <Button
                size="sm"
                variant="outline"
                className="border-red-500/30 text-red-400 hover:bg-red-500/10 gap-1.5 text-xs"
                onClick={() => highRisk.forEach(p => handleSendAlert(p))}
              >
                <Bell className="w-3 h-3" /> Alert All via Make.com
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {highRisk.slice(0, 4).map((p) => (
                  <div key={p.id} className="flex items-center justify-between p-3 rounded-xl bg-red-500/5 border border-red-500/15 gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white">{p.name}</p>
                      <p className="text-xs text-gray-500">{p.age}y · {p.village ?? "—"} · {p.diagnosis ?? "—"}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                      <RiskBadge level={p.risk_level ?? "HIGH"} size="sm" />
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs text-blue-400 hover:bg-blue-500/10 gap-1"
                        onClick={() => handleSendSMS(p)}
                      >
                        <Send className="w-3 h-3" /> SMS
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs text-red-400 hover:bg-red-500/10 gap-1"
                        onClick={() => handleSendAlert(p)}
                        disabled={alerting[p.id]}
                      >
                        <Bell className="w-3 h-3" />
                        {alerting[p.id] ? "..." : "Alert"}
                      </Button>
                      <Button
                        size="sm"
                        className="h-7 text-xs bg-brand-600 hover:bg-brand-700 text-white"
                        onClick={() => navigate("/asha/diagnose")}
                      >
                        Diagnose
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
