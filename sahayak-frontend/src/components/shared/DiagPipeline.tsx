import { motion, AnimatePresence } from "framer-motion"
import { Mic, FileText, Database, Brain, ShieldCheck, CheckCircle2 } from "lucide-react"
import { cn } from "@/lib/utils"

export type PipelineStep = "idle" | "listen" | "transcribe" | "rag" | "analyze" | "clinical" | "result"

interface DiagPipelineProps {
  currentStep: PipelineStep
  className?: string
}

const STEPS = [
  { id: "listen",     icon: Mic,          label: "Listen",        desc: "Recording voice" },
  { id: "transcribe", icon: FileText,      label: "Transcribe",    desc: "Converting speech" },
  { id: "rag",        icon: Database,      label: "RAG Search",    desc: "ICMR guidelines" },
  { id: "analyze",    icon: Brain,         label: "AI Analysis",   desc: "LLaMA 3.1 70B" },
  { id: "clinical",   icon: ShieldCheck,   label: "Clinical Check", desc: "ICMR protocols" },
  { id: "result",     icon: CheckCircle2,  label: "Result",        desc: "Diagnosis ready" },
] as const

const ORDER: PipelineStep[] = ["listen", "transcribe", "rag", "analyze", "clinical", "result"]

function stepIndex(step: PipelineStep) {
  return ORDER.indexOf(step)
}

export function DiagPipeline({ currentStep, className }: DiagPipelineProps) {
  const current = stepIndex(currentStep)

  return (
    <div className={cn("w-full", className)}>
      <div className="flex items-center justify-between gap-1 overflow-x-auto pb-2">
        {STEPS.map((step, i) => {
          const status =
            current < 0 ? "pending"
            : i < current ? "done"
            : i === current ? "active"
            : "pending"
          const Icon = step.icon

          return (
            <div key={step.id} className="flex items-center gap-1 flex-1 min-w-0">
              {/* Step */}
              <motion.div
                className={cn(
                  "flex flex-col items-center gap-1 flex-1 min-w-0",
                )}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.07 }}
              >
                <motion.div
                  className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors",
                    status === "done"    && "bg-green-500/20 border-green-500 text-green-400",
                    status === "active"  && "bg-brand-500/20 border-brand-500 text-brand-400",
                    status === "pending" && "bg-surface-card border-surface-border text-muted-foreground",
                  )}
                  animate={status === "active" ? { scale: [1, 1.08, 1] } : { scale: 1 }}
                  transition={{ repeat: Infinity, duration: 1.2 }}
                >
                  <Icon className="w-4 h-4" />
                </motion.div>
                <span className="text-[10px] font-medium text-center leading-tight text-muted-foreground hidden sm:block">
                  {step.label}
                </span>
                <AnimatePresence>
                  {status === "active" && (
                    <motion.span
                      className="text-[9px] text-brand-400 text-center hidden sm:block"
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    >
                      {step.desc}
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.div>

              {/* Connector line */}
              {i < STEPS.length - 1 && (
                <div className="h-0.5 w-4 flex-shrink-0 rounded-full overflow-hidden bg-surface-border">
                  <motion.div
                    className="h-full bg-green-500 origin-left"
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: i < current ? 1 : 0 }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
