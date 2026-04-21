import { motion } from "framer-motion"
import { Wifi, WifiOff, Cpu, Bell, Sun, Moon, Menu } from "lucide-react"
import { useStore } from "@/store/useStore"
import { useOffline } from "@/hooks/useOffline"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { useLocation } from "react-router-dom"

const PAGE_TITLES: Record<string, string> = {
  "/patient":            "Dashboard",
  "/patient/diagnose":   "AI Diagnosis",
  "/patient/upload":     "Upload Report",
  "/patient/reports":    "Medical Reports",
  "/patient/vitals":     "Vitals Analysis",
  "/patient/access":     "Doctor Access",
  "/patient/chat":       "Health Chat",
  "/doctor":             "Dashboard",
  "/doctor/access":      "Access Patient",
  "/doctor/appointments": "Appointments",
  "/doctor/chat":        "Medical Chat",
  "/asha":               "Dashboard",
  "/asha/patients":      "My Patients",
  "/asha/diagnose":      "AI Diagnosis",
  "/asha/heatmap":       "Disease Map",
  "/asha/tasks":         "Tasks",
  "/asha/reminders":     "Reminders",
  "/asha/maternal":      "Maternal Health",
  "/asha/immunization":  "Immunization",
  "/asha/surveillance":  "Surveillance",
  "/asha/report":        "Gov Report",
  "/asha/chat":          "Health Chat",
}

interface TopbarProps {
  onMobileMenu?: () => void
}

export function Topbar({ onMobileMenu }: TopbarProps) {
  const { theme, toggleTheme, npuActive } = useStore()
  const { isOnline } = useOffline()
  const location = useLocation()
  const title = PAGE_TITLES[location.pathname] ?? "Sahayak AI"

  return (
    <header className="h-16 bg-[#1a1a22]/80 backdrop-blur border-b border-[#2a2a35] flex items-center px-4 gap-4 shrink-0">
      {/* Mobile menu */}
      <button
        onClick={onMobileMenu}
        className="lg:hidden p-2 rounded-lg hover:bg-white/5 text-gray-400"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Page title */}
      <motion.h1
        key={title}
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-lg font-bold text-white flex-1"
      >
        {title}
      </motion.h1>

      {/* Status pills */}
      <div className="hidden sm:flex items-center gap-2">
        {/* NPU status */}
        <div
          className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border ${
            npuActive
              ? "bg-brand-500/10 border-brand-500/30 text-brand-400"
              : "bg-[#2a2a35] border-[#3a3a45] text-gray-500"
          }`}
        >
          <Cpu className="w-3 h-3" />
          <span className="hidden md:inline">AMD Ryzen AI</span>
          <span className="md:hidden">NPU</span>
          {npuActive && <span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-pulse" />}
        </div>

        {/* Online status */}
        <div
          className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border ${
            isOnline
              ? "bg-green-500/10 border-green-500/30 text-green-400"
              : "bg-orange-500/10 border-orange-500/30 text-orange-400"
          }`}
        >
          {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
          <span>{isOnline ? "Online" : "Offline"}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1">
        {/* Theme toggle */}
        <Button
          variant="ghost" size="icon"
          onClick={toggleTheme}
          className="w-8 h-8 text-gray-400 hover:text-white"
        >
          {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </Button>

        {/* Notifications */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="w-8 h-8 text-gray-400 hover:text-white relative">
              <Bell className="w-4 h-4" />
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-brand-500" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72 bg-[#1a1a22] border-[#2a2a35]">
            <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Notifications
            </div>
            <DropdownMenuItem className="text-sm text-gray-300 focus:bg-white/5 focus:text-white">
              <div>
                <p className="font-medium">RAG index loaded</p>
                <p className="text-xs text-gray-500 mt-0.5">12 ICMR guidelines ready</p>
              </div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
