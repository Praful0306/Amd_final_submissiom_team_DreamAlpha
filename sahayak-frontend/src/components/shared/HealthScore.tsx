import { useEffect, useRef } from "react"
import { motion, useMotionValue, useTransform, animate } from "framer-motion"
import { cn } from "@/lib/utils"

interface HealthScoreProps {
  score: number   // 0-100
  size?: number   // px
  className?: string
}

function scoreColor(score: number) {
  if (score >= 80) return "#22c55e"
  if (score >= 60) return "#eab308"
  if (score >= 40) return "#f97316"
  return "#ef4444"
}

function scoreLabel(score: number) {
  if (score >= 80) return "Excellent"
  if (score >= 60) return "Good"
  if (score >= 40) return "Fair"
  return "Poor"
}

export function HealthScore({ score, size = 120, className }: HealthScoreProps) {
  const radius  = (size - 16) / 2
  const circumference = 2 * Math.PI * radius
  const motionScore = useMotionValue(0)
  const displayScore = useRef<SVGTextElement>(null)
  const dashOffset = useTransform(motionScore, (v) =>
    circumference - (v / 100) * circumference
  )

  useEffect(() => {
    const controls = animate(motionScore, score, { duration: 1.4, ease: "easeOut" })
    const unsub = motionScore.on("change", (v) => {
      if (displayScore.current) displayScore.current.textContent = Math.round(v).toString()
    })
    return () => { controls.stop(); unsub() }
  }, [score, motionScore])

  const color = scoreColor(score)

  return (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      <svg width={size} height={size} className="-rotate-90">
        {/* Track */}
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke="#2a2a35" strokeWidth={8}
        />
        {/* Progress */}
        <motion.circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke={color} strokeWidth={8}
          strokeLinecap="round"
          strokeDasharray={circumference}
          style={{ strokeDashoffset: dashOffset }}
        />
        {/* Score text — rotated back */}
        <text
          ref={displayScore}
          x={size / 2} y={size / 2}
          textAnchor="middle" dominantBaseline="central"
          fill={color}
          fontSize={size * 0.22}
          fontWeight={700}
          fontFamily="JetBrains Mono, monospace"
          transform={`rotate(90, ${size / 2}, ${size / 2})`}
        >
          0
        </text>
      </svg>
      <span className="text-sm font-medium" style={{ color }}>
        {scoreLabel(score)}
      </span>
    </div>
  )
}
