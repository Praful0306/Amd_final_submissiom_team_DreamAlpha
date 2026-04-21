/**
 * Sahayak AI — VAPI Voice Call Button (via Make.com)
 *
 * Architecture:
 *   Click → POST Make.com webhook → Make.com calls VAPI API → VAPI dials real phone
 *
 * Make.com scenario:
 *   Webhook → HTTP Request (POST api.vapi.ai/call/phone) → SMS confirmation
 *
 * Required env: VITE_MAKECOM_VAPI_WEBHOOK
 * Optional env: VITE_MAKECOM_VAPI_DOCTOR_WEBHOOK (for ASHA→Doctor bridge)
 */

import { useState } from "react"
import { Phone, Loader2, CheckCircle, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { motion, AnimatePresence } from "framer-motion"
import { triggerVapiCall } from "@/lib/api"

export type VAPILanguage = "kn-IN" | "hi-IN" | "en-US"
export type VAPICallType = "patient_ai" | "asha_doctor_bridge" | "asha_ai_help"

const LANG_LABELS: Record<VAPILanguage, string> = {
  "kn-IN": "ಕನ್ನಡ",
  "hi-IN": "हिन्दी",
  "en-US": "English",
}

interface VAPICallButtonProps {
  /** Name shown in VAPI call context */
  patientName: string
  /** Patient phone number for outbound call (optional — shows browser fallback if missing) */
  patientPhone?: string
  patientId?: number | string | null
  /** Clinical context passed to VAPI system prompt */
  context?: string
  /** Language for AI voice + transcription */
  language?: VAPILanguage
  /** Call routing type */
  callType?: VAPICallType
  /** Doctor phone for ASHA→Doctor bridge */
  doctorPhone?: string
  /** Compact icon-only mode */
  compact?: boolean
  onCallTriggered?: () => void
}

type CallState = "idle" | "sending" | "triggered" | "error"

export function VAPICallButton({
  patientName,
  patientPhone,
  patientId,
  context,
  language = "hi-IN",
  callType = "patient_ai",
  doctorPhone,
  compact = false,
  onCallTriggered,
}: VAPICallButtonProps) {
  const [state,   setState]   = useState<CallState>("idle")
  const [errMsg,  setErrMsg]  = useState("")

  const webhookUrl = callType === "asha_doctor_bridge"
    ? (import.meta.env.VITE_MAKECOM_VAPI_DOCTOR_WEBHOOK as string | undefined)
    : (import.meta.env.VITE_MAKECOM_VAPI_WEBHOOK as string | undefined)

  const langCode = language.startsWith("kn") ? "kn" : language.startsWith("hi") ? "hi" : "en"
  const canUseBackendCall = callType === "patient_ai" && Boolean(patientPhone || patientId)
  const missingConfigMessage = callType === "asha_doctor_bridge"
    ? "Add VITE_MAKECOM_VAPI_DOCTOR_WEBHOOK to .env"
    : "Add VITE_MAKECOM_VAPI_WEBHOOK to .env"

  const handleCall = async () => {
    setState("sending")
    try {
      if (canUseBackendCall) {
        const res = await triggerVapiCall({
          patient_name: patientName,
          patient_phone: patientPhone,
          patient_id: patientId,
          call_type: "followup",
          lang: langCode,
          query: context ?? "",
        })

        if (!res.success) {
          throw new Error(res.message || res.error || "VAPI call failed")
        }
      } else {
        if (!webhookUrl) {
          throw new Error(missingConfigMessage)
        }

        const response = await fetch(webhookUrl, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            patientName,
            patientPhone: patientPhone ?? null,
            patientId: patientId ?? null,
            doctorPhone: doctorPhone ?? null,
            language,
            callType,
            context: context ?? "",
            timestamp: new Date().toISOString(),
            source: "sahayak-ai",
          }),
        })

        if (!response.ok) {
          throw new Error(`Call service returned HTTP ${response.status}`)
        }
      }

      setErrMsg("")
      setState("triggered")
      onCallTriggered?.()
      setTimeout(() => setState("idle"), 6000)
    } catch (err) {
      setState("error")
      setErrMsg(err instanceof Error ? err.message : "Call service unreachable")
      setTimeout(() => setState("idle"), 4000)
    }
  }

  // No webhook configured — show setup hint
  if (!canUseBackendCall && !webhookUrl) {
    return (
      <Button
        variant="outline"
        size={compact ? "sm" : "default"}
        className="border-dashed border-gray-600/50 text-gray-600 gap-2 cursor-default"
        onClick={() => {
          setErrMsg(missingConfigMessage.replace(".env", ".env.local"))
          setState("error")
          setTimeout(() => setState("idle"), 4000)
        }}
      >
        <Phone className="w-3.5 h-3.5" />
        {!compact && (
          <span>
            Voice Call{" "}
            <span className="text-[9px] opacity-50 ml-0.5">(Add VAPI key)</span>
          </span>
        )}
        {/* Error tooltip */}
        <AnimatePresence>
          {state === "error" && (
            <motion.span
              initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="absolute top-full mt-1 left-0 text-[10px] bg-red-900/90 text-red-300 px-2 py-1 rounded-lg whitespace-nowrap z-10 border border-red-500/30"
            >
              {errMsg}
            </motion.span>
          )}
        </AnimatePresence>
      </Button>
    )
  }

  return (
    <div className="relative inline-flex flex-col items-start gap-1">
      <AnimatePresence mode="wait">
        {state === "idle" && (
          <motion.div key="idle" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}>
            <Button
              size={compact ? "sm" : "default"}
              onClick={handleCall}
              className="bg-green-600 hover:bg-green-700 text-white gap-2 font-medium"
            >
              <Phone className="w-3.5 h-3.5" />
              {!compact && (
                <>
                  AI Call
                  <span className="text-[10px] opacity-70 ml-0.5 hidden sm:inline">
                    ({LANG_LABELS[language]})
                  </span>
                </>
              )}
            </Button>
          </motion.div>
        )}

        {state === "sending" && (
          <motion.div key="sending" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Button size={compact ? "sm" : "default"} disabled className="bg-yellow-600/60 text-white gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              {!compact && "Dialing..."}
            </Button>
          </motion.div>
        )}

        {state === "triggered" && (
          <motion.div
            key="triggered"
            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
          >
            <Button size={compact ? "sm" : "default"} disabled className="bg-green-700/60 text-white gap-2">
              <CheckCircle className="w-3.5 h-3.5" />
              {!compact && (patientPhone ? `Calling ${patientPhone}…` : "Call triggered!")}
            </Button>
          </motion.div>
        )}

        {state === "error" && (
          <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Button
              size={compact ? "sm" : "default"}
              variant="outline"
              className="border-red-500/40 text-red-400 gap-2"
              onClick={() => setState("idle")}
            >
              <X className="w-3.5 h-3.5" />
              {!compact && errMsg}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Success sub-label */}
      <AnimatePresence>
        {state === "triggered" && !compact && (
          <motion.p
            initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="text-[10px] text-green-500 pl-1"
          >
            VAPI call initiated via Make.com ✓
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  )
}
