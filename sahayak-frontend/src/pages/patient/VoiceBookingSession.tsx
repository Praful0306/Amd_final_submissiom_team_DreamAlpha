/**
 * VoiceBookingSession
 * ──────────────────
 * In-page voice-driven appointment booking.
 * Uses ONLY browser-native Web Speech API (no VAPI SDK, no phone call).
 * AI asks: name → age → phone → preferred time → slot confirm → booked.
 * Multilingual STT/TTS: English (en-IN), Hindi (hi-IN), Kannada (kn-IN).
 */

import { useState, useEffect, useRef, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Mic, MicOff, X, CheckCircle2, Download, Loader2,
  ArrowLeft, PhoneCall, Calendar, Clock, User, Shield,
} from "lucide-react"
import { useStore } from "@/store/useStore"
import { bookAppointment, getMe, getLinkedDoctor, getNextSlots } from "@/lib/api"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

/* ── Types ─────────────────────────────────────────────────────────────────── */
interface ChatMsg { id: number; role: "ai" | "user"; text: string }

type Step =
  | "init"       // loading doctor + slots
  | "name"       // ask name
  | "age"        // ask age
  | "phone"      // ask phone
  | "time"       // ask preferred time
  | "slot_pick"  // time not found — show slot buttons
  | "booking"    // calling API
  | "done"       // success
  | "no_doctor"  // no linked doctor

interface Answers { name: string; age: string; phone: string; time: string }

interface BookingResult {
  token:      string
  name:       string
  age:        string
  phone:      string
  date:       string
  slot:       string
  reason:     string
  doctorName: string
  apptId?:    number
  queued?:    boolean
}

/* ── Language options ──────────────────────────────────────────────────────── */
const LANGS = [
  { code: "en-IN", label: "EN", name: "English" },
  { code: "hi-IN", label: "HI", name: "Hindi"   },
  { code: "kn-IN", label: "KN", name: "Kannada" },
] as const
type LangCode = typeof LANGS[number]["code"]

