import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { toast } from "sonner"
import { Send, RotateCcw, Download, Volume2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { RiskBadge } from "@/components/shared/RiskBadge"
import { DiagPipeline, type PipelineStep } from "@/components/shared/DiagPipeline"
import { VoiceButton } from "@/components/shared/VoiceButton"
import { diagnose, tts, type DiagnosisResult } from "@/lib/api"
import { useStore } from "@/store/useStore"
import { AlertCircle, CheckCircle2, Pill, Clock, Users } from "lucide-react"

export default function PatientDiagnosis() {
  const { user, lang } = useStore()
  const [symptoms,  setSymptoms]  = useState("")
  const [step,      setStep]      = useState<PipelineStep>("idle")
  const [result,    setResult]    = useState<DiagnosisResult | null>(null)
  const [speaking,  setSpeaking]  = useState(false)

  async function handleDiagnose() {
    if (!symptoms.trim()) { toast.error("Please describe your symptoms"); return }
    setStep("listen")
    setResult(null)
    try {
      setStep("transcribe")
      await new Promise((r) => setTimeout(r, 300))
      setStep("rag")
      await new Promise((r) => setTimeout(r, 300))
      setStep("analyze")
      const res = await diagnose({
        symptoms,
        patient_id: user?.id,
        patient_name: user?.name,
        lang,
      })
      setStep("clinical")
      await new Promise((r) => setTimeout(r, 200))
      setStep("result")
      setResult(res)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Diagnosis failed")
      setStep("idle")
    }
  }

  async function handleSpeak() {
    if (!result?.clinical_summary) return
    setSpeaking(true)
    try {
      const res = await tts(result.clinical_summary, lang)
      const audio = new Audio(res.audio_url)
      audio.onended = () => setSpeaking(false)
      audio.play()
    } catch {
      setSpeaking(false)
      toast.error("Text-to-speech failed")
    }
  }

  function reset() {
    setSymptoms("")
    setResult(null)
    setStep("idle")
  }

  const isLoading = step !== "idle" && step !== "result"

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">AI Diagnosis</h2>
        <p className="text-gray-500 mt-0.5">Describe your symptoms — voice or text</p>
      </div>

      {/* Input area */}
      <Card className="bg-[#1a1a22] border-[#2a2a35]">
        <CardContent className="p-6 space-y-5">
          {/* Voice button */}
          <div className="flex justify-center">
            <VoiceButton onResult={(text) => setSymptoms((s) => s ? s + " " + text : text)} />
          </div>

          <Textarea
            value={symptoms}
            onChange={(e) => setSymptoms(e.target.value)}
            placeholder="Describe symptoms in detail, e.g. 'I have had fever for 3 days, headache, body aches and joint pain…'"
            className="bg-white/5 border-white/10 text-white placeholder:text-gray-600 min-h-[120px] resize-none focus:border-brand-500/50"
            disabled={isLoading}
          />

          <div className="flex gap-3">
            <Button
              className="flex-1 h-11 bg-brand-600 hover:bg-brand-700 text-white font-semibold"
              onClick={handleDiagnose}
              disabled={isLoading || !symptoms.trim()}
            >
              <Send className="w-4 h-4 mr-2" />
              {isLoading ? "Analysing…" : "Get Diagnosis"}
            </Button>
            {result && (
              <Button variant="outline" className="border-white/10 text-gray-400 hover:text-white" onClick={reset}>
                <RotateCcw className="w-4 h-4" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Pipeline */}
      {step !== "idle" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <DiagPipeline currentStep={step} />
        </motion.div>
      )}

      {/* Result */}
      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <Card className="bg-[#1a1a22] border-[#2a2a35]">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg font-bold text-white">
                    {result.disease_name ?? result.diagnosis ?? "Diagnosis Result"}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <RiskBadge level={result.risk_level} />
                    {result.confidence_pct != null && (
                      <span className="text-xs text-gray-500 bg-white/5 px-2 py-0.5 rounded-full border border-white/10">
                        {result.confidence_pct}% confidence
                      </span>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* Summary */}
                {result.clinical_summary && (
                  <div className="bg-white/[0.03] rounded-xl p-4 border border-white/8">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Clinical Summary</span>
                      <Button
                        variant="ghost" size="sm"
                        className="h-7 text-xs text-gray-500 hover:text-white gap-1.5"
                        onClick={handleSpeak}
                        disabled={speaking}
                      >
                        <Volume2 className={`w-3 h-3 ${speaking ? "text-brand-400 animate-pulse" : ""}`} />
                        {speaking ? "Speaking…" : "Listen"}
                      </Button>
                    </div>
                    <p className="text-sm text-gray-300 leading-relaxed">{result.clinical_summary}</p>
                  </div>
                )}

                <div className="grid sm:grid-cols-2 gap-4">
                  {/* Recommendations */}
                  {result.recommendations?.length ? (
                    <div>
                      <div className="flex items-center gap-1.5 mb-2.5">
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                        <span className="text-sm font-semibold text-white">Recommendations</span>
                      </div>
                      <ul className="space-y-1.5">
                        {result.recommendations.map((r, i) => (
                          <li key={i} className="text-sm text-gray-400 flex gap-2">
                            <span className="text-green-500 shrink-0">•</span>{r}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {/* Medications */}
                  {result.medications_suggested?.length ? (
                    <div>
                      <div className="flex items-center gap-1.5 mb-2.5">
                        <Pill className="w-4 h-4 text-blue-400" />
                        <span className="text-sm font-semibold text-white">Possible Medications</span>
                      </div>
                      <ul className="space-y-1.5">
                        {result.medications_suggested.map((m, i) => (
                          <li key={i} className="text-sm text-gray-400 flex gap-2">
                            <span className="text-blue-400 shrink-0">•</span>{m}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>

                {/* Warning signs */}
                {result.warning_signs?.length ? (
                  <div className="bg-red-500/10 rounded-xl p-4 border border-red-500/20">
                    <div className="flex items-center gap-1.5 mb-2.5">
                      <AlertCircle className="w-4 h-4 text-red-400" />
                      <span className="text-sm font-semibold text-red-300">Warning Signs</span>
                    </div>
                    <ul className="space-y-1.5">
                      {result.warning_signs.map((w, i) => (
                        <li key={i} className="text-sm text-red-300/80 flex gap-2">
                          <span className="shrink-0">⚠</span>{w}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <Separator className="bg-white/5" />

                {/* Footer meta */}
                <div className="flex flex-wrap gap-4 text-xs text-gray-500">
                  {result.followup_days != null && (
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      Follow up in {result.followup_days} days
                    </span>
                  )}
                  {result.community_alert && (
                    <span className="flex items-center gap-1 text-orange-400">
                      <Users className="w-3.5 h-3.5" />
                      {result.community_alert}
                    </span>
                  )}
                  {result.sources?.length ? (
                    <span>Sources: {result.sources.join(", ")}</span>
                  ) : null}
                </div>

                <Button
                  variant="outline"
                  className="w-full border-white/10 text-gray-400 hover:text-white gap-2"
                >
                  <Download className="w-4 h-4" /> Save to Records
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
