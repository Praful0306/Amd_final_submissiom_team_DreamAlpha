import { useEffect, useState, useRef, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"
import {
  Users, Plus, Search, Loader2, User, ChevronRight,
  Mic, MicOff, Upload, FileText, X, CheckCircle2,
  Sparkles, Volume2, RefreshCw,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { RiskBadge } from "@/components/shared/RiskBadge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  getMyPatients, registerPatient, extractFile, fillFormFromVoice,
  type Patient, type VoiceFormResult, type ExtractionResponse,
} from "@/lib/api"
import { useStore } from "@/store/useStore"
import { useVoice } from "@/hooks/useVoice"

// ── Form state ────────────────────────────────────────────────────────────────

const EMPTY_FORM = {
  name: "", age: "", gender: "Female", phone: "",
  village: "", district: "", blood_group: "",
  medical_history: "", is_pregnant: false,
}

type FormState = typeof EMPTY_FORM

// Fields that can be auto-filled
type AutoFilledField = keyof Omit<FormState, "is_pregnant" | "blood_group">

// ── Component ─────────────────────────────────────────────────────────────────

export default function AshaPatients() {
  const { user, lang } = useStore()
  const navigate = useNavigate()

  const [patients, setPatients] = useState<Patient[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [aiFilledFields, setAiFilledFields] = useState<Set<string>>(new Set())

  // Voice state
  const [voiceStep, setVoiceStep] = useState<"idle" | "recording" | "processing" | "done">("idle")
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const [voiceTranscript, setVoiceTranscript] = useState("")

  // Report upload state
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // MediaRecorder
  const mediaRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  useEffect(() => {
    getMyPatients()
      .then(setPatients)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // ── Voice helpers ────────────────────────────────────────────────────────────

  const startRecording = useCallback(async () => {
    setVoiceError(null)
    setVoiceTranscript("")
    chunksRef.current = []
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm" })
      mediaRef.current = mr
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        setVoiceStep("processing")
        try {
          const blob = new Blob(chunksRef.current, { type: "audio/webm" })
          const { transcribe } = await import("@/lib/api")
          const { text } = await transcribe(blob, lang)
          setVoiceTranscript(text)
          await applyVoiceFormFill(text)
        } catch (err) {
          setVoiceError(err instanceof Error ? err.message : "Transcription failed")
          setVoiceStep("idle")
        }
      }
      mr.start()
      setVoiceStep("recording")
    } catch (err) {
      setVoiceError("Microphone access denied. Please allow mic permission.")
      setVoiceStep("idle")
    }
  }, [lang])

  const stopRecording = useCallback(() => {
    if (mediaRef.current?.state === "recording") mediaRef.current.stop()
  }, [])

  async function applyVoiceFormFill(text: string) {
    try {
      const result: VoiceFormResult = await fillFormFromVoice(text)
      if (!result.success || !result.form) {
        setVoiceError("Could not extract details. Please try speaking again or fill manually.")
        setVoiceStep("idle")
        return
      }
      const { form: f } = result
      const newFields = new Set<string>()
      setForm(prev => {
        const next = { ...prev }
        if (f.patient_name) { next.name = f.patient_name; newFields.add("name") }
        if (f.age != null)  { next.age = String(f.age);   newFields.add("age") }
        if (f.gender) {
          const g = f.gender.charAt(0).toUpperCase() + f.gender.slice(1).toLowerCase()
          if (["Female","Male","Other"].includes(g)) { next.gender = g; newFields.add("gender") }
        }
        if (f.village)   { next.village = f.village;           newFields.add("village") }
        if (f.bp || f.sugar || f.hb || f.symptoms || f.diagnosis || f.medications) {
          const parts: string[] = []
          if (f.bp)          parts.push(`BP: ${f.bp}`)
          if (f.sugar)       parts.push(`Sugar: ${f.sugar} mg/dL`)
          if (f.hb)          parts.push(`Hb: ${f.hb} g/dL`)
          if (f.symptoms)    parts.push(f.symptoms)
          if (f.diagnosis)   parts.push(`Dx: ${f.diagnosis}`)
          if (f.medications) parts.push(f.medications)
          next.medical_history = parts.join(", ")
          newFields.add("medical_history")
        }
        return next
      })
      setAiFilledFields(prev => new Set([...prev, ...newFields]))
      setVoiceStep("done")
      toast.success(`AI filled ${newFields.size} field${newFields.size !== 1 ? "s" : ""} from voice`)
    } catch (err) {
      setVoiceError("AI processing failed. Please try again.")
      setVoiceStep("idle")
    }
  }

  // ── Report upload helpers ────────────────────────────────────────────────────

  async function handleFileUpload(file: File) {
    setUploadFile(file)
    setUploading(true)
    setUploadProgress(10)

    // Fake progress while uploading
    const timer = setInterval(() => {
      setUploadProgress(p => Math.min(p + 15, 85))
    }, 400)

    try {
      const result: ExtractionResponse = await extractFile(file)
      clearInterval(timer)
      setUploadProgress(100)

      const ext = (result.data ?? {}) as Record<string, unknown>
      const newFields = new Set<string>()

      setForm(prev => {
        const next = { ...prev }
        const str = (v: unknown) => (v != null && String(v).trim() !== "" ? String(v).trim() : null)

        const name = str(ext.patient_name ?? ext.name)
        if (name) { next.name = name; newFields.add("name") }

        const age = str(ext.age)
        if (age) { next.age = age; newFields.add("age") }

        const gender = str(ext.gender)
        if (gender) {
          const g = gender.charAt(0).toUpperCase() + gender.slice(1).toLowerCase()
          if (["Female","Male","Other"].includes(g)) { next.gender = g; newFields.add("gender") }
        }

        const village = str(ext.village ?? ext.address)
        if (village) { next.village = village; newFields.add("village") }

        const phone = str(ext.phone ?? ext.mobile)
        if (phone) { next.phone = phone; newFields.add("phone") }

        // Build medical history from vitals + clinical data
        const vitalParts: string[] = []
        if (ext.bp)         vitalParts.push(`BP: ${ext.bp}`)
        if (ext.blood_sugar ?? ext.sugar) vitalParts.push(`Sugar: ${ext.blood_sugar ?? ext.sugar} mg/dL`)
        if (ext.hemoglobin ?? ext.hb)     vitalParts.push(`Hb: ${ext.hemoglobin ?? ext.hb} g/dL`)
        if (ext.temperature ?? ext.temp)  vitalParts.push(`Temp: ${ext.temperature ?? ext.temp}°C`)
        if (ext.pulse ?? ext.hr)          vitalParts.push(`HR: ${ext.pulse ?? ext.hr} bpm`)
        if (ext.spo2)                      vitalParts.push(`SpO2: ${ext.spo2}%`)
        if (ext.symptoms)  vitalParts.push(String(ext.symptoms))
        if (ext.diagnosis) vitalParts.push(`Dx: ${ext.diagnosis}`)
        if (ext.medicines ?? ext.medications) vitalParts.push(String(ext.medicines ?? ext.medications))

        if (vitalParts.length > 0) {
          next.medical_history = vitalParts.join(", ")
          newFields.add("medical_history")
        }

        return next
      })

      setAiFilledFields(prev => new Set([...prev, ...newFields]))
      toast.success(`AI extracted ${newFields.size} field${newFields.size !== 1 ? "s" : ""} from report`)
    } catch (err) {
      clearInterval(timer)
      toast.error("Could not extract from report. Please fill manually.")
    } finally {
      setUploading(false)
      setTimeout(() => setUploadProgress(0), 1500)
    }
  }

  function onFileDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFileUpload(file)
  }

  // ── Registration ─────────────────────────────────────────────────────────────

  async function handleRegister() {
    if (!form.name || !form.age) { toast.error("Name and age are required"); return }
    if (!form.phone) { toast.error("Phone number is required"); return }
    setSaving(true)
    try {
      const p = await registerPatient({
        ...form,
        age: parseInt(form.age),
        asha_firebase_uid: user?.id?.toString(),
      })
      setPatients(prev => [p, ...prev])
      setOpen(false)
      resetDialog()
      toast.success(`${p.name} registered successfully!`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Registration failed")
    } finally {
      setSaving(false)
    }
  }

  function resetDialog() {
    setForm(EMPTY_FORM)
    setAiFilledFields(new Set())
    setVoiceStep("idle")
    setVoiceError(null)
    setVoiceTranscript("")
    setUploadFile(null)
    setUploadProgress(0)
  }

  function setField(field: keyof FormState, value: string | boolean) {
    setForm(f => ({ ...f, [field]: value }))
    // If user edits manually, remove AI highlight for that field
    if (typeof value === "string") {
      setAiFilledFields(prev => { const n = new Set(prev); n.delete(field); return n })
    }
  }

  const filtered = patients.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.village ?? "").toLowerCase().includes(search.toLowerCase())
  )

  const inputCls = (field: string) =>
    `bg-white/5 border text-white h-9 transition-colors ${
      aiFilledFields.has(field)
        ? "border-brand-500/60 bg-brand-500/5 shadow-[0_0_0_1px_rgba(234,88,12,0.2)]"
        : "border-white/10"
    }`

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">My Patients</h2>
          <p className="text-gray-500 text-sm mt-0.5">{patients.length} registered</p>
        </div>
        <Button className="gap-2 bg-brand-600 hover:bg-brand-700 text-white" onClick={() => setOpen(true)}>
          <Plus className="w-4 h-4" /> Register Patient
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or village…"
          className="pl-10 bg-[#1a1a22] border-[#2a2a35] text-white placeholder:text-gray-600 h-11"
        />
      </div>

      {/* Patient list */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 bg-white/5 rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-16 flex flex-col items-center gap-3 text-center">
          <Users className="w-12 h-12 text-gray-600" />
          <p className="text-white font-medium">No patients found</p>
          <p className="text-gray-500 text-sm">Register your first patient to get started</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((p, i) => (
            <motion.button
              key={p.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className="w-full flex items-center justify-between p-4 rounded-xl border border-[#2a2a35] bg-[#1a1a22] hover:border-brand-500/30 hover:bg-white/[0.02] transition-all text-left"
              onClick={() => navigate(`/asha/diagnose`)}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-brand-500/15 flex items-center justify-center shrink-0">
                  <User className="w-5 h-5 text-brand-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">
                    {p.name}
                    {p.is_pregnant && <span className="ml-2 text-pink-400 text-xs">Pregnant</span>}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {p.age}y · {p.gender} · {p.village ?? p.district ?? "—"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <RiskBadge level={p.risk_level ?? "LOW"} size="sm" />
                <ChevronRight className="w-4 h-4 text-gray-600" />
              </div>
            </motion.button>
          ))}
        </div>
      )}

      {/* ── Register Dialog ──────────────────────────────────────────────────── */}
      <Dialog open={open} onOpenChange={(v) => { if (!v) resetDialog(); setOpen(v) }}>
        <DialogContent className="bg-[#1a1a22] border-[#2a2a35] text-white max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">Register New Patient</DialogTitle>
          </DialogHeader>

          <div className="space-y-5 mt-1">

            {/* ── Voice Input Panel ──────────────────────────────────────── */}
            <div className="rounded-xl border border-dashed border-brand-500/40 bg-brand-500/5 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Volume2 className="w-4 h-4 text-brand-400" />
                <span className="text-sm font-semibold text-brand-300">Speak Patient Details</span>
                <span className="text-xs text-gray-500 ml-1">AI will auto-fill the form</span>
              </div>

              <p className="text-xs text-gray-500 mb-3">
                Example: <span className="text-gray-400 italic">"Priya Devi, 28 years, female, Rampur village. BP 140/90, haemoglobin 9.2, she has fever and anaemia."</span>
              </p>

              <div className="flex items-center gap-3">
                {/* Mic button */}
                <button
                  type="button"
                  onClick={voiceStep === "recording" ? stopRecording : startRecording}
                  disabled={voiceStep === "processing"}
                  className={`relative w-14 h-14 rounded-full flex items-center justify-center transition-all focus:outline-none ${
                    voiceStep === "recording"
                      ? "bg-red-500 shadow-lg shadow-red-500/40"
                      : voiceStep === "processing"
                      ? "bg-brand-600/50 cursor-not-allowed"
                      : voiceStep === "done"
                      ? "bg-green-600 shadow-green-600/30"
                      : "bg-brand-600 hover:bg-brand-500 shadow-lg shadow-brand-600/30"
                  }`}
                >
                  {voiceStep === "recording" && (
                    <motion.div
                      className="absolute inset-0 rounded-full border-2 border-red-400"
                      animate={{ scale: [1, 1.25, 1] }}
                      transition={{ repeat: Infinity, duration: 1.2 }}
                    />
                  )}
                  {voiceStep === "processing" ? (
                    <Loader2 className="w-6 h-6 text-white animate-spin" />
                  ) : voiceStep === "done" ? (
                    <CheckCircle2 className="w-6 h-6 text-white" />
                  ) : voiceStep === "recording" ? (
                    <MicOff className="w-6 h-6 text-white" />
                  ) : (
                    <Mic className="w-6 h-6 text-white" />
                  )}
                </button>

                <div className="flex-1">
                  {voiceStep === "idle" && (
                    <p className="text-sm text-gray-400">Tap mic to start speaking in Hindi, Kannada, or English</p>
                  )}
                  {voiceStep === "recording" && (
                    <div>
                      <p className="text-sm text-red-400 font-medium animate-pulse">Recording… Tap to stop</p>
                      <p className="text-xs text-gray-500 mt-0.5">Speak clearly — name, age, village, symptoms, vitals</p>
                    </div>
                  )}
                  {voiceStep === "processing" && (
                    <div>
                      <p className="text-sm text-brand-400 font-medium">AI processing…</p>
                      <p className="text-xs text-gray-500 mt-0.5">Transcribing and extracting patient details</p>
                    </div>
                  )}
                  {voiceStep === "done" && voiceTranscript && (
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Heard:</p>
                      <p className="text-sm text-gray-300 italic leading-snug line-clamp-2">"{voiceTranscript}"</p>
                      <button
                        type="button"
                        onClick={() => { setVoiceStep("idle"); setVoiceTranscript("") }}
                        className="text-xs text-brand-400 hover:text-brand-300 mt-1 flex items-center gap-1"
                      >
                        <RefreshCw className="w-3 h-3" /> Record again
                      </button>
                    </div>
                  )}
                  {voiceError && (
                    <p className="text-xs text-red-400 mt-1">{voiceError}</p>
                  )}
                </div>

                {aiFilledFields.size > 0 && (
                  <Badge className="bg-brand-500/20 text-brand-300 border-brand-500/30 text-xs whitespace-nowrap">
                    <Sparkles className="w-3 h-3 mr-1" />
                    {aiFilledFields.size} AI-filled
                  </Badge>
                )}
              </div>
            </div>

            {/* ── Report Upload Panel ────────────────────────────────────── */}
            <div
              className={`rounded-xl border border-dashed p-4 transition-all cursor-pointer ${
                dragOver
                  ? "border-brand-400 bg-brand-500/10"
                  : uploadFile
                  ? "border-green-500/40 bg-green-500/5"
                  : "border-white/10 bg-white/[0.02] hover:border-white/20"
              }`}
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onFileDrop}
              onClick={() => !uploading && fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".pdf,image/*"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f) }}
              />
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                  uploadFile ? "bg-green-500/20" : "bg-white/5"
                }`}>
                  {uploading ? (
                    <Loader2 className="w-5 h-5 text-brand-400 animate-spin" />
                  ) : uploadFile ? (
                    <FileText className="w-5 h-5 text-green-400" />
                  ) : (
                    <Upload className="w-5 h-5 text-gray-500" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  {uploadFile ? (
                    <div>
                      <p className="text-sm text-white font-medium truncate">{uploadFile.name}</p>
                      {uploading ? (
                        <div className="mt-1.5">
                          <Progress value={uploadProgress} className="h-1.5" />
                          <p className="text-xs text-gray-500 mt-1">AI extracting patient data…</p>
                        </div>
                      ) : (
                        <p className="text-xs text-green-400 mt-0.5">Extraction complete</p>
                      )}
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm text-gray-400 font-medium">Upload Patient Report (optional)</p>
                      <p className="text-xs text-gray-600 mt-0.5">PDF or image — AI will extract all fields automatically</p>
                    </div>
                  )}
                </div>
                {uploadFile && !uploading && (
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); setUploadFile(null); setUploadProgress(0) }}
                    className="p-1 rounded hover:bg-white/10 text-gray-500 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* ── Form Fields ────────────────────────────────────────────── */}
            <div className="space-y-1">
              <div className="flex items-center gap-2 mb-3">
                <div className="h-px flex-1 bg-white/5" />
                <span className="text-xs text-gray-600 px-2">Patient Details</span>
                <div className="h-px flex-1 bg-white/5" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Name */}
                <div>
                  <Label className="text-gray-400 text-xs mb-1.5 block">
                    Full Name *
                    {aiFilledFields.has("name") && <AiBadge />}
                  </Label>
                  <Input
                    value={form.name}
                    onChange={e => setField("name", e.target.value)}
                    className={inputCls("name")}
                    placeholder="Priya Devi"
                  />
                </div>

                {/* Age */}
                <div>
                  <Label className="text-gray-400 text-xs mb-1.5 block">
                    Age *
                    {aiFilledFields.has("age") && <AiBadge />}
                  </Label>
                  <Input
                    type="number"
                    value={form.age}
                    onChange={e => setField("age", e.target.value)}
                    className={inputCls("age")}
                    placeholder="32"
                  />
                </div>

                {/* Gender */}
                <div>
                  <Label className="text-gray-400 text-xs mb-1.5 block">
                    Gender
                    {aiFilledFields.has("gender") && <AiBadge />}
                  </Label>
                  <Select
                    value={form.gender}
                    onValueChange={v => setField("gender", v)}
                  >
                    <SelectTrigger className={inputCls("gender")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1a1a22] border-[#2a2a35]">
                      <SelectItem value="Female">Female</SelectItem>
                      <SelectItem value="Male">Male</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Phone */}
                <div>
                  <Label className="text-gray-400 text-xs mb-1.5 block">
                    Phone
                    {aiFilledFields.has("phone") && <AiBadge />}
                  </Label>
                  <Input
                    value={form.phone}
                    onChange={e => setField("phone", e.target.value)}
                    className={inputCls("phone")}
                    placeholder="+91 9876543210"
                  />
                </div>

                {/* Village */}
                <div>
                  <Label className="text-gray-400 text-xs mb-1.5 block">
                    Village
                    {aiFilledFields.has("village") && <AiBadge />}
                  </Label>
                  <Input
                    value={form.village}
                    onChange={e => setField("village", e.target.value)}
                    className={inputCls("village")}
                    placeholder="Rampur"
                  />
                </div>

                {/* District */}
                <div>
                  <Label className="text-gray-400 text-xs mb-1.5 block">
                    District
                    {aiFilledFields.has("district") && <AiBadge />}
                  </Label>
                  <Input
                    value={form.district}
                    onChange={e => setField("district", e.target.value)}
                    className={inputCls("district")}
                    placeholder="Varanasi"
                  />
                </div>

                {/* Blood Group */}
                <div>
                  <Label className="text-gray-400 text-xs mb-1.5 block">Blood Group</Label>
                  <Select value={form.blood_group} onValueChange={v => setField("blood_group", v)}>
                    <SelectTrigger className="bg-white/5 border-white/10 text-white h-9">
                      <SelectValue placeholder="Select…" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1a1a22] border-[#2a2a35]">
                      {["A+","A-","B+","B-","O+","O-","AB+","AB-"].map(g => (
                        <SelectItem key={g} value={g}>{g}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Pregnant */}
                <div className="flex items-end pb-2">
                  <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-400 hover:text-white">
                    <input
                      type="checkbox"
                      checked={form.is_pregnant}
                      onChange={e => setForm(f => ({ ...f, is_pregnant: e.target.checked }))}
                      className="w-4 h-4 rounded accent-brand-500"
                    />
                    Currently Pregnant
                  </label>
                </div>
              </div>

              {/* Medical History */}
              <div>
                <Label className="text-gray-400 text-xs mb-1.5 block">
                  Medical History / Vitals
                  {aiFilledFields.has("medical_history") && <AiBadge />}
                </Label>
                <Input
                  value={form.medical_history}
                  onChange={e => setField("medical_history", e.target.value)}
                  className={inputCls("medical_history")}
                  placeholder="Diabetes, BP 140/90, Hb 9.2, symptoms…"
                />
              </div>
            </div>

            {/* Register button */}
            <Button
              className="w-full h-11 bg-brand-600 hover:bg-brand-700 text-white font-semibold gap-2"
              onClick={handleRegister}
              disabled={saving || uploading}
            >
              {saving ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Registering…</>
              ) : (
                <><Plus className="w-4 h-4" /> Register Patient</>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── Tiny AI badge ─────────────────────────────────────────────────────────────

function AiBadge() {
  return (
    <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] text-brand-400 font-medium">
      <Sparkles className="w-2.5 h-2.5" />AI
    </span>
  )
}
