import { useState } from "react"
import { motion } from "framer-motion"
import { Baby, Heart, Calendar, CheckCircle2, AlertTriangle, Plus } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { formatDate } from "@/lib/utils"

interface Mother {
  id: string; name: string; lmp: string; edd: string
  anc_done: number; anc_total: number
  ifa_weeks: number; calcium: boolean; tt_doses: number
  risk: string
}

const SAMPLE: Mother[] = [
  { id:"1", name:"Sunita Bai",   lmp:"2025-09-15", edd:"2026-06-22", anc_done:2, anc_total:4, ifa_weeks:12, calcium:true,  tt_doses:2, risk:"LOW"    },
  { id:"2", name:"Meena Devi",   lmp:"2025-11-01", edd:"2026-08-08", anc_done:1, anc_total:4, ifa_weeks:6,  calcium:false, tt_doses:1, risk:"MEDIUM" },
  { id:"3", name:"Kamlesh Bai",  lmp:"2025-07-10", edd:"2026-04-16", anc_done:3, anc_total:4, ifa_weeks:20, calcium:true,  tt_doses:2, risk:"HIGH"   },
]

const ANC_VISITS = [
  { visit:1, timing:"1st trimester",   items:["BP check","Weight","Hb","Blood group","USG","HIV/HBsAg"] },
  { visit:2, timing:"14–26 weeks",      items:["BP","Weight","FHR","Fundal height","Hb"] },
  { visit:3, timing:"28–34 weeks",      items:["BP","Weight","Presentation","Hb","ANC card"] },
  { visit:4, timing:"36 weeks+",        items:["BP","Weight","Presentation","Birth plan","JSY"] },
]

function riskColor(r: string) {
  if (r === "HIGH"   ) return "bg-red-500/15 text-red-400 border-red-500/30"
  if (r === "MEDIUM" ) return "bg-yellow-500/15 text-yellow-400 border-yellow-500/30"
  return "bg-green-500/15 text-green-400 border-green-500/30"
}

export default function MaternalHealth() {
  const [selected, setSelected] = useState<Mother | null>(SAMPLE[0])

  function weeksPregnant(lmp: string) {
    const diff = Date.now() - new Date(lmp).getTime()
    return Math.floor(diff / (7 * 24 * 60 * 60 * 1000))
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Maternal Health</h2>
          <p className="text-gray-500 mt-0.5">ANC tracking · IFA · TT immunization</p>
        </div>
        <Button className="gap-2 bg-pink-600 hover:bg-pink-700 text-white">
          <Plus className="w-4 h-4" /> Register Pregnancy
        </Button>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Mother list */}
        <div className="space-y-2">
          {SAMPLE.map((m) => {
            const weeks = weeksPregnant(m.lmp)
            return (
              <motion.button
                key={m.id}
                onClick={() => setSelected(m)}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className={`w-full text-left p-4 rounded-xl border transition-all ${
                  selected?.id === m.id
                    ? "border-pink-500/40 bg-pink-500/5"
                    : "border-[#2a2a35] bg-[#1a1a22] hover:border-white/15"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-semibold text-white">{m.name}</p>
                  <Badge className={`text-[10px] ${riskColor(m.risk)}`}>{m.risk}</Badge>
                </div>
                <p className="text-xs text-gray-500">{weeks} weeks · EDD {formatDate(m.edd)}</p>
                <div className="mt-2">
                  <Progress value={(m.anc_done / m.anc_total) * 100} className="h-1.5 bg-white/10" />
                  <p className="text-[10px] text-gray-600 mt-0.5">ANC {m.anc_done}/{m.anc_total}</p>
                </div>
              </motion.button>
            )
          })}
        </div>

        {/* Detail */}
        <div className="lg:col-span-2 space-y-4">
          {selected ? (
            <>
              <Card className="bg-[#1a1a22] border-[#2a2a35]">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-pink-500/15 flex items-center justify-center">
                        <Baby className="w-6 h-6 text-pink-400" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-white">{selected.name}</h3>
                        <p className="text-sm text-gray-400">
                          {weeksPregnant(selected.lmp)} weeks pregnant
                          · EDD {formatDate(selected.edd)}
                        </p>
                        <Badge className={`mt-1.5 text-xs ${riskColor(selected.risk)}`}>{selected.risk} Risk</Badge>
                      </div>
                    </div>
                  </div>

                  {/* Checklist */}
                  <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { label:`IFA ${selected.ifa_weeks}wk`,  done: selected.ifa_weeks > 0,   icon:"💊" },
                      { label:"Calcium",                      done: selected.calcium,           icon:"🥛" },
                      { label:`TT ${selected.tt_doses}/2`,    done: selected.tt_doses >= 2,    icon:"💉" },
                      { label:`ANC ${selected.anc_done}/4`,   done: selected.anc_done >= 4,    icon:"📋" },
                    ].map(({label, done, icon}) => (
                      <div key={label} className={`p-3 rounded-xl border text-center ${done ? "bg-green-500/10 border-green-500/25" : "bg-white/[0.03] border-white/10"}`}>
                        <span className="text-xl">{icon}</span>
                        <p className="text-xs text-gray-400 mt-1">{label}</p>
                        {done
                          ? <CheckCircle2 className="w-4 h-4 text-green-500 mx-auto mt-1" />
                          : <AlertTriangle className="w-4 h-4 text-yellow-500 mx-auto mt-1" />
                        }
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* ANC schedule */}
              <Card className="bg-[#1a1a22] border-[#2a2a35]">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-white">ANC Visit Schedule</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {ANC_VISITS.map((v) => (
                      <div
                        key={v.visit}
                        className={`p-3 rounded-xl border ${
                          selected.anc_done >= v.visit
                            ? "bg-green-500/5 border-green-500/20"
                            : selected.anc_done + 1 === v.visit
                            ? "bg-brand-500/5 border-brand-500/30"
                            : "bg-white/[0.02] border-white/8"
                        }`}
                      >
                        <div className="flex items-center gap-3 mb-2">
                          <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                            selected.anc_done >= v.visit ? "bg-green-500 text-white" : "bg-white/10 text-gray-400"
                          }`}>
                            {selected.anc_done >= v.visit ? "✓" : v.visit}
                          </span>
                          <div>
                            <p className="text-sm font-medium text-white">Visit {v.visit}</p>
                            <p className="text-xs text-gray-500">{v.timing}</p>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1.5 ml-10">
                          {v.items.map(item => (
                            <span key={item} className="text-[10px] bg-white/5 text-gray-400 px-2 py-0.5 rounded-full border border-white/8">
                              {item}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <div className="h-full flex items-center justify-center text-gray-600">Select a patient</div>
          )}
        </div>
      </div>
    </div>
  )
}
