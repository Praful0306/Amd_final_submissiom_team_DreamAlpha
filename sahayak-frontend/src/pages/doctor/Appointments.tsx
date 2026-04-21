import { useState, useEffect, useCallback } from "react"
import { motion } from "framer-motion"
import {
  Calendar, Clock, User, Plus, Loader2, RefreshCw,
  CheckCircle2, AlertCircle, Shield, X, Save,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { useStore } from "@/store/useStore"
import {
  getDoctorAppointments, getNextSlots, addManualAppointment,
  type AppointmentItem,
} from "@/lib/api"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

/* ── Date helpers ─────────────────────────────────────────────────────────── */
function today() { return new Date().toISOString().slice(0, 10) }
function tomorrow() {
  const d = new Date(); d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}
function fmtDate(d: string) {
  const dt = new Date(d + "T00:00")
  return dt.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })
}

/* ── Add Appointment Modal ────────────────────────────────────────────────── */
interface AddModalProps {
  doctorId: number
  onClose: () => void
  onSaved: () => void
}
function AddModal({ doctorId, onClose, onSaved }: AddModalProps) {
  const [name,  setName]  = useState("")
  const [phone, setPhone] = useState("")
  const [date,  setDate]  = useState(today())
  const [slot,  setSlot]  = useState("")
  const [reason, setReason] = useState("")
  const [slots,  setSlots]  = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [loadingSlots, setLoadingSlots] = useState(false)

  // Fetch available slots when date changes
  useEffect(() => {
    setLoadingSlots(true)
    getNextSlots(doctorId)
      .then(data => {
        const s = date === data.today_date ? data.today_slots
                : date === data.tomorrow_date ? data.tomorrow_slots
                : data.recommended_slots
        setSlots(s)
        if (s.length && !slot) setSlot(s[0])
      })
      .catch(() => setSlots([]))
      .finally(() => setLoadingSlots(false))
  }, [date, doctorId])

  async function handleSave() {
    if (!name.trim()) { toast.error("Patient name is required"); return }
    if (!slot)        { toast.error("Please select a time slot"); return }
    setSaving(true)
    try {
      const res = await addManualAppointment({
        doctor_id:      doctorId,
        patient_name:   name.trim(),
        patient_phone:  phone.trim() || undefined,
        date,
        time_slot:      slot,
        reason:         reason.trim() || undefined,
      })
      if (!res.success) throw new Error(res.error || "Failed")
      toast.success(`Priority appointment added for ${date} at ${slot}`)
      onSaved()
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add appointment")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md rounded-2xl border border-white/10 bg-[#13131a] shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.07]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-brand-500/15 flex items-center justify-center">
              <Plus className="w-4 h-4 text-brand-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Add Priority Appointment</p>
              <p className="text-[11px] text-gray-500">Blocks the slot — AI agent cannot book it</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Patient name */}
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-500 uppercase tracking-wider">Patient Name *</Label>
            <Input value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g. Priya Sharma"
              className="bg-[#1a1a22] border-[#2a2a35] text-white placeholder:text-gray-600 rounded-xl h-10" />
          </div>

          {/* Phone */}
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-500 uppercase tracking-wider">Phone (optional)</Label>
            <Input value={phone} onChange={e => setPhone(e.target.value)}
              placeholder="+91 98765 43210" type="tel"
              className="bg-[#1a1a22] border-[#2a2a35] text-white placeholder:text-gray-600 rounded-xl h-10" />
          </div>

          {/* Date */}
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-500 uppercase tracking-wider">Date *</Label>
            <div className="flex gap-2">
              {[today(), tomorrow()].map(d => (
                <button key={d} onClick={() => setDate(d)}
                  className={cn("flex-1 h-10 rounded-xl border text-sm font-medium transition-all",
                    date === d
                      ? "bg-brand-500/20 border-brand-500/40 text-brand-300"
                      : "border-[#2a2a35] bg-[#1a1a22] text-gray-500 hover:text-gray-300"
                  )}>
                  {d === today() ? "Today" : "Tomorrow"}
                </button>
              ))}
            </div>
          </div>

          {/* Time slot */}
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-500 uppercase tracking-wider">Time Slot *</Label>
            {loadingSlots ? (
              <div className="flex items-center gap-2 text-xs text-gray-500 py-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading slots…
              </div>
            ) : slots.length === 0 ? (
              <p className="text-xs text-amber-400 py-1">All slots taken for this date</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {slots.map(s => (
                  <button key={s} onClick={() => setSlot(s)}
                    className={cn("px-3 h-9 rounded-xl border text-sm font-medium transition-all",
                      slot === s
                        ? "bg-brand-500/20 border-brand-500/40 text-brand-300"
                        : "border-[#2a2a35] bg-[#1a1a22] text-gray-400 hover:text-gray-200"
                    )}>
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Reason */}
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-500 uppercase tracking-wider">Reason (optional)</Label>
            <Input value={reason} onChange={e => setReason(e.target.value)}
              placeholder="e.g. Emergency follow-up, post-surgery check"
              className="bg-[#1a1a22] border-[#2a2a35] text-white placeholder:text-gray-600 rounded-xl h-10" />
          </div>

          {/* Priority note */}
          <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
            <Shield className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs text-gray-400">
              This is a <span className="text-amber-400 font-semibold">priority appointment</span>.
              The AI booking agent will not assign this slot to anyone else.
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <Button variant="outline" onClick={onClose}
              className="flex-1 border-white/10 text-gray-400 hover:text-white rounded-xl h-10">
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}
              className="flex-1 bg-brand-600 hover:bg-brand-700 text-white rounded-xl h-10 gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Add Appointment
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

/* ── Appointment row ──────────────────────────────────────────────────────── */
function ApptRow({ a, i }: { a: AppointmentItem; i: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: i * 0.05 }}
      className="flex items-center gap-4 p-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] transition-colors"
    >
      <div className={cn(
        "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
        a.is_manual ? "bg-amber-500/15" : "bg-brand-500/15"
      )}>
        <User className={cn("w-5 h-5", a.is_manual ? "text-amber-400" : "text-brand-400")} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold text-white truncate">{a.patient_name || "Unknown"}</p>
          {a.is_manual && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/25 shrink-0">
              PRIORITY
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500 flex-wrap">
          <span className="flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {a.is_today ? "Today" : fmtDate(a.date)}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" /> {a.time}
          </span>
          {a.reason && <span className="truncate max-w-[160px]">{a.reason}</span>}
        </div>
      </div>

      <Badge className={cn(
        "shrink-0 text-xs",
        a.status === "confirmed"
          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
          : "bg-gray-500/10 text-gray-400 border-gray-500/20"
      )}>
        {a.status}
      </Badge>
    </motion.div>
  )
}

/* ── Main ─────────────────────────────────────────────────────────────────── */
export default function Appointments() {
  const { user } = useStore()
  const doctorId = (user as any)?.id as number | undefined

  const [appts,    setAppts]   = useState<AppointmentItem[]>([])
  const [loading,  setLoading] = useState(true)
  const [showAdd,  setShowAdd] = useState(false)

  const fetchAppts = useCallback(() => {
    if (!doctorId) { setLoading(false); return }
    setLoading(true)
    getDoctorAppointments(doctorId, 7)
      .then(setAppts)
      .catch(() => toast.error("Could not load appointments"))
      .finally(() => setLoading(false))
  }, [doctorId])

  useEffect(() => { fetchAppts() }, [fetchAppts])

  const todayAppts     = appts.filter(a => a.is_today)
  const upcomingAppts  = appts.filter(a => !a.is_today)

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Appointments</h2>
          <p className="text-gray-500 text-sm mt-0.5">Today & upcoming consultations</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchAppts}
            className="w-9 h-9 rounded-xl border border-white/10 bg-white/[0.03] flex items-center justify-center text-gray-400 hover:text-white transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
          {doctorId && (
            <Button onClick={() => setShowAdd(true)}
              className="gap-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl h-9 text-sm">
              <Plus className="w-4 h-4" /> Add Priority
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-7 h-7 animate-spin text-brand-400" />
        </div>
      ) : appts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-[#0f0f16] p-10 text-center">
          <Calendar className="w-10 h-10 text-gray-700 mx-auto mb-3" />
          <p className="text-gray-400 font-medium">No appointments scheduled</p>
          <p className="text-gray-600 text-sm mt-1">Appointments booked by patients or manually added will appear here.</p>
          {doctorId && (
            <Button onClick={() => setShowAdd(true)} size="sm"
              className="mt-4 bg-brand-600 hover:bg-brand-700 text-white gap-2">
              <Plus className="w-4 h-4" /> Add Manual Appointment
            </Button>
          )}
        </div>
      ) : (
        <>
          {/* Today */}
          {todayAppts.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Today — {todayAppts.length} appointment{todayAppts.length !== 1 ? "s" : ""}</p>
              </div>
              {todayAppts.map((a, i) => <ApptRow key={a.id} a={a} i={i} />)}
            </div>
          )}

          {/* Upcoming */}
          {upcomingAppts.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mt-4">Upcoming</p>
              {upcomingAppts.map((a, i) => <ApptRow key={a.id} a={a} i={i} />)}
            </div>
          )}
        </>
      )}

      {/* Manual appointment modal */}
      {showAdd && doctorId && (
        <AddModal
          doctorId={doctorId}
          onClose={() => setShowAdd(false)}
          onSaved={fetchAppts}
        />
      )}
    </div>
  )
}
