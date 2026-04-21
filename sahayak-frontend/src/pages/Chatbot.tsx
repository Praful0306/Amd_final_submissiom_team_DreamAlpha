import { useState, useRef, useEffect, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Send, Loader2, Volume2, VolumeX, Bot, User as UserIcon, Mic } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { VoiceButton } from "@/components/shared/VoiceButton"
import { chat, type ChatMessage } from "@/lib/api"
import { useStore } from "@/store/useStore"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

/* ── Voice gender picker ─────────────────────────────────────────────────── */
type VoiceGender = "female" | "male"

function pickVoice(gender: VoiceGender): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices()
  if (!voices.length) return null

  // Priority lists — most natural/human-like first
  const femalePriority = [
    "Google UK English Female",
    "Microsoft Aria Online (Natural) - English (United States)",
    "Microsoft Zira - English (United States)",
    "Samantha",
    "Karen",
    "Moira",
    "Tessa",
    "Fiona",
  ]
  const malePriority = [
    "Google UK English Male",
    "Microsoft Guy Online (Natural) - English (United States)",
    "Microsoft David - English (United States)",
    "Daniel",
    "Alex",
    "Fred",
    "Ralph",
  ]

  const priority = gender === "female" ? femalePriority : malePriority

  for (const name of priority) {
    const v = voices.find(v => v.name === name)
    if (v) return v
  }

  // Fallback: any voice matching gender keyword
  const keyword = gender === "female" ? /female|woman|girl/i : /male|man|guy/i
  const fallback = voices.find(v => keyword.test(v.name))
  if (fallback) return fallback

  // Last resort: first English voice
  return voices.find(v => v.lang.startsWith("en")) ?? voices[0]
}

/* ── Speak function using Web Speech API ─────────────────────────────────── */
function speakText(text: string, gender: VoiceGender, onEnd: () => void): () => void {
  window.speechSynthesis.cancel()

  // Strip markdown before speaking
  const clean = text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/#{1,6}\s/g, "")
    .replace(/\n{2,}/g, ". ")
    .replace(/\n/g, ", ")

  const utter = new SpeechSynthesisUtterance(clean)
  utter.rate  = 0.92   // slightly slower = clearer
  utter.pitch = gender === "female" ? 1.1 : 0.9
  utter.volume = 1

  const voice = pickVoice(gender)
  if (voice) utter.voice = voice

  utter.onend = onEnd
  utter.onerror = onEnd
  window.speechSynthesis.speak(utter)

  return () => window.speechSynthesis.cancel()
}

