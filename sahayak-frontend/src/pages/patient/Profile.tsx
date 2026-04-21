import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import {
  User, Phone, MapPin, Droplets, Weight, Heart,
  Calendar, Edit3, Save, X, CheckCircle2, Loader2,
  Baby, FileText, Shield, Camera, ChevronRight,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useStore } from "@/store/useStore"
import { getPatientProfile, updateProfile, resolvePatientId } from "@/lib/api"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

/* ── Types ───────────────────────────────────────────────────────────────── */
interface ProfileData {
  name:            string
  age:             string
  gender:          string
  phone:           string
  village:         string
  district:        string
  blood_group:     string
  weight_kg:       string
  medical_history: string
  is_pregnant:     boolean
}

const EMPTY: ProfileData = {
  name: "", age: "", gender: "", phone: "",
  village: "", district: "", blood_group: "",
  weight_kg: "", medical_history: "", is_pregnant: false,
}

const BLOOD_GROUPS = ["A+", "A−", "B+", "B−", "AB+", "AB−", "O+", "O−"]
const GENDERS      = ["Male", "Female", "Other"]

/* ── Section card wrapper ────────────────────────────────────────────────── */
function Section({ title, icon: Icon, color, children }: {
  title: string; icon: LucideIcon; color: string; children: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
      <div className={`px-5 py-3.5 border-b border-white/[0.06] flex items-center gap-3 bg-gradient-to-r ${color}`}>
        <div className="w-7 h-7 rounded-xl bg-white/10 flex items-center justify-center">
          <Icon className="w-3.5 h-3.5 text-white" />
        </div>
        <span className="text-sm font-semibold text-white">{title}</span>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

/* ── Field ───────────────────────────────────────────────────────────────── */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-gray-500 font-medium uppercase tracking-wider">{label}</Label>
      {children}
    </div>
  )
}

const inputCls = "bg-[#1a1a22] border-[#2a2a35] text-white placeholder:text-gray-600 focus:border-brand-500/50 rounded-xl h-10"

/* ── Avatar initials ─────────────────────────────────────────────────────── */
function ProfileAvatar({ name }: { name: string }) {
  const initials = name.trim().split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase() || "?"
  const colors   = ["from-brand-600 to-orange-500", "from-violet-600 to-purple-500", "from-cyan-600 to-blue-500", "from-emerald-600 to-green-500"]
  const idx      = (name.charCodeAt(0) || 0) % colors.length
  return (
    <div className={`w-24 h-24 rounded-3xl bg-gradient-to-br ${colors[idx]} flex items-center justify-center shadow-xl text-white text-3xl font-bold`}>
      {initials}
    </div>
  )
}

