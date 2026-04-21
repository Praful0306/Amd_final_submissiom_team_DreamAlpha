import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { CheckSquare, Square, Plus, Trash2, Clock, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

interface Task {
  id: string; text: string; done: boolean; priority: "high" | "medium" | "low"; patient?: string
}

const INIT_TASKS: Task[] = [
  { id: "1", text: "Visit Sunita Devi for ANC 2nd visit", done: false, priority: "high", patient: "Sunita Devi" },
  { id: "2", text: "Distribute IFA tablets in Ward 5", done: false, priority: "high" },
  { id: "3", text: "Follow up with Ramesh for TB DOTS", done: true, priority: "medium", patient: "Ramesh Kumar" },
  { id: "4", text: "Update register for malaria surveillance", done: false, priority: "medium" },
  { id: "5", text: "Refer Priya to PHC for hemoglobin <7", done: false, priority: "high", patient: "Priya Devi" },
  { id: "6", text: "Community meeting on dengue prevention", done: true, priority: "low" },
]

const P_COLORS = {
  high:   "bg-red-500/15 text-red-400 border-red-500/25",
  medium: "bg-yellow-500/15 text-yellow-400 border-yellow-500/25",
  low:    "bg-green-500/15 text-green-400 border-green-500/25",
}

export default function Tasks() {
  const [tasks,   setTasks]   = useState<Task[]>(INIT_TASKS)
  const [newTask, setNewTask] = useState("")
  const [prio,    setPrio]    = useState<"high"|"medium"|"low">("medium")

  function toggle(id: string) {
    setTasks(t => t.map(tk => tk.id === id ? { ...tk, done: !tk.done } : tk))
  }
  function remove(id: string) {
    setTasks(t => t.filter(tk => tk.id !== id))
  }
  function add() {
    if (!newTask.trim()) return
    setTasks(t => [{ id: Date.now().toString(), text: newTask.trim(), done: false, priority: prio }, ...t])
    setNewTask("")
  }

  const pending   = tasks.filter(t => !t.done)
  const completed = tasks.filter(t => t.done)

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-white">Daily Tasks</h2>
        <p className="text-gray-500 mt-0.5">{pending.length} pending · {completed.length} done</p>
      </div>

      {/* Add task */}
      <Card className="bg-[#1a1a22] border-[#2a2a35]">
        <CardContent className="p-4">
          <div className="flex gap-2">
            <Input
              value={newTask}
              onChange={e => setNewTask(e.target.value)}
              onKeyDown={e => e.key === "Enter" && add()}
              placeholder="Add a new task…"
              className="flex-1 bg-white/5 border-white/10 text-white placeholder:text-gray-600 h-9"
            />
            <div className="flex gap-1">
              {(["high","medium","low"] as const).map(p => (
                <button
                  key={p}
                  onClick={() => setPrio(p)}
                  className={cn(
                    "px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all",
                    prio === p ? P_COLORS[p] : "bg-white/5 border-white/10 text-gray-500 hover:text-white"
                  )}
                >
                  {p[0].toUpperCase()}
                </button>
              ))}
            </div>
            <Button size="sm" className="h-9 bg-brand-600 hover:bg-brand-700 text-white px-3" onClick={add}>
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Pending tasks */}
      {pending.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider px-1">Pending</h3>
          <AnimatePresence>
            {pending.map((task, i) => (
              <motion.div
                key={task.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ delay: i * 0.04 }}
                className="flex items-start gap-3 p-4 rounded-xl bg-[#1a1a22] border border-[#2a2a35] hover:border-brand-500/20 transition-colors group"
              >
                <button onClick={() => toggle(task.id)} className="mt-0.5 text-gray-500 hover:text-brand-400 transition-colors shrink-0">
                  <Square className="w-5 h-5" />
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white leading-relaxed">{task.text}</p>
                  {task.patient && (
                    <span className="flex items-center gap-1 text-xs text-gray-500 mt-1">
                      <User className="w-3 h-3" /> {task.patient}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge className={`text-[10px] ${P_COLORS[task.priority]} capitalize`}>{task.priority}</Badge>
                  <button
                    onClick={() => remove(task.id)}
                    className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Done tasks */}
      {completed.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider px-1">Completed</h3>
          {completed.map((task) => (
            <div
              key={task.id}
              className="flex items-start gap-3 p-4 rounded-xl bg-white/[0.02] border border-white/5 opacity-60"
            >
              <button onClick={() => toggle(task.id)} className="mt-0.5 text-green-500 shrink-0">
                <CheckSquare className="w-5 h-5" />
              </button>
              <p className="text-sm text-gray-500 line-through flex-1">{task.text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
