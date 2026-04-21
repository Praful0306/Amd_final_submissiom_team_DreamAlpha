import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { Map, TrendingUp, AlertTriangle } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useStore } from "@/store/useStore"
import { getAnalyticsStats } from "@/lib/api"

interface HeatmapEntry {
  district: string
  count: number
  disease: string
}

const DISEASE_COLORS: Record<string, string> = {
  malaria:    "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  dengue:     "bg-orange-500/20 text-orange-400 border-orange-500/30",
  tb:         "bg-red-500/20 text-red-400 border-red-500/30",
  tuberculosis:"bg-red-500/20 text-red-400 border-red-500/30",
  pneumonia:  "bg-blue-500/20 text-blue-400 border-blue-500/30",
  anaemia:    "bg-pink-500/20 text-pink-400 border-pink-500/30",
  diabetes:   "bg-purple-500/20 text-purple-400 border-purple-500/30",
}

function getColor(disease: string) {
  const key = Object.keys(DISEASE_COLORS).find(k => disease.toLowerCase().includes(k))
  return key ? DISEASE_COLORS[key] : "bg-gray-500/20 text-gray-400 border-gray-500/30"
}

function HeatCell({ entry, max }: { entry: HeatmapEntry; max: number }) {
  const intensity = Math.round((entry.count / max) * 100)
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`p-4 rounded-xl border relative overflow-hidden ${getColor(entry.disease)}`}
    >
      {/* Intensity bar */}
      <div
        className="absolute inset-y-0 left-0 opacity-20 rounded-xl"
        style={{ width: `${intensity}%`, background: "currentColor" }}
      />
      <div className="relative">
        <p className="font-semibold text-sm">{entry.district}</p>
        <p className="text-xs opacity-70 mt-0.5 capitalize">{entry.disease}</p>
        <div className="flex items-center justify-between mt-2">
          <span className="text-lg font-extrabold">{entry.count}</span>
          <span className="text-[10px] opacity-60">cases</span>
        </div>
      </div>
    </motion.div>
  )
}

const SAMPLE_HEATMAP: HeatmapEntry[] = [
  { district: "Varanasi",   count: 12, disease: "Malaria" },
  { district: "Allahabad",  count: 8,  disease: "Dengue" },
  { district: "Lucknow",    count: 15, disease: "Tuberculosis" },
  { district: "Agra",       count: 5,  disease: "Pneumonia" },
  { district: "Kanpur",     count: 9,  disease: "Anaemia" },
  { district: "Gorakhpur",  count: 11, disease: "Malaria" },
  { district: "Bareilly",   count: 4,  disease: "Diabetes" },
  { district: "Jhansi",     count: 7,  disease: "Dengue" },
]

export default function Heatmap() {
  const { user }  = useStore()
  const [data, setData]       = useState<HeatmapEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getAnalyticsStats(user?.id?.toString() ?? "")
      .then((stats) => {
        const hm = stats.district_heatmap
        setData(hm.length > 0 ? hm : SAMPLE_HEATMAP)
      })
      .catch(() => setData(SAMPLE_HEATMAP))
      .finally(() => setLoading(false))
  }, [user?.id])

  const max = Math.max(...data.map(d => d.count), 1)
  const topDisease = data.sort((a, b) => b.count - a.count)[0]

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Disease Map</h2>
        <p className="text-gray-500 mt-0.5">District-level outbreak surveillance</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="bg-[#1a1a22] border-[#2a2a35]">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-extrabold text-white">{data.length}</p>
            <p className="text-xs text-gray-500 mt-1">Districts Tracked</p>
          </CardContent>
        </Card>
        <Card className="bg-[#1a1a22] border-[#2a2a35]">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-extrabold text-white">{data.reduce((s, d) => s + d.count, 0)}</p>
            <p className="text-xs text-gray-500 mt-1">Total Cases</p>
          </CardContent>
        </Card>
        <Card className="bg-[#1a1a22] border-[#2a2a35]">
          <CardContent className="p-4 text-center">
            {topDisease && (
              <>
                <Badge className={`text-xs mb-1 ${getColor(topDisease.disease)}`}>{topDisease.disease}</Badge>
                <p className="text-xs text-gray-500">Dominant disease</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Heatmap grid */}
      <Card className="bg-[#1a1a22] border-[#2a2a35]">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-white flex items-center gap-2">
            <Map className="w-4 h-4 text-brand-400" /> District Heatmap
          </CardTitle>
          <p className="text-xs text-gray-500">Cell intensity represents case count relative to highest-burden district</p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {data.map((entry, i) => (
              <HeatCell key={`${entry.district}-${i}`} entry={entry} max={max} />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Legend */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(DISEASE_COLORS).map(([name, cls]) => (
          <Badge key={name} className={`text-xs capitalize ${cls}`}>{name}</Badge>
        ))}
      </div>
    </div>
  )
}
