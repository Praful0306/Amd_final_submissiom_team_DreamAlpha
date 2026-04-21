import { useState } from "react"
import { motion } from "framer-motion"
import { Activity, Plus, AlertTriangle, TrendingUp, Search } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import { formatDate } from "@/lib/utils"
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts"

interface CaseReport {
  id: string; disease: string; village: string; count: number; date: string; status: "open"|"resolved"|"escalated"
}

const INIT: CaseReport[] = [
  { id:"1", disease:"Malaria",         village:"Rampur",    count:3, date: new Date().toISOString(),  status:"open" },
  { id:"2", disease:"Dengue",          village:"Ganeshpur", count:2, date: new Date(Date.now()-86400000).toISOString(), status:"escalated" },
  { id:"3", disease:"Acute Diarrhoea", village:"Sultanpur", count:5, date: new Date(Date.now()-2*86400000).toISOString(), status:"resolved" },
  { id:"4", disease:"Typhoid",         village:"Rampur",    count:1, date: new Date(Date.now()-3*86400000).toISOString(), status:"resolved" },
]

const DISEASES = ["Malaria","Dengue","Acute Diarrhoea","Tuberculosis","Typhoid","Pneumonia","Cholera","Measles","Jaundice"]

const STATUS_STYLE: Record<string,string> = {
  open:       "bg-orange-500/15 text-orange-400 border-orange-500/25",
  resolved:   "bg-green-500/15 text-green-400 border-green-500/25",
  escalated:  "bg-red-500/15 text-red-400 border-red-500/25",
}

const chartData = [
  { disease:"Malaria",    cases:12 },
  { disease:"Dengue",     cases:8  },
  { disease:"Diarrhoea",  cases:15 },
  { disease:"TB",         cases:4  },
  { disease:"Typhoid",    cases:6  },
]

export default function Surveillance() {
  const [cases,  setCases]  = useState<CaseReport[]>(INIT)
  const [adding, setAdding] = useState(false)
  const [form,   setForm]   = useState({ disease:"", village:"", count:"1" })

  function handleAdd() {
    if (!form.disease || !form.village) { toast.error("Select disease and enter village"); return }
    const newCase: CaseReport = {
      id: Date.now().toString(),
      disease: form.disease,
      village: form.village,
      count: parseInt(form.count) || 1,
      date: new Date().toISOString(),
      status: "open",
    }
    setCases(c => [newCase, ...c])
    setAdding(false)
    setForm({ disease:"", village:"", count:"1" })
    toast.success("Case reported successfully")
  }

  const totalOpen = cases.filter(c => c.status === "open").length
  const escalated = cases.filter(c => c.status === "escalated").length

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">Surveillance</h2>
          <p className="text-gray-500 mt-0.5">Community disease outbreak reporting</p>
        </div>
        <Button className="gap-2 bg-brand-600 hover:bg-brand-700 text-white" onClick={() => setAdding(true)}>
          <Plus className="w-4 h-4" /> Report Case
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="bg-[#1a1a22] border-[#2a2a35]">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-extrabold text-white">{cases.length}</p>
            <p className="text-xs text-gray-500 mt-1">Total Reports</p>
          </CardContent>
        </Card>
        <Card className="bg-[#1a1a22] border-[#2a2a35]">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-extrabold text-orange-400">{totalOpen}</p>
            <p className="text-xs text-gray-500 mt-1">Open Cases</p>
          </CardContent>
        </Card>
        <Card className="bg-red-500/5 border-red-500/20">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-extrabold text-red-400">{escalated}</p>
            <p className="text-xs text-gray-500 mt-1">Escalated</p>
          </CardContent>
        </Card>
      </div>

      {/* Chart */}
      <Card className="bg-[#1a1a22] border-[#2a2a35]">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-brand-400" /> Disease Trend (Last 30 days)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={chartData} barSize={32}>
              <XAxis dataKey="disease" tick={{ fill:"#6b7280", fontSize:11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill:"#6b7280", fontSize:11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background:"#1a1a22", border:"1px solid #2a2a35", borderRadius:8 }} cursor={{ fill:"rgba(255,255,255,0.03)" }} />
              <Bar dataKey="cases" fill="#f97316" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Add case form */}
      {adding && (
        <motion.div initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }}>
          <Card className="bg-[#1a1a22] border-brand-500/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-white">Report New Case</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid sm:grid-cols-3 gap-3">
                <Select value={form.disease} onValueChange={v => setForm(f => ({...f, disease:v}))}>
                  <SelectTrigger className="bg-white/5 border-white/10 text-white h-9">
                    <SelectValue placeholder="Select disease…" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1a1a22] border-[#2a2a35]">
                    {DISEASES.map(d => <SelectItem key={d} value={d} className="text-white focus:bg-white/10">{d}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input placeholder="Village name" value={form.village} onChange={e => setForm(f => ({...f, village:e.target.value}))} className="bg-white/5 border-white/10 text-white h-9" />
                <Input type="number" placeholder="# cases" min={1} value={form.count} onChange={e => setForm(f => ({...f, count:e.target.value}))} className="bg-white/5 border-white/10 text-white h-9" />
              </div>
              <div className="flex gap-3 mt-3">
                <Button className="bg-brand-600 hover:bg-brand-700 text-white h-9 text-sm" onClick={handleAdd}>Submit Report</Button>
                <Button variant="outline" className="border-white/10 text-gray-400 hover:text-white h-9 text-sm" onClick={() => setAdding(false)}>Cancel</Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Case list */}
      <div className="space-y-2">
        {cases.map((c, i) => (
          <motion.div
            key={c.id}
            initial={{ opacity:0, y:8 }}
            animate={{ opacity:1, y:0 }}
            transition={{ delay: i * 0.05 }}
            className="flex items-center justify-between p-4 rounded-xl bg-[#1a1a22] border border-[#2a2a35]"
          >
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <p className="text-sm font-semibold text-white">{c.disease}</p>
                <Badge className={`text-[10px] ${STATUS_STYLE[c.status]}`}>{c.status}</Badge>
              </div>
              <p className="text-xs text-gray-500">{c.village} · {c.count} case{c.count > 1 ? "s" : ""} · {formatDate(c.date)}</p>
            </div>
            <div className="flex gap-2">
              {c.status === "open" && (
                <Button
                  size="sm"
                  className="h-7 text-xs bg-red-600/80 hover:bg-red-600 text-white"
                  onClick={() => {
                    setCases(cases => cases.map(cr => cr.id === c.id ? {...cr, status:"escalated"} : cr))
                    toast.warning("Case escalated to PHC")
                  }}
                >
                  Escalate
                </Button>
              )}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  )
}
