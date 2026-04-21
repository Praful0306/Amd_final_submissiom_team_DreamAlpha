import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import { toast } from "sonner"
import { Search, User, ArrowRight, Loader2, Shield } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { RiskBadge } from "@/components/shared/RiskBadge"
import { accessPatient, getPatientProfile, type Patient } from "@/lib/api"

export default function AccessPatient() {
  const navigate   = useNavigate()
  const [code,     setCode]    = useState("")
  const [loading,  setLoading] = useState(false)
  const [patient,  setPatient] = useState<Patient | null>(null)

  async function handleAccess() {
    if (code.trim().length < 4) { toast.error("Enter a valid access code"); return }
    setLoading(true)
    try {
      const result = await accessPatient(code.trim())
      // Backend grants access and returns patient_id; fetch full profile
      const p = await getPatientProfile(result.patient_id)
      setPatient(p)
      toast.success(result.message ?? "Access granted")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Invalid or expired code")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6 max-w-xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Access Patient</h2>
        <p className="text-gray-500 mt-0.5">Enter the 8-character code provided by the patient</p>
      </div>

      <Card className="bg-[#1a1a22] border-[#2a2a35]">
        <CardContent className="p-6 space-y-5">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && handleAccess()}
              placeholder="ENTER CODE"
              maxLength={10}
              className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-gray-600 h-12 font-mono text-lg tracking-widest text-center uppercase focus:border-brand-500/50"
            />
          </div>

          <Button
            className="w-full h-11 bg-brand-600 hover:bg-brand-700 text-white font-semibold gap-2"
            onClick={handleAccess}
            disabled={loading || code.length < 4}
          >
            {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Looking up…</> : <><Shield className="w-4 h-4" /> Access Patient Records</>}
          </Button>

          <div className="flex items-center gap-2 text-xs text-gray-600 justify-center">
            <Shield className="w-3 h-3" />
            Patient-authorised, time-limited access only
          </div>
        </CardContent>
      </Card>

      <AnimatePresence>
        {patient && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <Card className="bg-[#1a1a22] border-green-500/30 bg-green-500/5">
              <CardContent className="p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-brand-500/20 flex items-center justify-center">
                      <User className="w-6 h-6 text-brand-400" />
                    </div>
                    <div>
                      <p className="text-lg font-bold text-white">{patient.name}</p>
                      <p className="text-sm text-gray-400">{patient.age}y · {patient.gender}</p>
                      <p className="text-sm text-gray-500 mt-0.5">{patient.village ?? patient.district ?? "—"}</p>
                    </div>
                  </div>
                  <RiskBadge level={patient.risk_level ?? "LOW"} />
                </div>

                {patient.medical_history && (
                  <div className="mt-4 p-3 bg-white/5 rounded-xl border border-white/8">
                    <p className="text-xs text-gray-500 mb-1">Medical History</p>
                    <p className="text-sm text-gray-300">{patient.medical_history}</p>
                  </div>
                )}

                <Button
                  className="w-full mt-5 gap-2 bg-green-600 hover:bg-green-700 text-white"
                  onClick={() => navigate(`/doctor/patient/${patient.id}`)}
                >
                  View Full Records <ArrowRight className="w-4 h-4" />
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
