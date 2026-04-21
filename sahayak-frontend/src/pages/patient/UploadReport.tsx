import { useState, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import { useDropzone } from "react-dropzone"
import { toast } from "sonner"
import { Upload, FileText, Image, X, CheckCircle2, Loader2, Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { extractFile, saveReport, resolvePatientId } from "@/lib/api"
import { useStore } from "@/store/useStore"

interface ExtractedData {
  bp_systolic?: number; bp_diastolic?: number
  heart_rate?: number; spo2?: number; temperature?: number
  blood_sugar_fasting?: number; blood_sugar_pp?: number
  hemoglobin?: number; creatinine?: number; weight_kg?: number
  diagnosis?: string; notes?: string
}

export default function UploadReport() {
  const { user } = useStore()
  const navigate = useNavigate()
  const [file,      setFile]      = useState<File | null>(null)
  const [extracting, setExtracting] = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [extracted, setExtracted] = useState<ExtractedData>({})
  const [step,      setStep]      = useState<"upload" | "review" | "done">("upload")

  const onDrop = useCallback((accepted: File[]) => {
    const f = accepted[0]
    if (!f) return
    const okTypes = ["image/jpeg","image/png","image/webp","application/pdf"]
    if (!okTypes.includes(f.type)) { toast.error("Please upload a JPEG, PNG, WebP or PDF file"); return }
    setFile(f)
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/*": [], "application/pdf": [] },
    maxSize: 10 * 1024 * 1024,
    multiple: false,
  })

  async function handleExtract() {
    if (!file) return
    setExtracting(true)
    try {
      const res = await extractFile(file)
      // Backend returns {success, data: {...}, fields_filled, ...}
      // data has short field names: bp, hr, temp, spo2, hb, sugar, weight, etc.
      const raw = (res.data ?? res) as Record<string, unknown>

      /** Safely extract a number from any format: "78", "78 bpm", 78, null */
      function num(v: unknown): number | undefined {
        if (v == null || v === "" || v === "null") return undefined
        const n = parseFloat(String(v).replace(/[^0-9.]/g, ""))
        return isNaN(n) ? undefined : n
      }

      // Parse BP string "120/80" or "120" → systolic/diastolic
      const bpStr = String(raw.bp ?? raw.bp_systolic ?? "")
      const bpParts = bpStr.split("/")
      const bpSys = num(bpParts[0]) ?? num(raw.bp_systolic)
      const bpDia = num(bpParts[1]) ?? num(raw.bp_diastolic)

      const data: ExtractedData = {
        bp_systolic:         bpSys,
        bp_diastolic:        bpDia,
        heart_rate:          num(raw.heart_rate ?? raw.hr ?? raw.pulse),
        spo2:                num(raw.spo2 ?? raw.oxygen ?? raw.o2_sat),
        temperature:         num(raw.temperature ?? raw.temp),
        blood_sugar_fasting: num(raw.blood_sugar_fasting ?? raw.sugar ?? raw.glucose ?? raw.fbs ?? raw.rbs),
        blood_sugar_pp:      num(raw.blood_sugar_pp ?? raw.sugar_post ?? raw.pp),
        hemoglobin:          num(raw.hemoglobin ?? raw.hb ?? raw.haemoglobin),
        creatinine:          num(raw.creatinine),
        weight_kg:           num(raw.weight_kg ?? raw.weight),
        diagnosis:           (raw.diagnosis || raw.report_type || null) as string | undefined,
        notes:               (raw.notes || raw.ai_summary || raw.symptoms || null) as string | undefined,
      }

      // Remove undefined entries so input fields stay empty (placeholder shows)
      Object.keys(data).forEach((k) => {
        if ((data as Record<string, unknown>)[k] == null) delete (data as Record<string, unknown>)[k]
      })

      setExtracted(data)
      setStep("review")
      const vitalsCount = [data.bp_systolic, data.heart_rate, data.spo2, data.temperature, data.blood_sugar_fasting, data.hemoglobin].filter(Boolean).length
      const filled = res.fields_filled ?? Object.keys(data).length
      toast.success(`${filled} fields extracted (${vitalsCount} vitals) — review before saving`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Extraction failed")
    } finally {
      setExtracting(false)
    }
  }

  async function handleSave() {
    if (!user) return
    setSaving(true)
    try {
      const patient_id = await resolvePatientId(user)

      // Map frontend field names → backend SaveFullReportRequest field names
      const bp = extracted.bp_systolic
        ? extracted.bp_diastolic
          ? `${extracted.bp_systolic}/${extracted.bp_diastolic}`
          : String(extracted.bp_systolic)
        : undefined

      await saveReport({
        patient_id,
        bp,
        hr:            extracted.heart_rate   != null ? String(extracted.heart_rate)           : undefined,
        temp:          extracted.temperature  != null ? String(extracted.temperature)           : undefined,
        spo2:          extracted.spo2         != null ? String(extracted.spo2)                  : undefined,
        weight_kg:     extracted.weight_kg    != null ? String(extracted.weight_kg)             : undefined,
        sugar_fasting: extracted.blood_sugar_fasting != null ? String(extracted.blood_sugar_fasting) : undefined,
        sugar_post:    extracted.blood_sugar_pp      != null ? String(extracted.blood_sugar_pp)       : undefined,
        hemoglobin:    extracted.hemoglobin   != null ? String(extracted.hemoglobin)            : undefined,
        creatinine:    extracted.creatinine   != null ? String(extracted.creatinine)            : undefined,
        diagnosis:     extracted.diagnosis    || undefined,
        notes:         extracted.notes        || undefined,
        is_ai_extracted: 1,
        report_type:   "lab_report",
      })
      setStep("done")
      toast.success("Report saved! Dashboard updated.")
      // Flag so Dashboard/Reports know to refetch
      sessionStorage.setItem("sahayak_report_saved", Date.now().toString())
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  function reset() {
    setFile(null)
    setExtracted({})
    setStep("upload")
  }

  const FIELDS: { key: keyof ExtractedData; label: string; unit?: string }[] = [
    { key: "bp_systolic",          label: "BP Systolic",       unit: "mmHg" },
    { key: "bp_diastolic",         label: "BP Diastolic",      unit: "mmHg" },
    { key: "heart_rate",           label: "Heart Rate",        unit: "bpm"  },
    { key: "spo2",                 label: "SpO₂",             unit: "%"    },
    { key: "temperature",          label: "Temperature",       unit: "°C"  },
    { key: "blood_sugar_fasting",  label: "Blood Sugar (Fasting)", unit: "mg/dL" },
    { key: "blood_sugar_pp",       label: "Blood Sugar (PP)",  unit: "mg/dL" },
    { key: "hemoglobin",           label: "Hemoglobin",        unit: "g/dL" },
    { key: "creatinine",           label: "Creatinine",        unit: "mg/dL" },
    { key: "weight_kg",            label: "Weight",            unit: "kg"  },
  ]

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Upload Medical Report</h2>
        <p className="text-gray-500 mt-0.5">AI extracts values from your lab report automatically</p>
      </div>

      <AnimatePresence mode="wait">

        {/* ── Step 1: Upload ──────────────────────────────────────────────────── */}
        {step === "upload" && (
          <motion.div key="upload" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <Card className="bg-[#1a1a22] border-[#2a2a35]">
              <CardContent className="p-6">
                <div
                  {...getRootProps()}
                  className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all ${
                    isDragActive
                      ? "border-brand-500 bg-brand-500/5"
                      : "border-white/10 hover:border-brand-500/50 hover:bg-white/[0.02]"
                  }`}
                >
                  <input {...getInputProps()} />
                  <div className="flex flex-col items-center gap-3">
                    <Upload className="w-10 h-10 text-gray-500" />
                    <div>
                      <p className="font-semibold text-white">
                        {isDragActive ? "Drop it here!" : "Drag & drop your report"}
                      </p>
                      <p className="text-sm text-gray-500 mt-1">JPEG, PNG, WebP, PDF — max 10 MB</p>
                    </div>
                    <Button
                      variant="outline"
                      className="mt-2 border-white/15 hover:bg-white/5 text-gray-300"
                    >
                      Browse Files
                    </Button>
                  </div>
                </div>

                {/* File preview */}
                {file && (
                  <div className="mt-4 flex items-center gap-3 bg-white/5 rounded-xl p-3 border border-white/10">
                    {file.type.startsWith("image/") ? (
                      <Image className="w-5 h-5 text-blue-400 shrink-0" />
                    ) : (
                      <FileText className="w-5 h-5 text-red-400 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{file.name}</p>
                      <p className="text-xs text-gray-500">{(file.size / 1024).toFixed(0)} KB</p>
                    </div>
                    <button onClick={() => setFile(null)} className="text-gray-500 hover:text-white">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}

                <Button
                  className="w-full mt-5 h-11 bg-brand-600 hover:bg-brand-700 text-white font-semibold"
                  disabled={!file || extracting}
                  onClick={handleExtract}
                >
                  {extracting ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Extracting with AI…</>
                  ) : (
                    "Extract Values with AI"
                  )}
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* ── Step 2: Review ──────────────────────────────────────────────────── */}
        {step === "review" && (
          <motion.div key="review" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <Card className="bg-[#1a1a22] border-[#2a2a35]">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold text-white">Review Extracted Values</CardTitle>
                <p className="text-xs text-gray-500">Edit any incorrect values before saving</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  {FIELDS.map(({ key, label, unit }) => (
                    <div key={key}>
                      <Label className="text-gray-400 text-xs mb-1.5 block">
                        {label} {unit && <span className="text-gray-600">({unit})</span>}
                      </Label>
                      <Input
                        type="number"
                        value={extracted[key] as number ?? ""}
                        onChange={(e) =>
                          setExtracted((prev) => ({
                            ...prev,
                            [key]: e.target.value ? parseFloat(e.target.value) : undefined,
                          }))
                        }
                        className="bg-white/5 border-white/10 text-white h-9"
                        placeholder="—"
                      />
                    </div>
                  ))}
                </div>

                <Separator className="bg-white/5" />

                {/* Notes / Diagnosis */}
                <div>
                  <Label className="text-gray-400 text-xs mb-1.5 block">Diagnosis / Notes</Label>
                  <Input
                    value={extracted.diagnosis ?? ""}
                    onChange={(e) => setExtracted((p) => ({ ...p, diagnosis: e.target.value }))}
                    className="bg-white/5 border-white/10 text-white h-9"
                    placeholder="As noted in the report…"
                  />
                </div>

                <div className="flex gap-3">
                  <Button variant="outline" className="border-white/10 text-gray-400 hover:text-white" onClick={reset}>
                    Upload another
                  </Button>
                  <Button
                    className="flex-1 h-10 bg-green-600 hover:bg-green-700 text-white font-semibold gap-2"
                    onClick={handleSave}
                    disabled={saving}
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save to Records
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* ── Step 3: Done ────────────────────────────────────────────────────── */}
        {step === "done" && (
          <motion.div key="done" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
            <Card className="bg-[#1a1a22] border-[#2a2a35]">
              <CardContent className="p-12 flex flex-col items-center gap-4 text-center">
                <CheckCircle2 className="w-16 h-16 text-green-500" />
                <h3 className="text-xl font-bold text-white">Report Saved!</h3>
                <p className="text-gray-400">Your medical report has been added to your records.</p>
                <div className="flex gap-3 mt-2">
                  <Button variant="outline" className="border-white/10 text-gray-400 hover:text-white" onClick={reset}>
                    Upload Another
                  </Button>
                  <Button className="bg-brand-600 hover:bg-brand-700 text-white" onClick={() => navigate("/patient/reports")}>
                    View Reports
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  )
}
