import { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { toast } from "sonner"
import { Share2, Copy, Eye, EyeOff, RefreshCw, Shield, CheckCircle2, Loader2, Lock, Unlock } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { getShareCode, generateShareCode, revokeShareCode } from "@/lib/api"
import { formatDate } from "@/lib/utils"

export default function DoctorAccess() {
  const [code,       setCode]       = useState<string | null>(null)
  const [expires,    setExpires]    = useState<string | null>(null)
  const [active,     setActive]     = useState(true)
  const [visible,    setVisible]    = useState(false)
  const [loading,    setLoading]    = useState(true)
  const [generating, setGenerating] = useState(false)
  const [revoking,   setRevoking]   = useState(false)
  const [copied,     setCopied]     = useState(false)

  async function loadCode() {
    setLoading(true)
    try {
      const res = await getShareCode()
      setCode(res.code)
      setExpires(res.expires_at)
      setActive(res.active)
    } catch {
      // No code yet — that's OK, show generate button
    } finally {
      setLoading(false)
    }
  }

  async function handleGenerate() {
    setGenerating(true)
    try {
      const res = await generateShareCode()
      setCode(res.code)
      setExpires(res.expires_at)
      setActive(true)
      setVisible(true)
      toast.success("New access code generated!")
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not generate code"
      toast.error(msg)
    } finally {
      setGenerating(false)
    }
  }

  async function handleRevoke() {
    if (!code) return
    setRevoking(true)
    try {
      await revokeShareCode()
      setActive(false)
      toast.success("Access revoked — your doctor can no longer view your records")
    } catch {
      toast.error("Could not revoke — please try again")
    } finally {
      setRevoking(false)
    }
  }

  async function handleCopy() {
    if (!code) return
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      toast.success("Code copied to clipboard!")
    } catch {
      // Fallback: select + execCommand for browsers that block clipboard API
      const el = document.createElement("textarea")
      el.value = code
      el.style.position = "fixed"
      el.style.opacity = "0"
      document.body.appendChild(el)
      el.focus()
      el.select()
      document.execCommand("copy")
      document.body.removeChild(el)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      toast.success("Code copied!")
    }
  }

  useEffect(() => { loadCode() }, [])

  return (
    <div className="p-6 max-w-xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Share with Doctor</h2>
        <p className="text-gray-500 mt-0.5">Generate a secure code for your doctor to access your records</p>
      </div>

      {/* How it works */}
      <Card className="bg-[#1a1a22] border-[#2a2a35]">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-gray-400 uppercase tracking-wider">How it works</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[
              { n: "1", text: "Generate a secure 8-character access code below" },
              { n: "2", text: "Share it with your doctor in person or by call" },
              { n: "3", text: "Doctor enters the code in their portal to view your records" },
              { n: "4", text: "Revoke access anytime — doctor loses access immediately" },
            ].map(({ n, text }) => (
              <div key={n} className="flex gap-3 items-start">
                <span className="w-6 h-6 rounded-full bg-brand-500/20 text-brand-400 text-xs font-bold flex items-center justify-center shrink-0">
                  {n}
                </span>
                <p className="text-sm text-gray-400 leading-relaxed">{text}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Code section */}
      <Card className="bg-[#1a1a22] border-[#2a2a35]">
        <CardContent className="p-6">
          {loading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
            </div>
          ) : code ? (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
              {/* Status banner */}
              {!active && (
                <div className="mb-4 flex items-center gap-2 text-sm text-orange-400 bg-orange-500/10 border border-orange-500/20 rounded-xl px-4 py-2">
                  <Lock className="w-4 h-4 shrink-0" />
                  Access revoked — generate a new code to re-enable
                </div>
              )}

              <div className="text-center mb-6">
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Your Access Code</p>
                <div className="relative inline-flex items-center gap-3">
                  <span className={`font-mono text-4xl font-extrabold tracking-[0.2em] ${active ? "text-white" : "text-gray-600"}`}>
                    {visible ? code : "••••••••"}
                  </span>
                  <button
                    onClick={() => setVisible((v) => !v)}
                    className="text-gray-500 hover:text-white transition-colors"
                  >
                    {visible ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                {expires && (
                  <p className="text-xs text-gray-500 mt-2">
                    Valid until: {formatDate(expires)}
                  </p>
                )}
              </div>

              <div className="flex gap-3 mb-3">
                <Button
                  className="flex-1 gap-2 bg-brand-600 hover:bg-brand-700 text-white"
                  onClick={handleCopy}
                  disabled={!active}
                >
                  {copied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copied ? "Copied!" : "Copy Code"}
                </Button>
                <Button
                  variant="outline"
                  className="gap-2 border-white/15 text-gray-400 hover:text-white"
                  onClick={handleGenerate}
                  disabled={generating}
                >
                  {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  New Code
                </Button>
              </div>

              {active ? (
                <Button
                  variant="outline"
                  className="w-full gap-2 border-red-500/30 text-red-400 hover:bg-red-500/10"
                  onClick={handleRevoke}
                  disabled={revoking}
                >
                  {revoking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                  Revoke Access
                </Button>
              ) : (
                <Button
                  className="w-full gap-2 bg-green-600 hover:bg-green-700 text-white"
                  onClick={handleGenerate}
                  disabled={generating}
                >
                  {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unlock className="w-4 h-4" />}
                  Generate New Code
                </Button>
              )}

              <div className="mt-4 flex items-center gap-2 text-xs text-green-400 justify-center">
                <Shield className="w-3.5 h-3.5" />
                Code is encrypted and time-limited (30 days)
              </div>
            </motion.div>
          ) : (
            <div className="text-center py-4">
              <Share2 className="w-12 h-12 text-gray-600 mx-auto mb-4" />
              <p className="text-white font-medium mb-1">No access code yet</p>
              <p className="text-sm text-gray-500 mb-6">Generate a secure code to share your medical records with your doctor</p>
              <Button
                className="bg-brand-600 hover:bg-brand-700 text-white gap-2"
                onClick={handleGenerate}
                disabled={generating}
              >
                {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                Generate Access Code
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