/* ── Translated prompts ────────────────────────────────────────────────────── */
const PROMPTS: Record<LangCode, {
  greeting: (doc: string, reason: string) => string
  askAge:   (name: string) => string
  askPhone: string
  askTime:  (slots: string) => string
  noSlot:   (slots: string) => string
  confirm:  (time: string, when: string) => string
  success:  (time: string, token: string) => string
  booking:  string
}> = {
  "en-IN": {
    greeting: (doc, reason) =>
      `Hello! I'm your appointment booking assistant. I'll help you book an appointment with ${doc} for ${reason}. What is your full name?`,
    askAge:   name  => `Thank you, ${name}! How old are you?`,
    askPhone:        `Got it! What is your phone number? You can also type it below.`,
    askTime:  slots => `What time would you prefer? Available slots include ${slots} and more. Just say a time like "10 AM" or "2 PM".`,
    noSlot:   slots => `Sorry, that time is not available. Available slots are: ${slots}. Please tap one below.`,
    confirm:  (time, when) => `I found a slot at ${time} ${when}. Confirming your appointment now…`,
    success:  (time, tok)  => `Your appointment is confirmed at ${time}! Your token is ${tok}. Please download your receipt.`,
    booking:  `Please wait, booking your appointment…`,
  },
  "hi-IN": {
    greeting: (doc, reason) =>
      `नमस्ते! मैं आपका अपॉइंटमेंट बुकिंग सहायक हूं। मैं ${doc} के साथ ${reason} के लिए अपॉइंटमेंट बुक करने में मदद करूंगा। आपका पूरा नाम क्या है?`,
    askAge:   name  => `धन्यवाद, ${name}! आपकी उम्र क्या है?`,
    askPhone:        `ठीक है! आपका फोन नंबर क्या है? आप नीचे टाइप भी कर सकते हैं।`,
    askTime:  slots => `आप किस समय उपलब्ध हैं? उपलब्ध स्लॉट हैं: ${slots}। "10 बजे" या "2 बजे" जैसा बोलें।`,
    noSlot:   slots => `माफ करें, वह समय उपलब्ध नहीं है। उपलब्ध स्लॉट: ${slots}। नीचे से चुनें।`,
    confirm:  (time, when) => `${when} ${time} बजे स्लॉट मिला। अपॉइंटमेंट कन्फर्म हो रही है…`,
    success:  (time, tok)  => `आपकी अपॉइंटमेंट ${time} बजे कन्फर्म हो गई! आपका टोकन ${tok} है। रसीद डाउनलोड करें।`,
    booking:  `कृपया प्रतीक्षा करें, अपॉइंटमेंट बुक हो रही है…`,
  },
  "kn-IN": {
    greeting: (doc, reason) =>
      `ನಮಸ್ಕಾರ! ನಾನು ನಿಮ್ಮ ಅಪಾಯಿಂಟ್‌ಮೆಂಟ್ ಬುಕಿಂಗ್ ಸಹಾಯಕ. ${doc} ಅವರೊಂದಿಗೆ ${reason} ಗಾಗಿ ಅಪಾಯಿಂಟ್‌ಮೆಂಟ್ ಬುಕ್ ಮಾಡಲು ಸಹಾಯ ಮಾಡುತ್ತೇನೆ. ನಿಮ್ಮ ಪೂರ್ಣ ಹೆಸರೇನು?`,
    askAge:   name  => `ಧನ್ಯವಾದ, ${name}! ನಿಮ್ಮ ವಯಸ್ಸು ಎಷ್ಟು?`,
    askPhone:        `ಸರಿ! ನಿಮ್ಮ ಫೋನ್ ನಂಬರ್ ಏನು? ನೀವು ಕೆಳಗೆ ಟೈಪ್ ಕೂಡ ಮಾಡಬಹುದು.`,
    askTime:  slots => `ನಿಮಗೆ ಯಾವ ಸಮಯ ಅನುಕೂಲ? ಲಭ್ಯವಿರುವ ಸ್ಲಾಟ್‌ಗಳು: ${slots}. "10 ಗಂಟೆ" ಅಥವಾ "2 ಗಂಟೆ" ಎಂದು ಹೇಳಿ.`,
    noSlot:   slots => `ಕ್ಷಮಿಸಿ, ಆ ಸಮಯ ಲಭ್ಯವಿಲ್ಲ. ಲಭ್ಯವಿರುವ ಸ್ಲಾಟ್‌ಗಳು: ${slots}. ಕೆಳಗಿನಿಂದ ಆಯ್ಕೆ ಮಾಡಿ.`,
    confirm:  (time, when) => `${when} ${time} ಕ್ಕೆ ಸ್ಲಾಟ್ ಸಿಕ್ಕಿದೆ. ಅಪಾಯಿಂಟ್‌ಮೆಂಟ್ ಖಚಿತಪಡಿಸಲಾಗುತ್ತಿದೆ…`,
    success:  (time, tok)  => `ನಿಮ್ಮ ಅಪಾಯಿಂಟ್‌ಮೆಂಟ್ ${time} ಕ್ಕೆ ಖಚಿತಪಡಿಸಲಾಗಿದೆ! ನಿಮ್ಮ ಟೋಕನ್ ${tok}. ರಸೀದಿ ಡೌನ್‌ಲೋಡ್ ಮಾಡಿ.`,
    booking:  `ದಯವಿಟ್ಟು ನಿರೀಕ್ಷಿಸಿ, ಅಪಾಯಿಂಟ್‌ಮೆಂಟ್ ಬುಕ್ ಆಗುತ್ತಿದೆ…`,
  },
}

/* ── Token generator ───────────────────────────────────────────────────────── */
function makeToken() {
  return "SAH-" + Math.floor(100000 + Math.random() * 900000)
}

/* ── Format HH:MM → 12-hour display ───────────────────────────────────────── */
function fmt(slot: string) {
  const [h, m] = slot.split(":").map(Number)
  const ap = h >= 12 ? "PM" : "AM"
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h
  return `${h12}:${m.toString().padStart(2, "0")} ${ap}`
}

