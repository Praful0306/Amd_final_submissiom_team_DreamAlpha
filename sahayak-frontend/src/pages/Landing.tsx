import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { motion, AnimatePresence, useInView } from "framer-motion"
import {
  Mic, Brain, Shield, Wifi, Cpu, Heart,
  ArrowRight, CheckCircle2, Zap, X,
  Menu, Activity, Users, Globe, Stethoscope,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { useStore } from "@/store/useStore"

// ── Data ──────────────────────────────────────────────────────────────────────

const NAV_LINKS = [
  { label: "Features",     href: "#features" },
  { label: "How It Works", href: "#how" },
  { label: "Live Demo",    href: "#demo", hot: true },
  { label: "ASHA Portal",  href: "#roles", asha: true },
  { label: "Technology",   href: "#tech" },
]

const STATS: Array<{ end: number; suffix: string; label: string; icon: LucideIcon }> = [
  { end: 900, suffix: "M+",    label: "Rural Indians",   icon: Globe },
  { end: 1,   suffix: "M+",    label: "ASHA Workers",    icon: Users },
  { end: 12,  suffix: "",      label: "ICMR Protocols",  icon: Shield },
  { end: 4,   suffix: "-Tier", label: "LLM Fallback",    icon: Zap },
]

const FEATURES: Array<{
  icon: LucideIcon
  title: string
  tag: string
  tagColor: string
  border: string
  icon_bg: string
  icon_color: string
  desc: string
}> = [
  { icon: Mic,    title: "Voice-First Diagnosis",  tag: "Core",     tagColor: "bg-orange-100 text-orange-700",  border: "border-orange-100", icon_bg: "bg-orange-50", icon_color: "text-orange-600", desc: "Describe symptoms in Hindi or English. Groq Whisper ASR transcribes in real-time. No literacy required." },
  { icon: Brain,  title: "AMD Ryzen AI NPU",        tag: "Hardware", tagColor: "bg-purple-100 text-purple-700", border: "border-purple-100", icon_bg: "bg-purple-50", icon_color: "text-purple-600", desc: "Phi-3-Mini runs on-device at 40+ TOPS. Zero cloud dependency for critical decisions in offline villages." },
  { icon: Shield, title: "ICMR Clinical Engine",    tag: "Clinical", tagColor: "bg-green-100 text-green-700",  border: "border-green-100",  icon_bg: "bg-green-50",  icon_color: "text-green-600",  desc: "Every AI output validated against 12 deterministic ICMR/WHO/NVBDCP disease protocols before output." },
  { icon: Wifi,   title: "True Offline Mode",        tag: "Offline",  tagColor: "bg-blue-100 text-blue-700",   border: "border-blue-100",   icon_bg: "bg-blue-50",   icon_color: "text-blue-600",   desc: "IndexedDB + Service Worker + FAISS on-device. Syncs silently when connectivity returns." },
  { icon: Cpu,    title: "4-Tier LLM Chain",          tag: "AI",       tagColor: "bg-red-100 text-red-700",     border: "border-red-100",    icon_bg: "bg-red-50",    icon_color: "text-red-600",    desc: "LLaMA 70B → Mixtral 8×7B → Groq 1 → Groq 2. Automatic fallback ensures response every time." },
  { icon: Heart,  title: "Gamified ASHA Tools",       tag: "UX",       tagColor: "bg-pink-100 text-pink-700",   border: "border-pink-100",   icon_bg: "bg-pink-50",   icon_color: "text-pink-600",   desc: "Impact scoring, achievement badges, maternal health tracking, full UIP immunization schedule." },
]

const STEPS: Array<{ n: string; icon: LucideIcon; color: "orange" | "purple" | "green"; title: string; desc: string }> = [
  { n: "01", icon: Mic,         color: "orange", title: "Speak Symptoms",      desc: "ASHA worker describes patient symptoms in Hindi or English. Works in all Indian dialects." },
  { n: "02", icon: Brain,       color: "purple", title: "AI + ICMR Analysis",  desc: "LLaMA 3.1 70B cross-references with 12 ICMR protocols via FAISS RAG. AMD NPU for on-device inference." },
  { n: "03", icon: Stethoscope, color: "green",  title: "Clinical Decision",    desc: "Risk-stratified diagnosis with ICMR treatment protocol, referral recommendations, and auto-sync." },
]

const ROLES = [
  { role: "patient", title: "Patient",     sub: "Track your health",  featured: false, label: "",             items: ["AI symptom diagnosis", "Medical report (OCR)", "Share with doctor", "Vitals history"],             btn: "bg-blue-600 hover:bg-blue-700 text-white",    badge: "bg-blue-100 text-blue-700"   },
  { role: "asha",    title: "ASHA Worker", sub: "Community guardian", featured: true,  label: "Primary Focus", items: ["Voice diagnosis", "Disease heatmap", "Maternal + immunization", "Govt report generation"],       btn: "bg-orange-600 hover:bg-orange-700 text-white", badge: "bg-orange-100 text-orange-700" },
  { role: "doctor",  title: "Doctor",      sub: "Expert oversight",   featured: false, label: "",             items: ["Secure patient access", "Full medical history", "ASHA case review", "Telehealth tools"],         btn: "bg-green-600 hover:bg-green-700 text-white",  badge: "bg-green-100 text-green-700"  },
]

const TECH = [
  { name: "LLaMA 3.1 70B",    sub: "via AWS Bedrock",       color: "bg-orange-50 text-orange-700 border-orange-200" },
  { name: "AMD Ryzen AI NPU", sub: "40+ TOPS on-device",    color: "bg-red-50 text-red-700 border-red-200" },
  { name: "Groq Whisper",     sub: "Real-time ASR",         color: "bg-yellow-50 text-yellow-700 border-yellow-200" },
  { name: "FAISS RAG",        sub: "ICMR vector search",    color: "bg-blue-50 text-blue-700 border-blue-200" },
  { name: "Firebase Auth",    sub: "Secure login",          color: "bg-purple-50 text-purple-700 border-purple-200" },
  { name: "Gemini 2.5 Flash", sub: "PDF extraction",        color: "bg-green-50 text-green-700 border-green-200" },
  { name: "IndexedDB",        sub: "Offline storage",       color: "bg-gray-50 text-gray-700 border-gray-200" },
  { name: "ICMR Protocols",   sub: "12 disease guidelines", color: "bg-teal-50 text-teal-700 border-teal-200" },
]

// ── ClinicalCard ──────────────────────────────────────────────────────────────

function ClinicalCard() {
  return (
    <motion.div
      animate={{ y: [0, -10, 0] }}
      transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      className="w-full max-w-[420px] bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden"
      style={{ boxShadow: "0 32px 64px -16px rgba(0,0,0,0.15), 0 8px 24px -8px rgba(0,0,0,0.1)" }}
    >
      {/* Browser bar */}
      <div className="bg-gray-100 px-4 py-3 flex items-center gap-2 border-b border-gray-200">
        <span className="w-3 h-3 rounded-full bg-red-400 block" />
        <span className="w-3 h-3 rounded-full bg-yellow-400 block" />
        <span className="w-3 h-3 rounded-full bg-green-400 block" />
        <span className="ml-2 text-xs text-gray-500 font-medium flex-1">
          Sahayak AI — Clinical Dashboard
        </span>
        <span className="bg-green-100 text-green-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
          LOW RISK
        </span>
      </div>

      <div className="p-5 space-y-4">
        {/* Diagnosis banner */}
        <motion.div
          className="bg-orange-50 border border-orange-200 rounded-xl p-4 flex items-start gap-3"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4 }}
        >
          <span className="bg-orange-500 text-white text-[10px] font-bold px-2 py-1 rounded-md shrink-0">
            MEDIUM RISK
          </span>
          <div>
            <div className="text-sm font-semibold text-gray-900">Suspected Viral Fever</div>
            <div className="text-xs text-gray-500 mt-0.5">Based on ICMR STG · 79% confidence</div>
          </div>
        </motion.div>

        {/* Vitals grid */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "BLOOD SUGAR (MG/DL)", value: "126",  sub: "↑ 12 from last visit", subColor: "text-red-500",   delay: 0.6 },
            { label: "HEMOGLOBIN (G/DL)",   value: "11.2", sub: "↑ 0.8 improved",        subColor: "text-green-500", delay: 0.7 },
          ].map((v) => (
            <motion.div
              key={v.label}
              className="bg-gray-50 rounded-xl p-3"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: v.delay }}
            >
              <div className="text-[10px] text-gray-400 uppercase font-medium tracking-wider">
                {v.label}
              </div>
              <div className="text-2xl font-bold text-gray-900 mt-1">{v.value}</div>
              <div className={`text-[11px] mt-0.5 ${v.subColor}`}>{v.sub}</div>
            </motion.div>
          ))}
        </div>

        {/* Bottom metrics */}
        <motion.div
          className="grid grid-cols-3 pt-2 border-t border-gray-100"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.9 }}
        >
          {[
            { val: "98%",    lbl: "SpO2" },
            { val: "118/76", lbl: "BP" },
            { val: "38.4°C", lbl: "Temp" },
          ].map((m, i) => (
            <div
              key={m.lbl}
              className={`text-center py-1 ${i === 1 ? "border-x border-gray-100" : ""}`}
            >
              <div className="text-base font-bold text-gray-900">{m.val}</div>
              <div className="text-[11px] text-gray-400">{m.lbl}</div>
            </div>
          ))}
        </motion.div>
      </div>
    </motion.div>
  )
}

