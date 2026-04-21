import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string | Date) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(date))
}

export function riskColor(level: string) {
  switch (level?.toUpperCase()) {
    case "EMERGENCY": return "text-risk-emergency"
    case "HIGH":      return "text-risk-high"
    case "MEDIUM":    return "text-risk-medium"
    case "LOW":       return "text-risk-low"
    default:          return "text-muted-foreground"
  }
}

export function riskBg(level: string) {
  switch (level?.toUpperCase()) {
    case "EMERGENCY": return "bg-risk-emergency/10 border-risk-emergency/30"
    case "HIGH":      return "bg-risk-high/10 border-risk-high/30"
    case "MEDIUM":    return "bg-risk-medium/10 border-risk-medium/30"
    case "LOW":       return "bg-risk-low/10 border-risk-low/30"
    default:          return "bg-muted/10 border-muted/30"
  }
}
