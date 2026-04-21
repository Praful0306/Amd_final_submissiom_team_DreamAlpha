import { useState } from "react"
import { motion } from "framer-motion"
import {
  Phone, Stethoscope, Heart, MessageCircle,
  CheckCircle2, Loader2, PhoneCall, X,
  Calendar, HelpCircle, FileText, AlertCircle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { useStore } from "@/store/useStore"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import VoiceBookingSession from "./VoiceBookingSession"

/* ── Webhook URL (ASHA only now) ──────────────────────────────────────────── */
const ASHA_WEBHOOK = import.meta.env.VITE_MAKECOM_VAPI_WEBHOOK ?? ""

/* ── Reason options ───────────────────────────────────────────────────────── */
const DOCTOR_REASONS = [
  { id: "appointment", label: "Book Appointment", icon: Calendar   },
  { id: "followup",    label: "Follow-up Visit",  icon: Stethoscope },
  { id: "results",     label: "Test Results",     icon: FileText    },
  { id: "other",       label: "Other",            icon: HelpCircle  },
]

const ASHA_REASONS = [
  { id: "health",     label: "Health Query",    icon: Heart         },
  { id: "medication", label: "Medication Help", icon: FileText      },
  { id: "maternal",   label: "Maternal Care",   icon: MessageCircle },
  { id: "emergency",  label: "Urgent Help",     icon: AlertCircle   },
]

/* ── Call state ───────────────────────────────────────────────────────────── */
type CallState = "idle" | "submitting" | "success" | "error"

/* ── ASHA CallCard (webhook flow — unchanged) ─────────────────────────────── */
interface AshaCardProps {
  patientName:  string
  patientPhone: string
}
function AshaCard({ patientName, patientPhone }: AshaCardProps) {
  const [state,   setState]   = useState<CallState>("idle")
  const [reason,  setReason]  = useState(ASHA_REASONS[0].id)
  const [message, setMessage] = useState("")

  const color = {
    primary: "#ec4899",
    bg:      "from-pink-500/10 to-transparent",
    border:  "border-pink-500/25",
    ring:    "bg-pink-500/15",
    text:    "text-pink-400",
  }

  async function handleCall() {
    if (!ASHA_WEBHOOK) { toast.error("ASHA call service not configured"); return }
    setState("submitting")
    try {
      const response = await fetch(ASHA_WEBHOOK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_name:  patientName  || "Patient",
          patient_phone: patientPhone || "",
          call_type:     "asha",
          reason,
          message:       message.trim(),
          timestamp:     new Date().toISOString(),
        }),
      })
      if (!response.ok) throw new Error(`Webhook returned HTTP ${response.status}`)
      setState("success")
    } catch { setState("error") }
  }

  function reset() { setState("idle"); setMessage(""); setReason(ASHA_REASONS[0].id) }

  if (state === "success") return (
    <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
      className={`rounded-3xl border ${color.border} bg-gradient-to-br ${color.bg} p-8 flex flex-col items-center text-center gap-4`}>
      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 15 }}
        className={`w-20 h-20 rounded-full ${color.ring} flex items-center justify-center`}>
        <CheckCircle2 className={`w-10 h-10 ${color.text}`} />
      </motion.div>
      <div>
        <h3 className="text-xl font-bold text-white">Call Arranged!</h3>
        <p className="text-gray-400 text-sm mt-1.5 max-w-xs">
          Your ASHA Worker has been notified. You'll receive a call shortly on your registered number.
        </p>
      </div>
      <div className={`flex items-center gap-2 px-4 py-2 rounded-full ${color.ring} border ${color.border}`}>
        <span className={`w-2 h-2 rounded-full animate-pulse bg-pink-400`} />
        <span className={`text-sm font-semibold ${color.text}`}>Connecting you…</span>
      </div>
      <button onClick={reset} className="text-xs text-gray-500 hover:text-gray-300 transition-colors mt-1 flex items-center gap-1">
        <X className="w-3 h-3" /> Make another call
      </button>
    </motion.div>
  )

  if (state === "error") return (
    <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
      className="rounded-3xl border border-red-500/30 bg-red-500/5 p-8 flex flex-col items-center text-center gap-4">
      <div className="w-20 h-20 rounded-full bg-red-500/15 flex items-center justify-center">
        <AlertCircle className="w-10 h-10 text-red-400" />
      </div>
      <div>
        <h3 className="text-xl font-bold text-white">Call Failed</h3>
        <p className="text-gray-400 text-sm mt-1.5">Unable to connect right now. Please try again.</p>
      </div>
      <Button onClick={reset} className="bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/30 gap-2">
        <X className="w-4 h-4" /> Try Again
      </Button>
    </motion.div>
  )

  return (
    <motion.div whileHover={{ y: -2 }}
      className={`rounded-3xl border ${color.border} bg-gradient-to-br ${color.bg} overflow-hidden`}>
      <div className="p-6 pb-4">
        <div className="flex items-start gap-4">
          <div className={`w-14 h-14 rounded-2xl ${color.ring} flex items-center justify-center shrink-0`}
            style={{ boxShadow: `0 0 24px #ec489933` }}>
            <Heart className={`w-7 h-7 ${color.text}`} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-white">Call ASHA Worker</h3>
              <span className={`text-xs px-2 py-0.5 rounded-full border ${color.border} ${color.text} font-medium`}>
                Community Health
              </span>
            </div>
            <p className="text-sm text-gray-400 mt-0.5">Health queries, medication help, maternal care</p>
          </div>
        </div>
      </div>
      <div className="px-6 pb-6 space-y-4">
        <div>
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-2.5">Reason for call</p>
          <div className="grid grid-cols-2 gap-2">
            {ASHA_REASONS.map(r => {
              const Icon = r.icon
              return (
                <button key={r.id} onClick={() => setReason(r.id)}
                  className={cn(
                    "flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border text-left transition-all",
                    reason === r.id
                      ? `${color.ring} ${color.border} ${color.text}`
                      : "bg-white/[0.03] border-white/10 text-gray-400 hover:text-gray-200 hover:border-white/20"
                  )}>
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span className="text-xs font-medium leading-tight">{r.label}</span>
                </button>
              )
            })}
          </div>
        </div>
        <div>
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-2">Brief message (optional)</p>
          <textarea value={message} onChange={e => setMessage(e.target.value)} rows={3}
            placeholder="e.g. I have questions about my medication dosage…"
            className="w-full bg-[#0f0f13] border border-white/10 text-white placeholder:text-gray-600 rounded-xl p-3 text-sm resize-none focus:outline-none focus:border-white/25 transition-colors"
          />
        </div>
        <button onClick={handleCall} disabled={state === "submitting"}
          className={cn(
            "w-full flex items-center justify-center gap-3 py-3.5 rounded-xl font-semibold text-white transition-all active:scale-95",
            state === "submitting" ? "opacity-70 cursor-not-allowed" : "hover:brightness-110",
          )}
          style={{ background: "linear-gradient(135deg, #ec4899cc, #ec489988)", boxShadow: "0 4px 20px #ec489933" }}>
          {state === "submitting"
            ? <><Loader2 className="w-5 h-5 animate-spin" /> Connecting…</>
            : <><PhoneCall className="w-5 h-5" /> Call ASHA Worker Now</>
          }
        </button>
      </div>
    </motion.div>
  )
}