// ── StatCounter ───────────────────────────────────────────────────────────────

function StatCounter({
  end,
  suffix,
  label,
  icon: Icon,
}: {
  end: number
  suffix: string
  label: string
  icon: LucideIcon
}) {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true })
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!isInView) return
    let elapsed = 0
    const duration = 1500
    const step = () => {
      elapsed += 16
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setCount(Math.floor(eased * end))
      if (progress < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }, [isInView, end])

  return (
    <div ref={ref} className="text-center px-6 py-4">
      <Icon className="w-5 h-5 text-orange-500 mx-auto mb-2" />
      <div className="text-3xl font-extrabold text-gray-900">
        {count}
        {suffix}
      </div>
      <div className="text-sm text-gray-500 mt-1">{label}</div>
    </div>
  )
}

// ── LiveDemoModal ─────────────────────────────────────────────────────────────

function LiveDemoModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0)
  const [typing, setTyping] = useState("")
  const fullText =
    "बुखार और सिरदर्द है · Fever and headache for 3 days, temp 38.5°C, no appetite"

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = []
    timers.push(setTimeout(() => setStep(1), 1200))
    timers.push(
      setTimeout(() => {
        setStep(2)
        let i = 0
        const typeInterval = setInterval(() => {
          setTyping(fullText.slice(0, i++))
          if (i > fullText.length) clearInterval(typeInterval)
        }, 40)
      }, 2800)
    )
    timers.push(setTimeout(() => setStep(3), 7000))
    timers.push(setTimeout(() => setStep(4), 10500))
    return () => timers.forEach(clearTimeout)
  }, [])

  const PIPELINE = ["Listen", "Transcribe", "RAG Search", "AI Analysis", "ICMR Check", "Result"]

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h3 className="font-bold text-gray-900">Live Demo — ASHA Diagnosis</h3>
            <p className="text-xs text-gray-500 mt-0.5">Simulating a real patient session</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
          >
            <X className="w-4 h-4 text-gray-600" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Step 1 — Patient selection */}
          <motion.div
            className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 font-bold text-sm">
              PD
            </div>
            <div>
              <div className="text-sm font-semibold text-gray-900">Priya Devi · 28F · Rampur</div>
              <div className="text-xs text-gray-500">Last visit: 2 weeks ago</div>
            </div>
            {step >= 1 && (
              <motion.span
                className="ml-auto bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
              >
                Selected ✓
              </motion.span>
            )}
          </motion.div>

          {/* Step 2 — Voice waveform + typewriter */}
          {step >= 2 && (
            <motion.div
              className="space-y-2"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-xs text-gray-500 font-medium">Recording symptoms…</span>
              </div>
              <div className="flex items-end gap-0.5 h-10 justify-center">
                {Array.from({ length: 40 }).map((_, i) => (
                  <motion.div
                    key={i}
                    className="w-1 bg-orange-500 rounded-full"
                    animate={{ height: [4, Math.random() * 32 + 4, 4] }}
                    transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.04 }}
                  />
                ))}
              </div>
              <p className="text-xs text-gray-700 font-medium bg-gray-50 rounded-lg p-2 min-h-[36px]">
                {typing}
                <span className="animate-pulse">|</span>
              </p>
            </motion.div>
          )}

          {/* Step 3 — Pipeline */}
          {step >= 3 && (
            <motion.div className="space-y-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Processing Pipeline
              </p>
              <div className="flex gap-1.5 flex-wrap">
                {PIPELINE.map((s, i) => (
                  <motion.span
                    key={s}
                    className={`text-xs px-2 py-1 rounded-full font-medium ${
                      i < (step === 3 ? 3 : 6)
                        ? "bg-orange-500 text-white"
                        : "bg-gray-100 text-gray-500"
                    }`}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.15 }}
                  >
                    {s}
                  </motion.span>
                ))}
              </div>
            </motion.div>
          )}

          {/* Step 4 — Result */}
          {step >= 4 && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-3"
            >
              <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="bg-orange-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-md">
                    MEDIUM RISK
                  </span>
                  <span className="text-sm font-bold text-gray-900">Suspected Dengue Fever</span>
                </div>
                <p className="text-xs text-gray-600">
                  ICMR Protocol Applied · NS1 antigen test recommended · Oral rehydration · Monitor
                  platelet count
                </p>
                <div className="flex gap-2 mt-3">
                  <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                    ICMR Validated ✓
                  </span>
                  <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                    87% Confidence
                  </span>
                  <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                    LLaMA 3.1 70B
                  </span>
                </div>
              </div>
            </motion.div>
          )}
        </div>

        <div className="px-6 pb-5">
          <button
            onClick={onClose}
            className="w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors"
          >
            Try with Real Backend →
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ── Landing (main) ────────────────────────────────────────────────────────────