/* ── Parse spoken time → nearest available slot ────────────────────────────── */
function spokenToSlot(spoken: string, avail: string[]): string | null {
  if (!avail.length) return null
  const s = spoken.toLowerCase()
  const isPm = /\b(pm|afternoon|evening)\b/.test(s)
  const isAm = /\b(am|morning)\b/.test(s)
  const WORDS: Record<string, number> = {
    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
    "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
    "eleven": 11, "twelve": 12,
  }
  let hour = -1
  const numM = s.match(/\b(\d{1,2})\b/)
  if (numM) hour = parseInt(numM[1])
  else for (const [w, n] of Object.entries(WORDS)) { if (s.includes(w)) { hour = n; break } }
  if (hour === -1) return null
  if (isPm && hour < 12) hour += 12
  if (isAm && hour === 12) hour = 0
  if (!isPm && !isAm && hour > 0 && hour < 8) hour += 12
  const tgt = hour * 60
  return avail.reduce((best, cur) => {
    const [bh, bm] = best.split(":").map(Number)
    const [ch, cm] = cur.split(":").map(Number)
    return Math.abs(ch * 60 + cm - tgt) < Math.abs(bh * 60 + bm - tgt) ? cur : best
  })
}

/* ── TTS helper — with timeout fallback for Chrome onend bug ───────────────── */
function speakText(text: string, lang: string, onEnd?: () => void) {
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text.replace(/\*\*(.*?)\*\*/g, "$1"))
  u.lang  = lang
  u.rate  = 0.88
  u.pitch = 1.05

  let done = false
  const finish = () => {
    if (done) return
    done = true
    onEnd?.()
  }

  u.onend   = finish
  u.onerror = finish  // also trigger callback on error (e.g. no voice available)

  // Chrome bug: onend sometimes never fires — fallback after estimated duration
  const wordCount = text.split(/\s+/).length
  const timeoutMs = Math.max(4000, wordCount * 350 + 1500)
  const timer = setTimeout(finish, timeoutMs)
  u.onend = () => { clearTimeout(timer); finish() }

  window.speechSynthesis.speak(u)
}