/* ── Main ────────────────────────────────────────────────────────────────── */
export default function PatientProfile() {
  const { user } = useStore()
  const [data,    setData]    = useState<ProfileData>(EMPTY)
  const [saved,   setSaved]   = useState<ProfileData>(EMPTY)
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [patientId, setPid]   = useState<number | null>(null)

  /* Load profile */
  useEffect(() => {
    if (!user) return
    resolvePatientId(user)
      .then(pid => {
        setPid(pid)
        return getPatientProfile(pid)
      })
      .then(p => {
        const d: ProfileData = {
          name:            p.name            ?? "",
          age:             String(p.age      ?? ""),
          gender:          p.gender          ?? "",
          phone:           p.phone           ?? "",
          village:         p.village         ?? "",
          district:        p.district        ?? "",
          blood_group:     p.blood_group     ?? "",
          weight_kg:       String(p.weight_kg ?? ""),
          medical_history: p.medical_history  ?? "",
          is_pregnant:     p.is_pregnant      ?? false,
        }
        setData(d)
        setSaved(d)
      })
      .catch(() => toast.error("Could not load profile"))
      .finally(() => setLoading(false))
  }, [user])

  function handleChange(field: keyof ProfileData, value: string | boolean) {
    setData(d => ({ ...d, [field]: value }))
  }

  async function handleSave() {
    if (!patientId) { toast.error("Patient ID not found — please log out and back in"); return }
    setSaving(true)
    try {
      await updateProfile(patientId, {
        name:            data.name            || undefined,
        age:             data.age ? Number(data.age) : undefined,
        gender:          data.gender          || undefined,
        phone:           data.phone           || undefined,
        village:         data.village         || undefined,
        district:        data.district        || undefined,
        blood_group:     data.blood_group     || undefined,
        weight_kg:       data.weight_kg ? Number(data.weight_kg) : undefined,
        medical_history: data.medical_history || undefined,
        is_pregnant:     data.is_pregnant,
      })
      setSaved(data)
      setEditing(false)
      toast.success("Profile saved successfully")
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error"
      toast.error(`Save failed: ${msg}`)
    } finally {
      setSaving(false)
    }
  }

  function handleCancel() {
    setData(saved)
    setEditing(false)
  }

  const completeness = (() => {
    const fields = [saved.name, saved.age, saved.gender, saved.phone,
                    saved.village, saved.blood_group, saved.weight_kg]
    const filled = fields.filter(Boolean).length
    return Math.round((filled / fields.length) * 100)
  })()

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="w-8 h-8 animate-spin text-brand-400" />
    </div>
  )

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-5">

      {/* ── Hero header ── */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        className="rounded-3xl border border-white/[0.07] bg-gradient-to-br from-brand-500/10 to-violet-500/5 p-6"
      >
        <div className="flex items-start gap-5">
          <ProfileAvatar name={saved.name || user?.full_name || user?.name || "User"} />

          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-white truncate">
              {saved.name || user?.full_name || user?.name || "Complete your profile"}
            </h1>
            <p className="text-sm text-gray-400 mt-0.5">
              {saved.village && saved.district ? `${saved.village}, ${saved.district}` : "Location not set"}
            </p>
            <div className="flex flex-wrap gap-2 mt-3">
              {saved.blood_group && (
                <span className="text-xs bg-red-500/15 border border-red-500/20 text-red-400 px-2.5 py-1 rounded-full font-semibold">
                  🩸 {saved.blood_group}
                </span>
              )}
              {saved.age && saved.gender && (
                <span className="text-xs bg-white/5 border border-white/10 text-gray-400 px-2.5 py-1 rounded-full">
                  {saved.age} yrs · {saved.gender}
                </span>
              )}
              {saved.is_pregnant && (
                <span className="text-xs bg-pink-500/15 border border-pink-500/20 text-pink-400 px-2.5 py-1 rounded-full">
                  🤰 Pregnant
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Completeness bar */}
        <div className="mt-5">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-gray-500 font-medium">Profile completeness</span>
            <span className={cn("text-xs font-bold", completeness === 100 ? "text-emerald-400" : completeness >= 60 ? "text-amber-400" : "text-gray-500")}>
              {completeness}%
            </span>
          </div>
          <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${completeness}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className={cn("h-full rounded-full", completeness === 100 ? "bg-emerald-500" : completeness >= 60 ? "bg-amber-500" : "bg-brand-500")}
            />
          </div>
        </div>
      </motion.div>

      {/* ── Edit / Save controls ── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-white">Personal Details</h2>
          <p className="text-xs text-gray-500 mt-0.5">Stored securely and shared only with your doctor</p>
        </div>
        {!editing ? (
          <Button size="sm" onClick={() => setEditing(true)}
            className="gap-2 bg-brand-600/20 hover:bg-brand-600/30 text-brand-400 border border-brand-500/30 rounded-xl h-9">
            <Edit3 className="w-3.5 h-3.5" /> Edit Profile
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={handleCancel}
              className="gap-1.5 border-white/10 text-gray-400 hover:text-white rounded-xl h-9">
              <X className="w-3.5 h-3.5" /> Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}
              className="gap-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl h-9">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Save
            </Button>
          </div>
        )}
      </div>

      {/* ── Personal Info ── */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <Section title="Personal Information" icon={User} color="from-brand-500/20 to-transparent">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Full Name">
              {editing
                ? <Input value={data.name} onChange={e => handleChange("name", e.target.value)}
                    placeholder="e.g. Priya Sharma" className={inputCls} />
                : <p className="text-sm text-white py-2.5">{saved.name || <span className="text-gray-600">Not set</span>}</p>
              }
            </Field>
            <Field label="Age">
              {editing
                ? <Input type="number" value={data.age} onChange={e => handleChange("age", e.target.value)}
                    placeholder="e.g. 28" className={inputCls} />
                : <p className="text-sm text-white py-2.5">{saved.age ? `${saved.age} years` : <span className="text-gray-600">Not set</span>}</p>
              }
            </Field>
            <Field label="Gender">
              {editing
                ? <div className="flex gap-2">
                    {GENDERS.map(g => (
                      <button key={g} onClick={() => handleChange("gender", g)}
                        className={cn("flex-1 h-10 rounded-xl border text-sm font-medium transition-all",
                          data.gender === g
                            ? "bg-brand-500/20 border-brand-500/40 text-brand-300"
                            : "border-[#2a2a35] bg-[#1a1a22] text-gray-500 hover:text-gray-300 hover:border-white/15"
                        )}>
                        {g}
                      </button>
                    ))}
                  </div>
                : <p className="text-sm text-white py-2.5">{saved.gender || <span className="text-gray-600">Not set</span>}</p>
              }
            </Field>
            <Field label="Phone Number">
              {editing
                ? <Input type="tel" value={data.phone} onChange={e => handleChange("phone", e.target.value)}
                    placeholder="e.g. +91 98765 43210" className={inputCls} />
                : <p className="text-sm text-white py-2.5">{saved.phone || <span className="text-gray-600">Not set</span>}</p>
              }
            </Field>
          </div>
        </Section>
      </motion.div>

      {/* ── Location ── */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Section title="Location" icon={MapPin} color="from-emerald-500/20 to-transparent">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Village / Town">
              {editing
                ? <Input value={data.village} onChange={e => handleChange("village", e.target.value)}
                    placeholder="e.g. Koramangala" className={inputCls} />
                : <p className="text-sm text-white py-2.5">{saved.village || <span className="text-gray-600">Not set</span>}</p>
              }
            </Field>
            <Field label="District">
              {editing
                ? <Input value={data.district} onChange={e => handleChange("district", e.target.value)}
                    placeholder="e.g. Bengaluru Urban" className={inputCls} />
                : <p className="text-sm text-white py-2.5">{saved.district || <span className="text-gray-600">Not set</span>}</p>
              }
            </Field>
          </div>
        </Section>
      </motion.div>

      {/* ── Medical Info ── */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
        <Section title="Medical Information" icon={Heart} color="from-rose-500/20 to-transparent">
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Blood Group">
                {editing
                  ? <div className="flex flex-wrap gap-2">
                      {BLOOD_GROUPS.map(bg => (
                        <button key={bg} onClick={() => handleChange("blood_group", bg)}
                          className={cn("px-3 h-9 rounded-xl border text-sm font-semibold transition-all",
                            data.blood_group === bg
                              ? "bg-red-500/20 border-red-500/40 text-red-300"
                              : "border-[#2a2a35] bg-[#1a1a22] text-gray-500 hover:text-gray-300 hover:border-white/15"
                          )}>
                          {bg}
                        </button>
                      ))}
                    </div>
                  : <p className="text-sm text-white py-2.5">
                      {saved.blood_group
                        ? <span className="text-red-400 font-semibold">{saved.blood_group}</span>
                        : <span className="text-gray-600">Not set</span>}
                    </p>
                }
              </Field>
              <Field label="Weight (kg)">
                {editing
                  ? <Input type="number" value={data.weight_kg} onChange={e => handleChange("weight_kg", e.target.value)}
                      placeholder="e.g. 58" className={inputCls} />
                  : <p className="text-sm text-white py-2.5">{saved.weight_kg ? `${saved.weight_kg} kg` : <span className="text-gray-600">Not set</span>}</p>
                }
              </Field>
            </div>

            {/* Pregnancy toggle */}
            <div className="flex items-center justify-between p-3.5 rounded-xl border border-white/[0.06] bg-white/[0.02]">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-pink-500/15 flex items-center justify-center">
                  <Baby className="w-4 h-4 text-pink-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-white">Currently Pregnant</p>
                  <p className="text-xs text-gray-500">Important for medication dosing</p>
                </div>
              </div>
              {editing ? (
                <button
                  onClick={() => handleChange("is_pregnant", !data.is_pregnant)}
                  className={cn("w-11 h-6 rounded-full transition-all relative",
                    data.is_pregnant ? "bg-pink-500" : "bg-white/10"
                  )}>
                  <span className={cn("absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all",
                    data.is_pregnant ? "left-[calc(100%-1.375rem)]" : "left-0.5"
                  )} />
                </button>
              ) : (
                <span className={cn("text-xs font-semibold px-2.5 py-1 rounded-full",
                  saved.is_pregnant ? "bg-pink-500/15 text-pink-400 border border-pink-500/20" : "bg-white/5 text-gray-500"
                )}>
                  {saved.is_pregnant ? "Yes" : "No"}
                </span>
              )}
            </div>

            <Field label="Medical History & Conditions">
              {editing
                ? <textarea
                    value={data.medical_history}
                    onChange={e => handleChange("medical_history", e.target.value)}
                    placeholder="e.g. Hypertension diagnosed 2022, Type 2 Diabetes, allergic to penicillin…"
                    rows={4}
                    className="w-full bg-[#1a1a22] border border-[#2a2a35] text-white placeholder:text-gray-600 rounded-xl p-3 text-sm resize-none focus:outline-none focus:border-brand-500/50 transition-colors"
                  />
                : <p className="text-sm text-gray-300 leading-relaxed py-2">
                    {saved.medical_history || <span className="text-gray-600">No medical history recorded</span>}
                  </p>
              }
            </Field>
          </div>
        </Section>
      </motion.div>

      {/* ── Privacy notice ── */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
        className="flex items-start gap-3 p-4 rounded-2xl border border-emerald-500/15 bg-emerald-500/5">
        <Shield className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
        <p className="text-xs text-gray-400 leading-relaxed">
          Your health data is <span className="text-emerald-400 font-medium">encrypted and private</span>.
          It is only shared with doctors you explicitly grant access to via your share code.
          Sahayak AI never sells or shares your data with third parties.
        </p>
      </motion.div>

    </div>
  )
}