export default function Landing() {
  const navigate = useNavigate()
  const { isAuthenticated, user } = useStore()
  const [menuOpen, setMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [demoOpen, setDemoOpen] = useState(false)
  const featuresRef = useRef<HTMLDivElement>(null)
  const isInView = useInView(featuresRef, { once: true, margin: "-100px" })

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated && user?.role) {
      navigate("/" + user.role)
    }
  }, [isAuthenticated, user, navigate])

  // Navbar scroll shadow
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener("scroll", onScroll)
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  function scrollTo(href: string) {
    if (href.startsWith("#")) {
      document.querySelector(href)?.scrollIntoView({ behavior: "smooth" })
      setMenuOpen(false)
    } else {
      navigate(href)
    }
  }

  const stagger = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.1 } },
  }
  const fadeUp = {
    hidden: { opacity: 0, y: 24 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.5,
        ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
      },
    },
  }

  return (
    <div className="bg-white min-h-screen overflow-x-hidden font-sans">

      {/* ── NAVBAR ── */}
      <nav
        className={`fixed top-0 inset-x-0 z-40 transition-all duration-300 ${
          scrolled
            ? "bg-white/95 backdrop-blur-md shadow-sm border-b border-gray-100"
            : "bg-white/80 backdrop-blur"
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-8 h-16 flex items-center justify-between">
          {/* Logo */}
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="flex items-center gap-2"
          >
            <div className="w-8 h-8 rounded-lg bg-orange-600 flex items-center justify-center text-white font-bold text-sm">
              +
            </div>
            <span className="font-bold text-gray-900 text-lg tracking-tight">
              Sahayak <span className="text-orange-600">AI</span>
            </span>
          </button>

          {/* Desktop nav links */}
          <div className="hidden lg:flex items-center gap-1">
            {NAV_LINKS.map((link) => (
              <button
                key={link.label}
                onClick={() => scrollTo(link.href)}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  link.hot
                    ? "text-orange-600 font-semibold"
                    : link.asha
                    ? "text-orange-600 font-medium"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                }`}
              >
                {link.hot && <span className="mr-1">🎯</span>}
                {link.label}
              </button>
            ))}
          </div>

          {/* Right side actions */}
          <div className="flex items-center gap-3">
            <span className="hidden sm:flex items-center gap-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              Offline-Ready
            </span>
            <button
              onClick={() => navigate("/auth")}
              className="hidden sm:block text-sm text-gray-700 font-medium hover:text-gray-900 transition-colors"
            >
              Sign In
            </button>
            <button
              onClick={() => navigate("/auth")}
              className="bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors shadow-sm"
            >
              Get Started Free
            </button>
            <button
              className="lg:hidden p-2 rounded-lg hover:bg-gray-100"
              onClick={() => setMenuOpen((v) => !v)}
            >
              {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        <AnimatePresence>
          {menuOpen && (
            <motion.div
              className="lg:hidden absolute top-16 inset-x-0 bg-white border-b border-gray-100 shadow-lg"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
            >
              <div className="max-w-7xl mx-auto px-4 py-4 space-y-1">
                {NAV_LINKS.map((link) => (
                  <button
                    key={link.label}
                    onClick={() => scrollTo(link.href)}
                    className="w-full text-left px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
                  >
                    {link.label}
                  </button>
                ))}
                <div className="pt-2 border-t border-gray-100 flex gap-2">
                  <button
                    onClick={() => navigate("/auth")}
                    className="flex-1 py-2 text-sm text-gray-700 border border-gray-200 rounded-xl font-medium"
                  >
                    Sign In
                  </button>
                  <button
                    onClick={() => navigate("/auth")}
                    className="flex-1 py-2 text-sm bg-orange-600 text-white rounded-xl font-semibold"
                  >
                    Get Started
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      {/* ── HERO ── */}
      <section className="pt-28 pb-16 sm:pt-36 sm:pb-24 relative overflow-hidden">
        {/* Decorative gradient blobs */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-orange-50 rounded-full blur-3xl opacity-60 translate-x-1/3 -translate-y-1/3" />
          <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-blue-50 rounded-full blur-3xl opacity-40 -translate-x-1/3 translate-y-1/3" />
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-8 relative">
          <div className="grid lg:grid-cols-[1fr_420px] gap-12 lg:gap-16 items-center">

            {/* Left column */}
            <motion.div className="space-y-6" variants={stagger} initial="hidden" animate="visible">
              <motion.div variants={fadeUp}>
                <span className="inline-flex items-center gap-2 bg-gray-900 text-white text-xs font-medium px-3.5 py-1.5 rounded-full">
                  <Zap className="w-3 h-3 text-orange-400" />
                  SAHAYAK AI 2.0 — AMD SLINGSHOT HACKATHON
                </span>
              </motion.div>

              <motion.h1
                variants={fadeUp}
                className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-gray-900 leading-[1.1] tracking-tight"
              >
                Healthcare AI built for{" "}
                <span className="text-orange-600">Bharat</span>,<br />
                not Silicon Valley.
              </motion.h1>

              <motion.p variants={fadeUp} className="text-lg text-gray-500 max-w-xl leading-relaxed">
                Voice-first, offline clinical AI assistant for ASHA workers and rural patients.
                Powered by ICMR/WHO guidelines, LLaMA 70B, and AMD Ryzen AI —{" "}
                <strong className="text-gray-700">runs without internet</strong>.
              </motion.p>

              <motion.div variants={fadeUp} className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => setDemoOpen(true)}
                  className="flex items-center justify-center gap-2 bg-orange-600 hover:bg-orange-700 text-white font-semibold px-6 py-3 rounded-xl transition-all shadow-lg shadow-orange-200 hover:shadow-orange-300 group"
                >
                  <Zap className="w-4 h-4" />
                  <span>🎯</span>
                  Watch Live Demo
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </button>
                <button
                  onClick={() => navigate("/auth")}
                  className="flex items-center justify-center gap-2 border border-gray-200 text-gray-700 font-semibold px-6 py-3 rounded-xl hover:bg-gray-50 transition-all group"
                >
                  Vitals Analyzer
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </button>
              </motion.div>

              <motion.div variants={fadeUp} className="flex flex-wrap gap-x-5 gap-y-2">
                {["No credit card needed", "Data stays on your device", "Works offline"].map((t) => (
                  <span key={t} className="flex items-center gap-1.5 text-sm text-gray-500">
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                    {t}
                  </span>
                ))}
              </motion.div>
            </motion.div>

            {/* Right column — floating clinical card */}
            <motion.div
              className="flex justify-center lg:justify-end"
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.7, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
            >
              <ClinicalCard />
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── STATS BAR ── */}
      <section className="border-y border-gray-100 bg-gray-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0 divide-gray-200">
            {STATS.map((s) => (
              <StatCounter
                key={s.label}
                end={s.end}
                suffix={s.suffix}
                label={s.label}
                icon={s.icon}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="how" className="py-20 sm:py-28 max-w-6xl mx-auto px-4 sm:px-8">
        <div className="text-center mb-14">
          <span className="text-xs font-semibold uppercase tracking-widest text-orange-600">
            Process
          </span>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mt-2">
            From voice to diagnosis in seconds
          </h2>
          <p className="text-gray-500 mt-3 max-w-2xl mx-auto">
            Three steps. Works even with zero internet. Validated by ICMR protocols.
          </p>
        </div>
        <div className="grid md:grid-cols-3 gap-8">
          {STEPS.map((step, i) => {
            const Icon = step.icon
            const colorMap: Record<string, string> = {
              orange: "bg-orange-50 border-orange-100 text-orange-600",
              purple: "bg-purple-50 border-purple-100 text-purple-600",
              green:  "bg-green-50 border-green-100 text-green-600",
            }
            return (
              <motion.div
                key={step.n}
                className="relative"
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.15 }}
              >
                {i < STEPS.length - 1 && (
                  <div className="hidden md:block absolute top-8 left-full w-full h-0.5 bg-gradient-to-r from-gray-200 to-transparent z-0 translate-x-4" />
                )}
                <div className="relative z-10 bg-white border border-gray-100 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between mb-4">
                    <div
                      className={`w-12 h-12 rounded-xl border flex items-center justify-center ${colorMap[step.color]}`}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className="text-4xl font-extrabold text-gray-100">{step.n}</span>
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2">{step.title}</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">{step.desc}</p>
                </div>
              </motion.div>
            )
          })}
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section id="features" className="py-20 sm:py-28 bg-gray-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-8">
          <div className="text-center mb-14">
            <span className="text-xs font-semibold uppercase tracking-widest text-orange-600">
              Capabilities
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mt-2">
              Built for Real-World Conditions
            </h2>
            <p className="text-gray-500 mt-3 max-w-2xl mx-auto">
              Every feature designed for ASHA workers in villages with poor connectivity, limited
              literacy, and high-stakes decisions.
            </p>
          </div>
          <div ref={featuresRef} className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map((f, i) => {
              const Icon = f.icon
              return (
                <motion.div
                  key={f.title}
                  className={`bg-white border ${f.border} rounded-2xl p-6 hover:shadow-lg transition-all group cursor-default`}
                  initial={{ opacity: 0, y: 20 }}
                  animate={isInView ? { opacity: 1, y: 0 } : {}}
                  transition={{ delay: i * 0.08, duration: 0.5 }}
                  whileHover={{ y: -4 }}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div
                      className={`w-11 h-11 rounded-xl ${f.icon_bg} flex items-center justify-center`}
                    >
                      <Icon className={`w-5 h-5 ${f.icon_color}`} />
                    </div>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${f.tagColor}`}>
                      {f.tag}
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-gray-900 mb-1.5">{f.title}</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">{f.desc}</p>
                </motion.div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ── TECHNOLOGY STACK ── */}
      <section id="tech" className="py-20 sm:py-28 max-w-6xl mx-auto px-4 sm:px-8">
        <div className="text-center mb-12">
          <span className="text-xs font-semibold uppercase tracking-widest text-orange-600">
            Stack
          </span>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mt-2">
            World-Class Technology
          </h2>
          <p className="text-gray-500 mt-3">Production-grade AI infrastructure, not toys.</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {TECH.map((t, i) => (
            <motion.div
              key={t.name}
              className={`border rounded-xl px-4 py-4 text-center ${t.color}`}
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.06 }}
              whileHover={{ scale: 1.03 }}
            >
              <div className="font-bold text-sm">{t.name}</div>
              <div className="text-xs opacity-70 mt-0.5">{t.sub}</div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── ROLE PORTALS ── */}
      <section id="roles" className="py-20 sm:py-28 bg-gray-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-8">
          <div className="text-center mb-14">
            <span className="text-xs font-semibold uppercase tracking-widest text-orange-600">
              Portals
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mt-2">
              One Platform, Three Portals
            </h2>
            <p className="text-gray-500 mt-3">
              Role-based dashboards tailored to each user's context.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {ROLES.map((r, i) => (
              <motion.div
                key={r.role}
                className={`relative bg-white border-2 rounded-2xl p-7 ${
                  r.featured
                    ? "border-orange-300 shadow-lg shadow-orange-100 scale-[1.02]"
                    : "border-gray-100"
                }`}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.12 }}
              >
                {r.featured && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-orange-600 text-white text-[11px] font-bold px-3 py-0.5 rounded-full">
                    {r.label}
                  </span>
                )}
                <div className="mb-4">
                  <h3 className="text-xl font-bold text-gray-900">{r.title}</h3>
                  <p className="text-sm text-gray-500 mt-0.5">{r.sub}</p>
                </div>
                <ul className="space-y-2 mb-6">
                  {r.items.map((item) => (
                    <li key={item} className="flex items-center gap-2 text-sm text-gray-600">
                      <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => navigate("/auth")}
                  className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-all ${r.btn} shadow-sm`}
                >
                  Enter as {r.title}
                </button>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── OFFLINE BANNER ── */}
      <section className="py-16 sm:py-20 bg-gray-900 text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <Wifi className="w-10 h-10 mx-auto mb-4 text-orange-400" />
            <h2 className="text-2xl sm:text-3xl font-extrabold mb-3">Works Where Others Can't</h2>
            <p className="text-gray-400 max-w-2xl mx-auto leading-relaxed">
              57% of Indian villages have unreliable internet. Sahayak AI stores guidelines, patient
              data and AI models locally — ASHA workers never lose access to critical decision
              support.
            </p>
            <div className="flex flex-wrap justify-center gap-4 mt-8">
              {[
                "Full offline capability",
                "Auto-sync on reconnect",
                "FAISS on-device search",
                "0 data sent to cloud*",
              ].map((t) => (
                <span key={t} className="flex items-center gap-1.5 text-sm text-gray-400">
                  <CheckCircle2 className="w-4 h-4 text-green-400" /> {t}
                </span>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-20 sm:py-28 max-w-4xl mx-auto px-4 sm:px-8 text-center">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h2 className="text-3xl sm:text-5xl font-extrabold text-gray-900 mb-4 leading-tight">
            Ready to transform
            <br />
            rural healthcare?
          </h2>
          <p className="text-gray-500 mb-8 text-lg">
            Join ASHA workers and doctors already using Sahayak AI across rural India.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => navigate("/auth")}
              className="bg-orange-600 hover:bg-orange-700 text-white font-bold px-8 py-4 rounded-2xl text-base transition-all shadow-xl shadow-orange-200 hover:shadow-orange-300"
            >
              Get Started Free →
            </button>
            <button
              onClick={() => setDemoOpen(true)}
              className="border-2 border-gray-200 text-gray-700 font-bold px-8 py-4 rounded-2xl text-base hover:bg-gray-50 transition-all"
            >
              Watch Demo
            </button>
          </div>
        </motion.div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="border-t border-gray-100 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 py-10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-orange-600 flex items-center justify-center text-white font-bold text-xs">
              +
            </div>
            <span className="font-bold text-gray-900">Sahayak AI</span>
          </div>
          <p className="text-sm text-gray-400">
            Team DreamAlpha · AMD Slingshot Hackathon 2025 · Built with ❤️ for 900M rural Indians
          </p>
          <div className="flex gap-4 text-sm text-gray-400">
            <button
              onClick={() => navigate("/auth")}
              className="hover:text-gray-700 transition-colors"
            >
              Sign In
            </button>
            <button
              onClick={() => setDemoOpen(true)}
              className="hover:text-gray-700 transition-colors"
            >
              Live Demo
            </button>
          </div>
        </div>
      </footer>

      {/* ── LIVE DEMO MODAL ── */}
      <AnimatePresence>
        {demoOpen && <LiveDemoModal onClose={() => setDemoOpen(false)} />}
      </AnimatePresence>
    </div>
  )
}
