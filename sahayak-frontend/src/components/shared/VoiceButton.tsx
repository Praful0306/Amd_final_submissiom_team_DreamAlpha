import { motion, AnimatePresence } from "framer-motion"
import { Mic, Square, Loader2, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { useVoice, type VoiceState } from "@/hooks/useVoice"

interface VoiceButtonProps {
  onResult: (text: string) => void
  compact?: boolean
  className?: string
}

const LABELS: Record<VoiceState, string> = {
  idle:       "Tap to speak",
  recording:  "Recording… tap to stop",
  processing: "Transcribing…",
  done:       "Done — tap to record again",
  error:      "Tap to try again",
}

export function VoiceButton({ onResult, compact = false, className }: VoiceButtonProps) {
  const { state, error, start, stop, reset } = useVoice(onResult)

  function handleClick() {
    if (state === "recording")                                   stop()
    else if (state === "idle" || state === "done")               start()
    else if (state === "error")                                  { reset(); start() }
  }

  const isRecording  = state === "recording"
  const isProcessing = state === "processing"
  const isError      = state === "error"
  const size     = compact ? "w-12 h-12" : "w-20 h-20"
  const iconSize = compact ? "w-5 h-5"   : "w-8 h-8"

  return (
    <div className={cn("flex flex-col items-center gap-3", className)}>
      {/* Outer pulse ring */}
      <div className="relative flex items-center justify-center">
        <AnimatePresence>
          {isRecording && (
            <>
              {[1, 2].map((ring) => (
                <motion.div
                  key={ring}
                  className="absolute rounded-full bg-brand-500/20"
                  style={{ width: compact ? 64 : 110, height: compact ? 64 : 110 }}
                  initial={{ opacity: 0.6, scale: 0.8 }}
                  animate={{ opacity: 0, scale: 1.5 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 1.8, delay: ring * 0.4, repeat: Infinity }}
                />
              ))}
            </>
          )}
        </AnimatePresence>

        <motion.button
          onClick={handleClick}
          disabled={isProcessing}
          whileTap={{ scale: 0.93 }}
          className={cn(
            "relative z-10 rounded-full flex items-center justify-center border-2 transition-colors",
            size,
            isRecording
              ? "bg-red-500/20 border-red-500 text-red-400"
              : isProcessing
              ? "bg-brand-500/10 border-brand-500/50 text-brand-400 cursor-not-allowed"
              : isError
              ? "bg-red-500/10 border-red-500/50 text-red-400 hover:border-red-500"
              : "bg-brand-500/15 border-brand-500 text-brand-400 hover:bg-brand-500/25"
          )}
        >
          {isProcessing ? (
            <Loader2 className={cn(iconSize, "animate-spin")} />
          ) : isRecording ? (
            <Square className={iconSize} />
          ) : isError ? (
            <AlertCircle className={iconSize} />
          ) : (
            <Mic className={iconSize} />
          )}
        </motion.button>
      </div>

      {!compact && (
        <div className="text-center max-w-48">
          <p className={cn("text-sm text-center", isError ? "text-red-400" : "text-muted-foreground")}>
            {LABELS[state]}
          </p>
          {isError && error && (
            <p className="text-xs text-red-400/70 mt-1 leading-snug">{error}</p>
          )}
        </div>
      )}
    </div>
  )
}
