import { NavLink, useNavigate } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import {
  LayoutDashboard, Mic, Upload, FileText, Share2,
  Users, Activity, Map, CheckSquare, Bell, Baby,
  Syringe, BarChart3, ClipboardList, MessageSquare,
  HeartPulse, LogOut, ChevronLeft, ChevronRight, Phone,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { useStore } from "@/store/useStore"
import { clearSession } from "@/lib/auth"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { useState } from "react"

const NAV: Record<string, { label: string; icon: LucideIcon; href: string }[]> = {
  patient: [
    { label: "Dashboard",    icon: LayoutDashboard, href: "/patient" },
    { label: "Diagnosis",    icon: Mic,             href: "/patient/diagnose" },
    { label: "Upload Report",icon: Upload,          href: "/patient/upload" },
    { label: "Reports",      icon: FileText,        href: "/patient/reports" },
    { label: "Vitals",       icon: HeartPulse,      href: "/patient/vitals" },
    { label: "Share",        icon: Share2,          href: "/patient/access" },
    { label: "Call Centre",  icon: Phone,           href: "/patient/call" },
    { label: "Chat",         icon: MessageSquare,   href: "/patient/chat" },
  ],
  doctor: [
    { label: "Dashboard",    icon: LayoutDashboard, href: "/doctor" },
    { label: "Access Patient",icon: Share2,         href: "/doctor/access" },
    { label: "Appointments", icon: Bell,            href: "/doctor/appointments" },
    { label: "Chat",         icon: MessageSquare,   href: "/doctor/chat" },
  ],
  asha: [
    { label: "Dashboard",    icon: LayoutDashboard, href: "/asha" },
    { label: "My Patients",  icon: Users,           href: "/asha/patients" },
    { label: "Diagnosis",    icon: Mic,             href: "/asha/diagnose" },
    { label: "Disease Map",  icon: Map,             href: "/asha/heatmap" },
    { label: "Tasks",        icon: CheckSquare,     href: "/asha/tasks" },
    { label: "Reminders",    icon: Bell,            href: "/asha/reminders" },
    { label: "Maternal",     icon: Baby,            href: "/asha/maternal" },
    { label: "Immunization", icon: Syringe,         href: "/asha/immunization" },
    { label: "Surveillance", icon: Activity,        href: "/asha/surveillance" },
    { label: "Gov Report",   icon: ClipboardList,   href: "/asha/report" },
    { label: "Chat",         icon: MessageSquare,   href: "/asha/chat" },
  ],
}

interface SidebarProps {
  role: string
  collapsed: boolean
  onToggle: () => void
}

export function Sidebar({ role, collapsed, onToggle }: SidebarProps) {
  const { user, clearAuth } = useStore()
  const navigate = useNavigate()
  const items = NAV[role] ?? []

  function handleLogout() {
    clearSession()
    clearAuth()
    navigate("/auth", { replace: true })
  }

  return (
    <motion.aside
      animate={{ width: collapsed ? 64 : 256 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="flex flex-col h-screen bg-[#1a1a22] border-r border-[#2a2a35] shrink-0 overflow-hidden z-20"
    >
      {/* Header */}
      <div className="flex items-center h-16 px-4 border-b border-[#2a2a35] shrink-0">
        <AnimatePresence mode="wait">
          {!collapsed ? (
            <motion.div
              key="full"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex items-center gap-3 flex-1 min-w-0"
            >
              <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center shrink-0">
                <HeartPulse className="w-4 h-4 text-white" />
              </div>
              <span className="font-bold text-white tracking-tight truncate">Sahayak AI</span>
            </motion.div>
          ) : (
            <motion.div
              key="icon"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center mx-auto"
            >
              <HeartPulse className="w-4 h-4 text-white" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Toggle button */}
      <button
        onClick={onToggle}
        className="absolute top-5 -right-3 z-30 w-6 h-6 rounded-full bg-[#2a2a35] border border-[#3a3a45] flex items-center justify-center text-gray-400 hover:text-white transition-colors"
      >
        {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
      </button>

      {/* Nav items */}
      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-0.5">
        {items.map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.href}
              to={item.href}
              end={item.href.split("/").length <= 2}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all relative group",
                  isActive
                    ? "bg-brand-500/15 text-brand-400"
                    : "text-gray-400 hover:text-gray-200 hover:bg-white/5"
                )
              }
            >
              {/* Active indicator uses CSS [aria-current=page] via className prop above */}
              <span className="absolute left-0 inset-y-2 w-0.5 bg-brand-500 rounded-full opacity-0 [.bg-brand-500\/15_&]:opacity-100 transition-opacity" />
              <Icon className="w-4 h-4 shrink-0" />
              <AnimatePresence>
                {!collapsed && (
                  <motion.span
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -8 }}
                    transition={{ duration: 0.15 }}
                    className="text-sm font-medium whitespace-nowrap"
                  >
                    {item.label}
                  </motion.span>
                )}
              </AnimatePresence>
              {/* Tooltip when collapsed */}
              {collapsed && (
                <div className="absolute left-full ml-3 px-2 py-1 bg-[#2a2a35] text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity">
                  {item.label}
                </div>
              )}
            </NavLink>
          )
        })}
      </nav>

      {/* User section */}
      <div className="border-t border-[#2a2a35] p-3">
        <div className={cn("flex items-center gap-3", collapsed && "justify-center")}>
          <button
            onClick={() => navigate(`/${user?.role ?? "patient"}/profile`)}
            className="shrink-0 rounded-full ring-2 ring-transparent hover:ring-brand-500/40 transition-all"
            title="View Profile"
          >
            <Avatar className="w-8 h-8">
              <AvatarFallback className="bg-brand-800 text-brand-200 text-xs font-bold">
                {((user?.full_name || user?.name) ?? "U").charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </button>
          <AnimatePresence>
            {!collapsed && (
              <motion.button
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={() => navigate(`/${user?.role ?? "patient"}/profile`)}
                className="flex-1 min-w-0 text-left hover:opacity-80 transition-opacity"
              >
                <p className="text-sm font-medium text-white truncate">{user?.full_name || user?.name}</p>
                <p className="text-xs text-gray-500 capitalize">{user?.role}</p>
              </motion.button>
            )}
          </AnimatePresence>
          {!collapsed && (
            <button
              onClick={handleLogout}
              className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </motion.aside>
  )
}
