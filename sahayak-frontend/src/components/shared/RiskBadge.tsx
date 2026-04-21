import { cn } from "@/lib/utils"
import { AlertTriangle, AlertCircle, Info, CheckCircle } from "lucide-react"

interface RiskBadgeProps {
  level: string
  size?: "sm" | "md" | "lg"
  className?: string
}

const CONFIG = {
  EMERGENCY: { color: "bg-red-500/15 text-red-400 border-red-500/30",    icon: AlertCircle,   label: "Emergency" },
  HIGH:      { color: "bg-orange-500/15 text-orange-400 border-orange-500/30", icon: AlertTriangle, label: "High Risk" },
  MEDIUM:    { color: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30", icon: Info,          label: "Medium"   },
  LOW:       { color: "bg-green-500/15 text-green-400 border-green-500/30",    icon: CheckCircle,   label: "Low Risk" },
}

export function RiskBadge({ level, size = "md", className }: RiskBadgeProps) {
  const key = (level ?? "").toUpperCase() as keyof typeof CONFIG
  const cfg = CONFIG[key] ?? CONFIG.MEDIUM
  const Icon = cfg.icon

  const sizeClass = {
    sm: "text-xs px-2 py-0.5 gap-1",
    md: "text-sm px-3 py-1 gap-1.5",
    lg: "text-base px-4 py-1.5 gap-2",
  }[size]

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border font-medium",
        cfg.color, sizeClass, className
      )}
    >
      <Icon className={size === "sm" ? "w-3 h-3" : size === "lg" ? "w-5 h-5" : "w-4 h-4"} />
      {cfg.label}
    </span>
  )
}