/* ── Markdown → structured JSX renderer ─────────────────────────────────── */
function MessageContent({ text }: { text: string }) {
  // Split into numbered list items vs plain paragraphs
  const lines = text.split("\n").filter(l => l.trim())

  const renderInline = (str: string) => {
    // Convert **bold** to <strong>
    const parts = str.split(/(\*\*[^*]+\*\*)/)
    return parts.map((p, i) =>
      p.startsWith("**") && p.endsWith("**")
        ? <strong key={i} className="text-white font-semibold">{p.slice(2, -2)}</strong>
        : <span key={i}>{p}</span>
    )
  }

  const isNumbered = (l: string) => /^\d+\.\s/.test(l.trim())
  const isHeader   = (l: string) => /^#{1,3}\s/.test(l.trim())

  // Group consecutive numbered items together
  type Block = { type: "list"; items: string[] } | { type: "para"; text: string } | { type: "heading"; text: string }
  const blocks: Block[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i].trim()
    if (isNumbered(line)) {
      const items: string[] = []
      while (i < lines.length && isNumbered(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s*/, ""))
        i++
      }
      blocks.push({ type: "list", items })
    } else if (isHeader(line)) {
      blocks.push({ type: "heading", text: line.replace(/^#{1,3}\s*/, "") })
      i++
    } else {
      blocks.push({ type: "para", text: line })
      i++
    }
  }

  return (
    <div className="space-y-2.5">
      {blocks.map((block, bi) => {
        if (block.type === "heading") {
          return (
            <p key={bi} className="text-sm font-bold text-white/90 mt-1">
              {renderInline(block.text)}
            </p>
          )
        }
        if (block.type === "list") {
          return (
            <ol key={bi} className="space-y-1.5">
              {block.items.map((item, ii) => (
                <li key={ii} className="flex gap-2.5 text-sm leading-relaxed">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-brand-500/20 text-brand-400 text-[10px] font-bold flex items-center justify-center mt-0.5">
                    {ii + 1}
                  </span>
                  <span className="text-gray-200">{renderInline(item)}</span>
                </li>
              ))}
            </ol>
          )
        }
        return (
          <p key={bi} className="text-sm leading-relaxed text-gray-200">
            {renderInline(block.text)}
          </p>
        )
      })}
    </div>
  )
}

/* ── Voice selector toggle ───────────────────────────────────────────────── */
function VoiceToggle({ gender, onChange }: { gender: VoiceGender; onChange: (g: VoiceGender) => void }) {
  return (
    <div className="flex items-center gap-1 bg-white/[0.05] border border-white/10 rounded-xl p-0.5">
      {(["female", "male"] as VoiceGender[]).map(g => (
        <button
          key={g}
          onClick={() => onChange(g)}
          className={cn(
            "px-3 py-1 rounded-lg text-xs font-semibold transition-all",
            gender === g
              ? g === "female"
                ? "bg-pink-500/20 text-pink-300 border border-pink-500/30"
                : "bg-blue-500/20 text-blue-300 border border-blue-500/30"
              : "text-gray-500 hover:text-gray-300"
          )}
        >
          {g === "female" ? "♀ Female" : "♂ Male"}
        </button>
      ))}
    </div>
  )
}

/* ── Quick prompts ───────────────────────────────────────────────────────── */
const QUICK_PROMPTS: Record<string, string[]> = {
  patient: [
    "What are symptoms of dengue fever?",
    "How do I take my blood pressure medicine?",
    "When should I see a doctor immediately?",
  ],
  asha: [
    "How to identify severe malaria?",
    "ANC schedule for first trimester",
    "ORS preparation steps in Hindi",
    "DOTS protocol for TB patient",
  ],
  doctor: [
    "Chloroquine dosing for P. vivax",
    "IDA protocol for Hb < 7 g/dL",
    "When to refer dengue to hospital?",
  ],
}

/* ── Main component ──────────────────────────────────────────────────────── */
export default function Chatbot() {
  const { user, lang } = useStore()
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: `Namaste${user?.full_name || user?.name ? `, ${(user?.full_name || user?.name || "").split(" ")[0]}` : ""}! I'm Sahayak AI. Ask me anything about health, symptoms or medications. How can I help you today?` }
  ])
  const [input,    setInput]    = useState("")
  const [loading,  setLoading]  = useState(false)
  const [speaking, setSpeaking] = useState<number | null>(null)
  const [gender,   setGender]   = useState<VoiceGender>("female")
  const bottomRef  = useRef<HTMLDivElement>(null)
  const stopRef    = useRef<(() => void) | null>(null)

  const role    = user?.role ?? "patient"
  const prompts = QUICK_PROMPTS[role] ?? QUICK_PROMPTS.patient

  // Load voices on mount (Chrome loads them async)
  useEffect(() => {
    if (typeof window === "undefined") return
    const load = () => {} // just triggers re-render on voice load
    window.speechSynthesis.addEventListener("voiceschanged", load)
    return () => window.speechSynthesis.removeEventListener("voiceschanged", load)
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // Stop speaking when component unmounts
  useEffect(() => () => { window.speechSynthesis?.cancel() }, [])

  async function send(text: string) {
    if (!text.trim()) return
    const userMsg: ChatMessage = { role: "user", content: text.trim() }
    setMessages(m => [...m, userMsg])
    setInput("")
    setLoading(true)
    try {
      const res = await chat([...messages, userMsg], role, lang)
      setMessages(m => [...m, { role: "assistant", content: res.response }])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chat error")
    } finally {
      setLoading(false)
    }
  }

  function handleSpeak(content: string, index: number) {
    // Stop current speech
    if (speaking !== null) {
      stopRef.current?.()
      if (speaking === index) { setSpeaking(null); return }
    }
    setSpeaking(index)
    stopRef.current = speakText(content, gender, () => setSpeaking(null))
  }

  return (
    <div className="flex flex-col h-full max-h-[calc(100vh-4rem)]">

      {/* ── Header ── */}
      <div className="px-6 py-3 border-b border-[#2a2a35] flex items-center gap-3 flex-wrap">
        <div className="w-9 h-9 rounded-xl bg-brand-500/15 flex items-center justify-center shrink-0">
          <Bot className="w-5 h-5 text-brand-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-bold text-white">Health Chat</h2>
          <p className="text-xs text-gray-500">LLaMA 3.1 70B · ICMR Knowledge Base</p>
        </div>
        {/* Voice selector */}
        <VoiceToggle gender={gender} onChange={g => { setGender(g); window.speechSynthesis.cancel(); setSpeaking(null) }} />
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-xs text-green-400">Online</span>
        </div>
      </div>

      {/* ── Messages ── */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4">

        {/* Quick prompts */}
        {messages.length === 1 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {prompts.map((p) => (
              <button
                key={p}
                onClick={() => send(p)}
                className="text-xs text-gray-400 bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-1.5 rounded-full transition-colors"
              >
                {p}
              </button>
            ))}
          </div>
        )}

        {messages.map((msg, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn("flex gap-3", msg.role === "user" ? "ml-auto flex-row-reverse max-w-[82%]" : "max-w-[92%]")}
          >
            {/* Avatar */}
            <div className={cn(
              "w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5",
              msg.role === "user" ? "bg-brand-500/15" : "bg-[#2a2a35]"
            )}>
              {msg.role === "user"
                ? <UserIcon className="w-4 h-4 text-brand-400" />
                : <Bot className="w-4 h-4 text-gray-400" />
              }
            </div>

            {/* Bubble */}
            <div className={cn(
              "rounded-2xl px-4 py-3",
              msg.role === "user"
                ? "bg-brand-600 text-white rounded-tr-sm text-sm leading-relaxed"
                : "bg-[#1a1a22] border border-[#2a2a35] text-gray-200 rounded-tl-sm"
            )}>
              {msg.role === "user"
                ? msg.content
                : <MessageContent text={msg.content} />
              }

              {/* Speak button */}
              {msg.role === "assistant" && (
                <button
                  onClick={() => handleSpeak(msg.content, i)}
                  className={cn(
                    "mt-3 flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border transition-all",
                    speaking === i
                      ? "bg-brand-500/15 border-brand-500/30 text-brand-400"
                      : "bg-white/[0.04] border-white/10 text-gray-500 hover:text-gray-300 hover:border-white/20"
                  )}
                >
                  {speaking === i
                    ? <><Volume2 className="w-3 h-3 animate-pulse" /> Speaking…</>
                    : <><Volume2 className="w-3 h-3" /> Listen</>
                  }
                </button>
              )}
            </div>
          </motion.div>
        ))}

        {/* Typing indicator */}
        {loading && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex gap-3 max-w-[88%]">
            <div className="w-8 h-8 rounded-xl bg-[#2a2a35] flex items-center justify-center shrink-0">
              <Bot className="w-4 h-4 text-gray-400" />
            </div>
            <div className="bg-[#1a1a22] border border-[#2a2a35] rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1.5">
              {[0,1,2].map(d => (
                <motion.span key={d} className="w-1.5 h-1.5 rounded-full bg-gray-500"
                  animate={{ y: [0, -4, 0] }} transition={{ duration: 0.6, delay: d * 0.15, repeat: Infinity }} />
              ))}
            </div>
          </motion.div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── Input ── */}
      <div className="px-4 sm:px-6 py-4 border-t border-[#2a2a35] bg-[#0f0f13]">
        <div className="flex gap-3 items-end">
          <VoiceButton onResult={send} compact className="shrink-0" />
          <div className="flex-1 flex gap-2">
            <Input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !e.shiftKey && send(input)}
              placeholder="Type a health question…"
              className="flex-1 bg-[#1a1a22] border-[#2a2a35] text-white placeholder:text-gray-600 focus:border-brand-500/50"
            />
            <Button
              onClick={() => send(input)}
              disabled={loading || !input.trim()}
              className="bg-brand-600 hover:bg-brand-700 text-white px-4"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
