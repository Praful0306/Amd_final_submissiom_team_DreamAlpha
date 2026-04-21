import { useState } from "react"
import { motion } from "framer-motion"
import { FileText, Download, CheckCircle2, Loader2, Calendar } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { toast } from "sonner"
import { useStore } from "@/store/useStore"

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
]

const REPORT_SECTIONS = [
  { id:"anc",       label:"ANC Registration & Visits",   value:94  },
  { id:"immun",     label:"Immunization Coverage",        value:88  },
  { id:"disease",   label:"Disease Surveillance",         value:100 },
  { id:"nutrition", label:"Nutrition (IFA/Vit A)",        value:76  },
  { id:"birth",     label:"Birth & Death Registration",   value:91  },
  { id:"referral",  label:"Referral Transport (JSY/JSSK)", value:85 },
]

export default function GovReport() {
  const { user }      = useStore()
  const [month,    setMonth]    = useState(MONTHS[new Date().getMonth()])
  const [year,     setYear]     = useState(new Date().getFullYear().toString())
  const [loading,  setLoading]  = useState(false)
  const [generated, setGenerated] = useState(false)

  async function handleGenerate() {
    setLoading(true)
    await new Promise(r => setTimeout(r, 2000)) // Simulate generation
    setLoading(false)
    setGenerated(true)
    toast.success("Report generated successfully!")
  }

  const years = ["2024","2025","2026"]

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Government Report</h2>
        <p className="text-gray-500 mt-0.5">Monthly HMIS / MCTS submission ready</p>
      </div>

      {/* Config */}
      <Card className="bg-[#1a1a22] border-[#2a2a35]">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Report Parameters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-gray-400 text-xs mb-1.5 block">Month</Label>
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1a22] border-[#2a2a35]">
                  {MONTHS.map(m => <SelectItem key={m} value={m} className="text-white focus:bg-white/10">{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-gray-400 text-xs mb-1.5 block">Year</Label>
              <Select value={year} onValueChange={setYear}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1a22] border-[#2a2a35]">
                  {years.map(y => <SelectItem key={y} value={y} className="text-white focus:bg-white/10">{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button
            className="w-full h-11 bg-brand-600 hover:bg-brand-700 text-white font-semibold gap-2"
            onClick={handleGenerate}
            disabled={loading}
          >
            {loading
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating Report…</>
              : <><FileText className="w-4 h-4" /> Generate {month} {year} Report</>
            }
          </Button>
        </CardContent>
      </Card>

      {/* Coverage summary */}
      <Card className="bg-[#1a1a22] border-[#2a2a35]">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-white">Coverage Summary — {month} {year}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {REPORT_SECTIONS.map((s, i) => (
            <motion.div
              key={s.id}
              initial={{ opacity:0, x:-10 }}
              animate={{ opacity:1, x:0 }}
              transition={{ delay: i * 0.07 }}
            >
              <div className="flex justify-between text-sm mb-1.5">
                <span className="text-gray-400">{s.label}</span>
                <span className={`font-medium ${s.value >= 90 ? "text-green-400" : s.value >= 75 ? "text-yellow-400" : "text-red-400"}`}>
                  {s.value}%
                </span>
              </div>
              <Progress
                value={s.value}
                className="h-2 bg-white/10"
              />
            </motion.div>
          ))}
        </CardContent>
      </Card>

      {/* Download section */}
      {generated && (
        <motion.div initial={{ opacity:0, scale:0.95 }} animate={{ opacity:1, scale:1 }}>
          <Card className="bg-green-500/5 border-green-500/25">
            <CardContent className="p-5">
              <div className="flex items-center gap-4 flex-wrap">
                <CheckCircle2 className="w-8 h-8 text-green-500 shrink-0" />
                <div className="flex-1">
                  <p className="font-semibold text-white">Report Ready</p>
                  <p className="text-sm text-gray-400">ASHA Monthly Report — {month} {year}</p>
                  <p className="text-xs text-gray-500 mt-0.5">Worker: {user?.name} · Includes HMIS & MCTS format</p>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button className="gap-2 bg-green-600 hover:bg-green-700 text-white h-9 text-sm">
                    <Download className="w-4 h-4" /> Download PDF
                  </Button>
                  <Button variant="outline" className="gap-2 border-white/10 text-gray-400 hover:text-white h-9 text-sm">
                    <Download className="w-4 h-4" /> Download CSV
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  )
}
