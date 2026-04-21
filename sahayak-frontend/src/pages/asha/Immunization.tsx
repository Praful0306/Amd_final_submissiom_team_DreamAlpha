import { useState } from "react"
import { motion } from "framer-motion"
import { Syringe, CheckCircle2, Clock, AlertCircle, Baby } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { formatDate } from "@/lib/utils"

interface Child {
  id: string; name: string; dob: string; mother: string
  vaccines: Record<string, "done"|"due"|"overdue"|"upcoming">
}

const VACCINES = [
  { id:"bcg",       label:"BCG",             timing:"At birth" },
  { id:"hepb0",     label:"Hep B (Birth)",   timing:"At birth" },
  { id:"opv0",      label:"OPV 0",           timing:"At birth" },
  { id:"penta1",    label:"Pentavalent 1",   timing:"6 weeks" },
  { id:"opv1",      label:"OPV 1",           timing:"6 weeks" },
  { id:"rota1",     label:"Rotavirus 1",     timing:"6 weeks" },
  { id:"penta2",    label:"Pentavalent 2",   timing:"10 weeks" },
  { id:"opv2",      label:"OPV 2",           timing:"10 weeks" },
  { id:"rota2",     label:"Rotavirus 2",     timing:"10 weeks" },
  { id:"penta3",    label:"Pentavalent 3",   timing:"14 weeks" },
  { id:"opv3",      label:"OPV 3",           timing:"14 weeks" },
  { id:"ipv",       label:"IPV",             timing:"14 weeks" },
  { id:"measles1",  label:"Measles 1",       timing:"9 months" },
  { id:"vitA1",     label:"Vit A (1st)",     timing:"9 months" },
  { id:"mr1",       label:"MR 1",            timing:"9–12 months" },
  { id:"je1",       label:"JE 1",            timing:"9–12 months" },
  { id:"dpt_booster",label:"DPT Booster",   timing:"16–24 months" },
  { id:"measles2",  label:"Measles 2",       timing:"16–24 months" },
]

const SAMPLE_CHILDREN: Child[] = [
  {
    id:"1", name:"Baby Sunita", dob:"2025-09-15", mother:"Sunita Bai",
    vaccines: {
      bcg:"done", hepb0:"done", opv0:"done",
      penta1:"done", opv1:"done", rota1:"done",
      penta2:"due", opv2:"due", rota2:"upcoming",
      penta3:"upcoming", opv3:"upcoming", ipv:"upcoming",
      measles1:"upcoming", vitA1:"upcoming", mr1:"upcoming",
      je1:"upcoming", dpt_booster:"upcoming", measles2:"upcoming"
    }
  },
  {
    id:"2", name:"Baby Meena", dob:"2026-01-20", mother:"Meena Devi",
    vaccines: {
      bcg:"done", hepb0:"done", opv0:"done",
      penta1:"overdue", opv1:"overdue", rota1:"overdue",
      penta2:"upcoming", opv2:"upcoming", rota2:"upcoming",
      penta3:"upcoming", opv3:"upcoming", ipv:"upcoming",
      measles1:"upcoming", vitA1:"upcoming", mr1:"upcoming",
      je1:"upcoming", dpt_booster:"upcoming", measles2:"upcoming"
    }
  },
]

const STATUS_STYLE = {
  done:     "bg-green-500/15 text-green-400 border-green-500/25",
  due:      "bg-brand-500/15 text-brand-400 border-brand-500/25",
  overdue:  "bg-red-500/15 text-red-400 border-red-500/25",
  upcoming: "bg-white/5 text-gray-500 border-white/8",
}

const STATUS_ICON = {
  done:     <CheckCircle2 className="w-3 h-3" />,
  due:      <Clock className="w-3 h-3" />,
  overdue:  <AlertCircle className="w-3 h-3" />,
  upcoming: null,
}

export default function Immunization() {
  const [selected, setSelected] = useState<Child>(SAMPLE_CHILDREN[0])

  const doneCount = Object.values(selected.vaccines).filter(v => v === "done").length
  const total = VACCINES.length
  const overdueCount = Object.values(selected.vaccines).filter(v => v === "overdue").length

  function ageInWeeks(dob: string) {
    const diff = Date.now() - new Date(dob).getTime()
    return Math.floor(diff / (7 * 24 * 60 * 60 * 1000))
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Immunization</h2>
        <p className="text-gray-500 mt-0.5">Universal Immunization Programme — child vaccine tracker</p>
      </div>

      {/* Child selector */}
      <div className="flex gap-3 flex-wrap">
        {SAMPLE_CHILDREN.map(c => (
          <button
            key={c.id}
            onClick={() => setSelected(c)}
            className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
              selected.id === c.id
                ? "border-brand-500/40 bg-brand-500/5"
                : "border-[#2a2a35] bg-[#1a1a22] hover:border-white/15"
            }`}
          >
            <div className="w-9 h-9 rounded-full bg-blue-500/15 flex items-center justify-center">
              <Baby className="w-4 h-4 text-blue-400" />
            </div>
            <div className="text-left">
              <p className="text-sm font-medium text-white">{c.name}</p>
              <p className="text-xs text-gray-500">{ageInWeeks(c.dob)} weeks · {c.mother}</p>
            </div>
            {Object.values(c.vaccines).some(v => v === "overdue") && (
              <span className="w-2 h-2 rounded-full bg-red-500 ml-1" />
            )}
          </button>
        ))}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="bg-[#1a1a22] border-[#2a2a35]">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-extrabold text-green-400">{doneCount}</p>
            <p className="text-xs text-gray-500 mt-1">Completed</p>
          </CardContent>
        </Card>
        <Card className="bg-[#1a1a22] border-[#2a2a35]">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-extrabold text-red-400">{overdueCount}</p>
            <p className="text-xs text-gray-500 mt-1">Overdue</p>
          </CardContent>
        </Card>
        <Card className="bg-[#1a1a22] border-[#2a2a35]">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-extrabold text-white">{Math.round(doneCount/total*100)}%</p>
            <p className="text-xs text-gray-500 mt-1">Complete</p>
          </CardContent>
        </Card>
      </div>

      {/* Progress */}
      <div>
        <div className="flex justify-between text-xs text-gray-500 mb-1.5">
          <span>Vaccination progress</span>
          <span>{doneCount}/{total} vaccines</span>
        </div>
        <Progress value={(doneCount/total)*100} className="h-2.5 bg-white/10" />
      </div>

      {/* Vaccine grid */}
      <Card className="bg-[#1a1a22] border-[#2a2a35]">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-white">Vaccine Schedule — {selected.name}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {VACCINES.map(v => {
              const status = selected.vaccines[v.id] ?? "upcoming"
              return (
                <motion.div
                  key={v.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className={`p-3 rounded-xl border flex items-center gap-2 ${STATUS_STYLE[status]}`}
                >
                  {STATUS_ICON[status]}
                  <div className="min-w-0">
                    <p className="text-xs font-medium leading-tight truncate">{v.label}</p>
                    <p className="text-[10px] opacity-60 truncate">{v.timing}</p>
                  </div>
                </motion.div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