/* ── Doctor CallCard (voice session — no design changes) ─────────────────── */
interface DoctorCardProps {
  onStartSession: (reason: string, reasonLabel: string) => void
}
function DoctorCard({ onStartSession }: DoctorCardProps) {
  const [reason, setReason] = useState(DOCTOR_REASONS[0].id)

  const color = {
    primary: "#3b82f6",
    bg:      "from-blue-500/10 to-transparent",
    border:  "border-blue-500/25",
    ring:    "bg-blue-500/15",
    text:    "text-blue-400",
  }

  function handleCall() {
    const label = DOCTOR_REASONS.find(r => r.id === reason)?.label ?? reason
    onStartSession(reason, label)
  }

  return (
    <motion.div whileHover={{ y: -2 }}
      className={`rounded-3xl border ${color.border} bg-gradient-to-br ${color.bg} overflow-hidden`}>
      <div className="p-6 pb-4">
        <div className="flex items-start gap-4">
          <div className={`w-14 h-14 rounded-2xl ${color.ring} flex items-center justify-center shrink-0`}
            style={{ boxShadow: `0 0 24px #3b82f633` }}>
            <Stethoscope className={`w-7 h-7 ${color.text}`} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-white">Call Doctor</h3>
              <span className={`text-xs px-2 py-0.5 rounded-full border ${color.border} ${color.text} font-medium`}>
                Physician
              </span>
            </div>
            <p className="text-sm text-gray-400 mt-0.5">Book appointments, discuss reports, follow-ups</p>
          </div>
        </div>
      </div>
      <div className="px-6 pb-6 space-y-4">
        <div>
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-2.5">Reason for call</p>
          <div className="grid grid-cols-2 gap-2">
            {DOCTOR_REASONS.map(r => {
              const Icon = r.icon
              return (
                <button key={r.id} onClick={() => setReason(r.id)}
                  className={cn(
                    "flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border text-left transition-all",
                    reason === r.id
                      ? `${color.ring} ${color.border} ${color.text}`
                      : "bg-white/[0.03] border-white/10 text-gray-400 hover:text-gray-200 hover:border-white/20"
                  )}>
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span className="text-xs font-medium leading-tight">{r.label}</span>
                </button>
              )
            })}
          </div>
        </div>
        {/* No message textarea for doctor — voice session handles it */}
        <button onClick={handleCall}
          className="w-full flex items-center justify-center gap-3 py-3.5 rounded-xl font-semibold text-white transition-all active:scale-95 hover:brightness-110"
          style={{ background: "linear-gradient(135deg, #3b82f6cc, #3b82f688)", boxShadow: "0 4px 20px #3b82f633" }}>
          <PhoneCall className="w-5 h-5" />
          Call Doctor Now
        </button>
      </div>
    </motion.div>
  )
}