/* ── Receipt PDF ───────────────────────────────────────────────────────────── */
async function downloadReceipt(d: BookingResult) {
  const jsPDF = (await import("jspdf")).default
  const doc   = new jsPDF()

  // Blue header
  doc.setFillColor(37, 99, 235)
  doc.rect(0, 0, 210, 38, "F")
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(22); doc.setFont("helvetica", "bold")
  doc.text("Sahayak AI", 15, 16)
  doc.setFontSize(10); doc.setFont("helvetica", "normal")
  doc.text("Appointment Confirmation Receipt", 15, 28)

  // Token
  doc.setTextColor(30, 30, 30)
  doc.setFontSize(30); doc.setFont("helvetica", "bold")
  doc.text(d.token, 105, 60, { align: "center" })
  doc.setFontSize(9); doc.setFont("helvetica", "normal")
  doc.setTextColor(120, 120, 120)
  doc.text("YOUR APPOINTMENT TOKEN", 105, 68, { align: "center" })

  doc.setDrawColor(220, 220, 220)
  doc.line(15, 74, 195, 74)

  const rows: [string, string][] = [
    ["Patient Name", d.name],
    ["Age",          d.age + " years"],
    ["Phone",        d.phone],
    ["Date",         d.date],
    ["Time",         fmt(d.slot)],
    ["Doctor",       d.doctorName || "Doctor"],
    ["Reason",       d.reason],
  ]
  let y = 84
  for (const [label, val] of rows) {
    doc.setTextColor(100); doc.setFont("helvetica", "normal"); doc.setFontSize(10)
    doc.text(label + ":", 20, y)
    doc.setTextColor(20);  doc.setFont("helvetica", "bold")
    doc.text(val, 75, y)
    y += 10
  }

  // Footer note
  doc.setFillColor(239, 246, 255)
  doc.roundedRect(15, y + 6, 180, 22, 3, 3, "F")
  doc.setTextColor(37, 99, 235); doc.setFontSize(8.5); doc.setFont("helvetica", "bold")
  doc.text(
    "Present this token at hospital reception. Staff will verify your name, age & appointment.",
    105, y + 15, { align: "center" },
  )
  doc.text("This token is unique to your booking and cannot be reused.", 105, y + 21, { align: "center" })

  doc.save(`Appointment_${d.token}.pdf`)
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/* Main component                                                              */
/* ═══════════════════════════════════════════════════════════════════════════ */
interface Props {
  onClose:    () => void
  reason:     string
  reasonLabel: string
}

export default function VoiceBookingSession({ onClose, reason, reasonLabel }: Props) {
  const { user } = useStore()

  const [lang,      setLang]      = useState<LangCode>("en-IN")
  const [step,      setStep]      = useState<Step>("init")
  const [msgs,      setMsgs]      = useState<ChatMsg[]>([])
  const [listening, setListening] = useState(false)
  const [speaking,  setSpeaking]  = useState(false)
  const [interim,   setInterim]   = useState("")
  const [textInput, setTextInput] = useState("")
  const [answers,   setAnswers]   = useState<Answers>({ name: "", age: "", phone: "", time: "" })
  const [slots,     setSlots]     = useState<string[]>([])
  const [slotDate,  setSlotDate]  = useState("")
  const [docId,     setDocId]     = useState<number | null>(null)
  const [docName,   setDocName]   = useState("Doctor")
  const [patientId, setPid]       = useState<number | null>(null)
  const [result,    setResult]    = useState<BookingResult | null>(null)
  const [errMsg,    setErrMsg]    = useState("")

  const msgId     = useRef(0)
  const recRef    = useRef<SpeechRecognition | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const stepRef   = useRef<Step>("init")
  const ansRef    = useRef<Answers>({ name: "", age: "", phone: "", time: "" })
  const slotsRef  = useRef<string[]>([])
  const langRef   = useRef<LangCode>("en-IN")   // always current lang for callbacks

  // Keep refs in sync
  useEffect(() => { stepRef.current  = step },    [step])
  useEffect(() => { ansRef.current   = answers }, [answers])
  useEffect(() => { slotsRef.current = slots },   [slots])
  useEffect(() => { langRef.current  = lang  },   [lang])

  /* ── Auto-scroll ── */
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [msgs, interim])

  /* ── Add chat message ── */
  const addMsg = useCallback((role: ChatMsg["role"], text: string) => {
    setMsgs(ms => [...ms, { id: ++msgId.current, role, text }])
  }, [])

  /* ── AI says something: add to chat + speak ── */
  const aiSay = useCallback((text: string, onAfter?: () => void) => {
    addMsg("ai", text)
    setSpeaking(true)
    speakText(text, lang, () => {
      setSpeaking(false)
      onAfter?.()
    })
  }, [addMsg, lang])

  /* ── Start voice recognition — uses langRef so language is always current ── */
  const startRec = useCallback(() => {
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition
    if (!SR) return  // silently fall back to text input
    try {
      recRef.current?.stop()
    } catch { /* ignore */ }

    const rec: SpeechRecognition = new SR()
    rec.lang           = langRef.current   // always current language via ref
    rec.continuous     = false
    rec.interimResults = true

    rec.onstart  = () => setListening(true)
    rec.onresult = (e: SpeechRecognitionEvent) => {
      let fin = "", itr = ""
      for (let i = 0; i < e.results.length; i += 1) {
        const r = e.results[i]
        if (r.isFinal) fin += r[0].transcript
        else           itr += r[0].transcript
      }
      setInterim(itr || fin)
    }
    rec.onend = () => {
      setListening(false)
      setInterim(t => {
        if (t.trim()) submitAnswer(t.trim())
        return ""
      })
    }
    rec.onerror = (e) => {
      // "aborted" is normal when we call stop() manually — ignore it
      if (e.error !== "aborted") setListening(false)
      setInterim("")
    }
    recRef.current = rec
    rec.start()
  }, []) // langRef & submitAnswer accessed via refs/closure — no stale deps

  /* ── Stop recognition ── */
  const stopRec = useCallback(() => {
    recRef.current?.stop()
    setListening(false)
  }, [])

  /* ── Book appointment via backend ── */
  const bookAppt = useCallback(async (slot: string) => {
    setStep("booking")
    const ans = ansRef.current
    const curLang = langRef.current
    try {
      if (!docId || !patientId) throw new Error("Doctor or patient is not ready for booking yet.")
      const data = await bookAppointment({
        doctor_id: docId,
        patient_id: patientId,
        patient_name: ans.name || user?.full_name || user?.name || "Patient",
        patient_phone: ans.phone || user?.phone || "",
        date: slotDate,
        time_slot: slot,
        reason,
      })
      if (!data.success) {
        if (data.free_slots?.length) {
          setSlots(data.free_slots)
          slotsRef.current = data.free_slots
          setStep("slot_pick")
          aiSay(PROMPTS[curLang].noSlot(data.free_slots.map(fmt).join(", ")))
          return
        }
        throw new Error(data.error || data.message || "Could not book appointment")
      }
      const tok  = makeToken()
      const queued = Boolean(data.queued)

      const r: BookingResult = {
        token:      tok,
        name:       ans.name  || user?.full_name || user?.name || "Patient",
        age:        ans.age,
        phone:      ans.phone || user?.phone || "",
        date:       slotDate,
        slot,
        reason:     reasonLabel,
        doctorName: docName,
        apptId:     data.appt_id,
        queued,
      }
      setResult(r)
      setStep("done")
      const successMsg = queued
        ? curLang === "hi-IN"
          ? `आपकी अपॉइंटमेंट रिक्वेस्ट ऑफलाइन सेव हो गई है। नेटवर्क आते ही यह सिंक हो जाएगी। आपका टोकन ${tok} है।`
          : curLang === "kn-IN"
          ? `ನಿಮ್ಮ ಅಪಾಯಿಂಟ್‌ಮೆಂಟ್ ವಿನಂತಿ ಆಫ್ಲೈನ್‌ನಲ್ಲಿ ಉಳಿಸಲಾಗಿದೆ. ನೆಟ್ವರ್ಕ್ ಬಂದಾಗ ಅದು ಸಿಂಕ್ ಆಗುತ್ತದೆ. ನಿಮ್ಮ ಟೋಕನ್ ${tok}.`
          : `Your appointment request has been saved offline and will sync automatically when the network returns. Your token is ${tok}.`
        : PROMPTS[curLang].success(fmt(slot), tok)
      addMsg("ai", `🎉 ${successMsg}`)
      speakText(successMsg, curLang)
      toast.success(queued ? "Appointment saved offline and queued for sync." : "Appointment booked successfully.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not book appointment. Please try again.")
      setStep(slotsRef.current.length ? "slot_pick" : "time")
    }
  }, [docId, patientId, slotDate, reason, reasonLabel, docName, user, addMsg, aiSay])

  /* ── Process user's answer ── */
  const submitAnswer = useCallback((value: string) => {
    if (!value.trim()) return
    addMsg("user", value)
    setTextInput("")
    const cur  = stepRef.current
    const ans  = { ...ansRef.current }
    const p    = PROMPTS[langRef.current]

    if (cur === "name") {
      ans.name = value
      setAnswers(ans)
      setStep("age")
    } else if (cur === "age") {
      ans.age = value
      setAnswers(ans)
      setStep("phone")
    } else if (cur === "phone") {
      ans.phone = value
      setAnswers(ans)
      setStep("time")
    } else if (cur === "time") {
      ans.time = value
      setAnswers(ans)
      const matched = spokenToSlot(value, slotsRef.current)
      if (matched) {
        const when = slotDate === new Date().toISOString().slice(0, 10) ? "today" : "tomorrow"
        aiSay(p.confirm(fmt(matched), when), () => bookAppt(matched))
      } else {
        const list = slotsRef.current.slice(0, 4).map(fmt).join(", ")
        aiSay(p.noSlot(list))
        setStep("slot_pick")
      }
    }
  }, [addMsg, aiSay, bookAppt, slotDate])

  /* ── Drive conversation: re-runs when step changes OR language changes ── */
  useEffect(() => {
    if (!["name","age","phone","time"].includes(step)) return
    // Stop any ongoing recognition before re-speaking
    try { recRef.current?.stop() } catch { /* ignore */ }
    const p = PROMPTS[langRef.current]
    if (step === "name") {
      aiSay(p.greeting(docName, reasonLabel), startRec)
    } else if (step === "age") {
      aiSay(p.askAge(ansRef.current.name), startRec)
    } else if (step === "phone") {
      aiSay(p.askPhone, startRec)
    } else if (step === "time") {
      const preview = slotsRef.current.slice(0, 3).map(fmt).join(", ")
      aiSay(p.askTime(preview), startRec)
    }
  // aiSay changes when lang changes → effect re-runs with new language
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, aiSay])

  /* ── Init: resolve patient → doctor → slots ── */
  useEffect(() => {
    async function init() {
      try {
        // Always fetch from /auth/me to avoid stale Zustand state
        // (e.g. when same browser was used to test both patient & doctor)
        const me = await getMe()
        if (me.role !== "patient" || !me.patient_id) {
          setErrMsg("Please log in as a patient to book appointments.")
          setStep("no_doctor")
          return
        }
        const pid = me.patient_id
        setPid(pid)
        const linked = await getLinkedDoctor(pid)
        if (!linked.doctor_id) {
          setErrMsg("")   // standard "no doctor linked" message
          setStep("no_doctor")
          return
        }
        setDocId(linked.doctor_id)
        setDocName(linked.doctor_name ?? "Doctor")
        const sl = await getNextSlots(linked.doctor_id)
        setSlots(sl.recommended_slots)
        slotsRef.current = sl.recommended_slots
        setSlotDate(sl.recommended_date)
        setStep("name")
      } catch (err) {
        setErrMsg(err instanceof Error ? err.message : "Failed to load session. Please try again.")
        setStep("no_doctor")
      }
    }
    init()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ── Mic button — tapping during AI speech cancels TTS and starts recording ── */
  function handleMic() {
    if (step === "booking") return
    if (speaking) {
      window.speechSynthesis.cancel()
      setSpeaking(false)
      startRec()
      return
    }
    if (listening) stopRec()
    else           startRec()
  }

  /* ── Text send ── */
  function handleSend() {
    const v = textInput.trim()
    if (v) submitAnswer(v)
  }

  /* ── Slot tap (slot_pick step) ── */
  function pickSlot(s: string) {
    addMsg("user", fmt(s))
    const when = slotDate === new Date().toISOString().slice(0, 10) ? "today" : "tomorrow"
    const p = PROMPTS[langRef.current]
    aiSay(p.confirm(fmt(s), when), () => bookAppt(s))
  }

  /* ── Progress ── */
  const STEP_ORDER: Step[] = ["name", "age", "phone", "time", "slot_pick", "booking", "done"]
  const stepIdx = Math.max(0, STEP_ORDER.indexOf(step))

  /* ── No doctor linked ── */
  if (step === "no_doctor") return (
    <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
      className="rounded-3xl border border-amber-500/25 bg-amber-500/5 p-10 text-center space-y-4">
      <div className="w-14 h-14 rounded-2xl bg-amber-500/15 flex items-center justify-center mx-auto">
        <PhoneCall className="w-7 h-7 text-amber-400" />
      </div>
      <div>
        <h3 className="text-lg font-bold text-white">
          {errMsg ? "Session Error" : "No Doctor Linked"}
        </h3>
        <p className="text-sm text-gray-400 mt-1.5 max-w-xs mx-auto leading-relaxed">
          {errMsg
            ? errMsg
            : <>Share your patient code with your doctor first using the <strong className="text-white">Share Access</strong> page, then come back to book.</>
          }
        </p>
      </div>
      <button onClick={onClose}
        className="px-6 py-2.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 border border-amber-500/30 text-sm font-medium transition-all">
        Go Back
      </button>
    </motion.div>
  )

  /* ── Init loading ── */
  if (step === "init") return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
      <p className="text-sm text-gray-500">Setting up your booking session…</p>
    </div>
  )

  /* ── Success / Done ── */
  if (step === "done" && result) return (
    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
      className="rounded-3xl border border-blue-500/25 bg-gradient-to-br from-blue-600/10 via-indigo-600/5 to-transparent overflow-hidden">

      {/* Checkmark header */}
      <div className="pt-8 pb-4 text-center">
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 280, damping: 14 }}
          className="w-20 h-20 rounded-full bg-blue-500/20 border-2 border-blue-500/40 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-10 h-10 text-blue-400" />
        </motion.div>
        <h2 className="text-2xl font-bold text-white">Appointment Confirmed!</h2>
        <p className="text-gray-400 text-sm mt-1">Your booking is complete</p>
      </div>

      {/* Token */}
      <div className="mx-5 mb-4 rounded-2xl bg-blue-500/10 border border-blue-500/20 p-5 text-center">
        <p className="text-[11px] font-bold text-blue-400 uppercase tracking-widest mb-1">Your Token Number</p>
        <p className="text-4xl font-black text-white tracking-widest">{result.token}</p>
        <p className="text-xs text-gray-500 mt-1.5 flex items-center gap-1 justify-center">
          <Shield className="w-3 h-3" /> Show at hospital reception to verify your appointment
        </p>
      </div>

      {/* Details */}
      <div className="mx-5 mb-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
        {([
          { icon: User,     label: "Name",   val: result.name },
          { icon: Calendar, label: "Date",   val: result.date === new Date().toISOString().slice(0,10) ? "Today" : result.date },
          { icon: Clock,    label: "Time",   val: fmt(result.slot) },
          { icon: PhoneCall,label: "Doctor", val: result.doctorName },
        ] as const).map(({ icon: Icon, label, val }) => (
          <div key={label} className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
              <Icon className="w-3.5 h-3.5 text-blue-400" />
            </div>
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-wider">{label}</p>
              <p className="text-sm font-semibold text-white">{val}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="px-5 pb-6 flex gap-3">
        <button onClick={() => downloadReceipt(result)}
          className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm transition-all active:scale-95">
          <Download className="w-4 h-4" /> Download Receipt
        </button>
        <button onClick={onClose}
          className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl border border-white/10 text-gray-400 hover:text-white text-sm transition-all">
          Done
        </button>
      </div>
    </motion.div>
  )

  /* ══════════════════════════════════════════════════════════════════════════
     Main conversation UI
  ══════════════════════════════════════════════════════════════════════════ */
  const inputLocked = speaking || step === "booking"

  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-3xl border border-blue-500/25 bg-[#0d1117] overflow-hidden flex flex-col"
      style={{ minHeight: 520 }}>

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-5 py-4 bg-gradient-to-r from-blue-600/25 via-indigo-600/15 to-transparent border-b border-blue-500/20">
        <button onClick={() => { window.speechSynthesis.cancel(); recRef.current?.stop(); onClose() }}
          className="flex items-center gap-1.5 text-gray-400 hover:text-white text-sm transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="text-center">
          <p className="text-sm font-bold text-white">Book Appointment</p>
          <p className="text-xs text-blue-400 mt-0.5">{docName} · {reasonLabel}</p>
        </div>
        {/* Language selector */}
        <div className="flex gap-1">
          {LANGS.map(l => (
            <button key={l.code} onClick={() => setLang(l.code)}
              className={cn("px-2 py-1 rounded-lg text-xs font-bold transition-all",
                lang === l.code
                  ? "bg-blue-500/30 text-blue-200 border border-blue-500/40"
                  : "text-gray-500 hover:text-gray-300"
              )}>
              {l.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Progress dots ── */}
      <div className="flex items-center justify-center gap-2 pt-4 pb-1">
        {["Name", "Age", "Phone", "Time"].map((lbl, i) => (
          <div key={lbl} className="flex items-center gap-2">
            <div className={cn(
              "flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold transition-all",
              i < stepIdx      ? "bg-blue-600 text-white"
              : i === stepIdx  ? "bg-blue-500/30 border border-blue-400 text-blue-300"
                               : "bg-white/5 text-gray-600"
            )}>
              {i < stepIdx ? "✓" : i + 1}
            </div>
            <span className={cn("text-[10px] hidden sm:block",
              i === stepIdx ? "text-blue-400 font-semibold" : "text-gray-600"
            )}>{lbl}</span>
            {i < 3 && <div className={cn("w-4 h-px", i < stepIdx ? "bg-blue-600" : "bg-white/10")} />}
          </div>
        ))}
      </div>

      {/* ── AI Avatar ── */}
      <div className="flex flex-col items-center py-4 gap-2">
        <div className="relative">
          {(speaking || listening) && [1.5, 2.0, 2.6].map((scale, i) => (
            <span key={i} className={cn(
              "absolute inset-0 rounded-full animate-ping",
              listening ? "bg-red-500" : "bg-blue-500"
            )}
              style={{ transform: `scale(${scale})`, opacity: 0.12, animationDelay: `${i * 0.15}s` }} />
          ))}
          <div className={cn(
            "w-16 h-16 rounded-full flex items-center justify-center relative z-10 transition-all duration-300",
            speaking   ? "bg-blue-500/30 border-2 border-blue-400/70 shadow-lg shadow-blue-500/20"
            : listening ? "bg-red-500/20  border-2 border-red-400/50  shadow-lg shadow-red-500/10"
                        : "bg-blue-500/10 border-2 border-blue-500/20"
          )}>
            {step === "booking"
              ? <Loader2 className="w-7 h-7 text-blue-400 animate-spin" />
              : <PhoneCall className={cn("w-7 h-7", listening ? "text-red-400" : "text-blue-400")} />
            }
          </div>
        </div>
        <p className={cn("text-xs font-medium transition-colors",
          speaking    ? "text-blue-400"
          : listening  ? "text-red-400"
          : step === "booking" ? "text-blue-400"
                       : "text-gray-500"
        )}>
          {speaking ? "Speaking…"
          : listening ? "Listening… tap mic when done"
          : step === "booking" ? "Booking your appointment…"
          : "Tap the mic to speak your answer"}
        </p>
      </div>

      {/* ── Slot picker (slot_pick step) ── */}
      <AnimatePresence>
        {step === "slot_pick" && slots.length > 0 && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
            className="px-5 pb-3">
            <p className="text-xs text-gray-500 text-center mb-2.5">Tap a slot to select:</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {slots.map(s => (
                <button key={s} onClick={() => pickSlot(s)}
                  className="px-4 py-2 rounded-xl border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 text-sm font-semibold transition-all active:scale-95">
                  {fmt(s)}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Chat messages ── */}
      <div ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-2 space-y-3"
        style={{ maxHeight: 220, minHeight: 100 }}>
        {msgs.map(m => (
          <motion.div key={m.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
            className={cn("flex", m.role === "ai" ? "justify-start" : "justify-end")}>
            {m.role === "ai" && (
              <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0 mr-2 mt-0.5">
                <PhoneCall className="w-3 h-3 text-blue-400" />
              </div>
            )}
            <div className={cn(
              "max-w-[78%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
              m.role === "ai"
                ? "bg-[#1a2744] border border-blue-500/20 text-white rounded-tl-sm"
                : "bg-white/[0.08] border border-white/10 text-gray-200 rounded-tr-sm"
            )}>
              {m.text}
            </div>
          </motion.div>
        ))}

        {/* Interim transcript */}
        {interim && (
          <div className="flex justify-end">
            <div className="max-w-[78%] rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm bg-white/[0.04] border border-white/[0.06] text-gray-400 italic">
              {interim}…
            </div>
          </div>
        )}

        {step === "booking" && (
          <div className="flex justify-center">
            <div className="flex items-center gap-2 text-xs text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-full px-4 py-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Booking your appointment…
            </div>
          </div>
        )}
      </div>

      {/* ── Input row ── */}
      <div className="px-4 pb-4 pt-2.5 border-t border-white/[0.06]">
        <div className="flex gap-2">
          <input
            value={textInput}
            onChange={e => setTextInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSend()}
            placeholder={
              inputLocked ? ""
              : step === "phone" ? "Type number or speak…"
              : "Type or speak your answer…"
            }
            disabled={inputLocked}
            className="flex-1 bg-[#161b27] border border-[#1e2d4a] text-white placeholder:text-gray-600 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500/40 disabled:opacity-40 transition-colors"
          />

          {/* Mic */}
          <button onClick={handleMic} disabled={step === "booking"}
            className={cn(
              "w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-all disabled:opacity-40 active:scale-95",
              listening
                ? "bg-red-500/25 border border-red-500/50 text-red-400 shadow-lg shadow-red-500/10"
                : "bg-blue-500/20 border border-blue-500/30 text-blue-400 hover:bg-blue-500/30"
            )}>
            {listening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>

          {/* Send (visible when text typed) */}
          {textInput.trim() && (
            <button onClick={handleSend} disabled={inputLocked}
              className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-all disabled:opacity-40 active:scale-95">
              Send
            </button>
          )}
        </div>

        <p className="text-center text-[10px] text-gray-600 mt-2">
          Speak in <span className="text-gray-500">English</span>, <span className="text-gray-500">Hindi</span> or <span className="text-gray-500">Kannada</span> · Select language above
        </p>
      </div>
    </motion.div>
  )
}
