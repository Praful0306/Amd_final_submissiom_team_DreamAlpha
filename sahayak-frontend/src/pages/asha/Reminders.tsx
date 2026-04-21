import { useState } from "react"
import { motion } from "framer-motion"
import { Bell, BellOff, User, Calendar, Clock, Check, Plus } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { formatDate } from "@/lib/utils"

interface Reminder {
  id: string; title: string; patient?: string; due: string; category: string; done: boolean
}

const INIT: Reminder[] = [
  { id:"1", title:"ANC 3rd Visit",        patient:"Sunita Bai",   due: new Date().toISOString(), category:"Maternal", done: false },
  { id:"2", title:"TB DOTS — Day 15",     patient:"Ramesh Kumar", due: new Date(Date.now() + 86400000).toISOString(), category:"TB", done: false },
  { id:"3", title:"Pentavalent 2nd dose", patient:"Baby of Priya",due: new Date(Date.now() + 2*86400000).toISOString(), category:"Immunization", done: false },
  { id:"4", title:"Malaria RDT follow-up",patient:"Mohan Lal",    due: new Date(Date.now() + 3*86400000).toISOString(), category:"Malaria", done: false },
  { id:"5", title:"IFA distribution — Ward 5", due: new Date(Date.now() + 7*86400000).toISOString(), category:"Nutrition", done: true },
]

const CAT_COLOR: Record<string, string> = {
  Maternal:     "bg-pink-500/15 text-pink-400 border-pink-500/25",
  TB:           "bg-red-500/15 text-red-400 border-red-500/25",
  Immunization: "bg-blue-500/15 text-blue-400 border-blue-500/25",
  Malaria:      "bg-yellow-500/15 text-yellow-400 border-yellow-500/25",
  Nutrition:    "bg-green-500/15 text-green-400 border-green-500/25",
}

export default function Reminders() {
  const [reminders, setReminders] = useState<Reminder[]>(INIT)
  const [notify,    setNotify]    = useState(true)

  function toggle(id: string) {
    setReminders(r => r.map(rem => rem.id === id ? { ...rem, done: !rem.done } : rem))
  }

  const due     = reminders.filter(r => !r.done).sort((a,b) => new Date(a.due).getTime() - new Date(b.due).getTime())
  const done    = reminders.filter(r => r.done)
  const overdue = due.filter(r => new Date(r.due) < new Date())

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Reminders</h2>
          <p className="text-gray-500 mt-0.5">{due.length} upcoming · {overdue.length} overdue</p>
        </div>
        <div className="flex items-center gap-3">
          <Bell className={`w-4 h-4 ${notify ? "text-brand-400" : "text-gray-600"}`} />
          <Switch checked={notify} onCheckedChange={setNotify} />
          <span className="text-sm text-gray-400">{notify ? "Notifications on" : "Muted"}</span>
        </div>
      </div>

      {/* Overdue alert */}
      {overdue.length > 0 && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex items-center gap-2 text-sm text-red-400">
          <Bell className="w-4 h-4 shrink-0" />
          {overdue.length} overdue reminder{overdue.length > 1 ? "s" : ""} need attention
        </div>
      )}

      {/* Upcoming */}
      {due.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider px-1">Upcoming</h3>
          {due.map((r, i) => {
            const isOverdue = new Date(r.due) < new Date()
            const isToday   = formatDate(r.due) === formatDate(new Date())
            return (
              <motion.div
                key={r.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className={`flex items-start gap-4 p-4 rounded-xl border ${
                  isOverdue
                    ? "bg-red-500/5 border-red-500/20"
                    : isToday
                    ? "bg-brand-500/5 border-brand-500/20"
                    : "bg-[#1a1a22] border-[#2a2a35]"
                }`}
              >
                <button onClick={() => toggle(r.id)} className={`mt-0.5 shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center ${isOverdue ? "border-red-500" : "border-gray-600 hover:border-brand-500"}`}>
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-white">{r.title}</p>
                    <Badge className={`text-[10px] ${CAT_COLOR[r.category] ?? "bg-gray-500/15 text-gray-400 border-gray-500/25"}`}>
                      {r.category}
                    </Badge>
                  </div>
                  {r.patient && (
                    <span className="flex items-center gap-1 text-xs text-gray-500 mt-0.5">
                      <User className="w-3 h-3" /> {r.patient}
                    </span>
                  )}
                  <span className={`flex items-center gap-1 text-xs mt-1 ${isOverdue ? "text-red-400" : isToday ? "text-brand-400" : "text-gray-500"}`}>
                    <Calendar className="w-3 h-3" />
                    {isOverdue ? "Overdue · " : isToday ? "Today · " : ""}{formatDate(r.due)}
                  </span>
                </div>
              </motion.div>
            )
          })}
        </div>
      )}

      {/* Done */}
      {done.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider px-1">Completed</h3>
          {done.map(r => (
            <div key={r.id} className="flex items-center gap-4 p-4 rounded-xl bg-white/[0.02] border border-white/5 opacity-60">
              <Check className="w-5 h-5 text-green-500 shrink-0" />
              <p className="text-sm text-gray-500 line-through">{r.title}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