/* ── Main page ────────────────────────────────────────────────────────────── */
export default function CallCenter() {
  const { user } = useStore()
  const patientName  = (user as any)?.full_name || (user as any)?.name  || ""
  const patientPhone = (user as any)?.phone || ""

  const [session, setSession] = useState<{ reason: string; reasonLabel: string } | null>(null)

  /* ── Voice booking session active ── */
  if (session) {
    return (
      <div className="p-4 sm:p-6 max-w-2xl mx-auto">
        <VoiceBookingSession
          reason={session.reason}
          reasonLabel={session.reasonLabel}
          onClose={() => setSession(null)}
        />
      </div>
    )
  }

  /* ── Normal call centre view ── */
  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-6">

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-4 mb-1">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-green-600 to-emerald-500 flex items-center justify-center">
            <Phone className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Call Centre</h1>
            <p className="text-sm text-gray-400">Connect directly with your healthcare team</p>
          </div>
        </div>
      </motion.div>

      {/* Info banner */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
        className="rounded-2xl border border-brand-500/20 bg-brand-500/5 p-4 flex items-start gap-3">
        <div className="w-8 h-8 rounded-xl bg-brand-500/20 flex items-center justify-center shrink-0">
          <PhoneCall className="w-4 h-4 text-brand-400" />
        </div>
        <div>
          <p className="text-sm font-medium text-white">Voice-guided appointment booking</p>
          <p className="text-xs text-gray-400 mt-0.5">
            Our AI assistant will ask you a few questions and book your appointment instantly.
            Speak in <strong className="text-white">English</strong>, <strong className="text-white">Hindi</strong> or <strong className="text-white">Kannada</strong>.
          </p>
        </div>
      </motion.div>

      {/* Doctor card — triggers voice session */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <DoctorCard onStartSession={(reason, label) => setSession({ reason, reasonLabel: label })} />
      </motion.div>

      {/* ASHA card — webhook flow unchanged */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
        <AshaCard patientName={patientName} patientPhone={patientPhone} />
      </motion.div>

      {/* Emergency note */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }}
        className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4 flex items-start gap-3">
        <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
        <p className="text-xs text-gray-400 leading-relaxed">
          <span className="text-red-400 font-semibold">Medical emergency?</span> Do not use this service.
          Call <span className="text-white font-semibold">108</span> (ambulance) or
          <span className="text-white font-semibold"> 104</span> (health helpline) immediately.
        </p>
      </motion.div>

    </div>
  )
}
