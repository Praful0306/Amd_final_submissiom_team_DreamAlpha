import { useState, useEffect } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import {
  Users, Stethoscope, Heart, Mic, Brain, Shield,
  ArrowLeft, Loader2, Eye, EyeOff, Zap
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { signInWithGoogle, storeSession } from "@/lib/auth"
import { firebaseLogin, emailLogin, registerUser } from "@/lib/api"
import { useStore } from "@/store/useStore"

// ── Types ─────────────────────────────────────────────────────────────────────
type Role = "patient" | "doctor" | "asha"
type AuthMode = "select-role" | "login" | "register"

const ROLES = [
  {
    id: "patient" as Role,
    label: "Patient",
    sub: "Track your health",
    icon: Users,
    color: "from-blue-500/20 to-blue-600/5",
    border: "border-blue-500/30",
    active: "ring-2 ring-blue-500 border-blue-500",
  },
  {
    id: "asha" as Role,
    label: "ASHA Worker",
    sub: "Community health guardian",
    icon: Heart,
    color: "from-brand-500/20 to-brand-600/5",
    border: "border-brand-500/30",
    active: "ring-2 ring-brand-500 border-brand-500",
    featured: true,
  },
  {
    id: "doctor" as Role,
    label: "Doctor",
    sub: "Expert medical oversight",
    icon: Stethoscope,
    color: "from-green-500/20 to-green-600/5",
    border: "border-green-500/30",
    active: "ring-2 ring-green-500 border-green-500",
  },
]

const loginSchema = z.object({
  email:    z.string().email("Invalid email"),
  password: z.string().min(6, "Min 6 characters"),
})

const registerSchema = loginSchema.extend({
  name:         z.string().min(2, "Min 2 characters"),
  phone:        z.string().optional(),
  district:     z.string().optional(),
  specialization: z.string().optional(),
})

type LoginForm    = z.infer<typeof loginSchema>
type RegisterForm = z.infer<typeof registerSchema>

// ── Features panel (left side) ────────────────────────────────────────────────
const FEATURES = [
  { icon: Mic,    text: "Voice diagnosis in Hindi + English" },
  { icon: Brain,  text: "LLaMA 3.1 70B + AMD Ryzen AI NPU" },
  { icon: Shield, text: "12 ICMR disease protocols validated" },
]

export default function Auth() {
  const navigate      = useNavigate()
  const [params]      = useSearchParams()
  const { setAuth }   = useStore()

  const initialRole = (params.get("role") as Role) ?? null
  const [role,     setRole]   = useState<Role | null>(initialRole)
  const [mode,     setMode]   = useState<AuthMode>(initialRole ? "login" : "select-role")
  const [loading,  setLoading]= useState(false)
  const [showPwd,  setShowPwd]= useState(false)

  const loginForm = useForm<LoginForm>({ resolver: zodResolver(loginSchema) })
  const regForm   = useForm<RegisterForm>({ resolver: zodResolver(registerSchema) })

  const ROLE_ROUTES: Record<Role, string> = {
    patient: "/patient",
    doctor:  "/doctor",
    asha:    "/asha",
  }

  function handleRoleSelect(r: Role) {
    setRole(r)
    setMode("login")
  }

  // ── Google login ─────────────────────────────────────────────────────────
  async function handleGoogle() {
    if (!role) return
    setLoading(true)
    try {
      const { idToken } = await signInWithGoogle()
      const res = await firebaseLogin(idToken, role)
      const displayName = res.full_name ?? res.name ?? "User"
      storeSession(res.access_token, res.role, { name: displayName, id: res.user_id })
      setAuth({ id: res.user_id, patient_id: res.patient_id ?? null, name: displayName, role: res.role as Role }, res.access_token)
      toast.success(`Welcome, ${displayName}!`)
      navigate(ROLE_ROUTES[res.role as Role], { replace: true })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Google login failed")
    } finally {
      setLoading(false)
    }
  }

  // ── Email login ──────────────────────────────────────────────────────────
  async function handleLogin(data: LoginForm) {
    if (!role) return
    setLoading(true)
    try {
      const res = await emailLogin(data.email, data.password)
      const displayName = res.full_name ?? res.name ?? "User"
      storeSession(res.access_token, res.role, { name: displayName, id: res.user_id })
      setAuth({ id: res.user_id, patient_id: res.patient_id ?? null, name: displayName, role: res.role as Role }, res.access_token)
      toast.success(`Welcome back, ${displayName}!`)
      navigate(ROLE_ROUTES[res.role as Role], { replace: true })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Login failed")
    } finally {
      setLoading(false)
    }
  }

  // ── Email register ───────────────────────────────────────────────────────
  async function handleRegister(data: RegisterForm) {
    if (!role) return
    setLoading(true)
    try {
      const payload = { ...data, role }
      const res = await registerUser(payload)
      const displayName = res.full_name ?? res.name ?? data.name ?? "User"
      storeSession(res.access_token, res.role, { name: displayName, id: res.user_id })
      setAuth({ id: res.user_id, patient_id: res.patient_id ?? null, name: displayName, role: res.role as Role }, res.access_token)
      toast.success(`Account created! Welcome, ${displayName}!`)
      navigate(ROLE_ROUTES[res.role as Role], { replace: true })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Registration failed")
    } finally {
      setLoading(false)
    }
  }

  const selectedRole = ROLES.find((r) => r.id === role)

  return (
    <div className="min-h-screen bg-[#0f0f13] flex flex-col lg:flex-row">

      {/* ── Left panel ──────────────────────────────────────────────────────── */}
      <div className="hidden lg:flex flex-col justify-between w-[45%] bg-gradient-to-br from-brand-900/30 via-[#0f0f13] to-purple-900/20 p-12 border-r border-white/5">
        {/* Logo */}
        <button onClick={() => navigate("/")} className="flex items-center gap-2 group">
          <div className="w-9 h-9 rounded-xl bg-brand-600 flex items-center justify-center">
            <Heart className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold text-white group-hover:text-brand-300 transition-colors">Sahayak AI</span>
        </button>

        {/* Hero text */}
        <div>
          <motion.h2
            initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            className="text-5xl font-extrabold text-white leading-tight mb-4"
          >
            Healthcare<br />
            <span className="gradient-text">Without Barriers</span>
          </motion.h2>
          <motion.p
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
            className="text-gray-400 text-lg mb-10 leading-relaxed"
          >
            AI-powered clinical support for ASHA workers serving rural India — offline-first, voice-first.
          </motion.p>
          <div className="space-y-4">
            {FEATURES.map((f, i) => {
              const Icon = f.icon
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.5 + i * 0.1 }}
                  className="flex items-center gap-3 text-gray-300"
                >
                  <div className="w-8 h-8 rounded-lg bg-brand-500/15 border border-brand-500/25 flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4 text-brand-400" />
                  </div>
                  {f.text}
                </motion.div>
              )
            })}
          </div>
        </div>

        <p className="text-gray-600 text-sm">Team DreamAlpha · AMD Slingshot 2025</p>
      </div>

      {/* ── Right panel ─────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 min-h-screen lg:min-h-0">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <button onClick={() => navigate("/")} className="flex items-center gap-2 mb-8 lg:hidden">
            <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center">
              <Heart className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-white">Sahayak AI</span>
          </button>

          <AnimatePresence mode="wait">

            {/* ── Step 1: Role selection ─────────────────────────────────────── */}
            {mode === "select-role" && (
              <motion.div
                key="roles"
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
              >
                <h1 className="text-3xl font-bold text-white mb-2">Sign In</h1>
                <p className="text-gray-400 mb-8">Choose your role to continue</p>

                <div className="space-y-3">
                  {ROLES.map((r) => {
                    const Icon = r.icon
                    return (
                      <motion.button
                        key={r.id}
                        onClick={() => handleRoleSelect(r.id)}
                        whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
                        className={cn(
                          "w-full flex items-center gap-4 p-4 rounded-xl border bg-gradient-to-br transition-all text-left",
                          r.color, r.border,
                          "hover:brightness-110"
                        )}
                      >
                        <div className="w-11 h-11 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
                          <Icon className="w-5 h-5 text-white" />
                        </div>
                        <div className="flex-1">
                          <div className="font-semibold text-white flex items-center gap-2">
                            {r.label}
                            {r.featured && (
                              <span className="text-[10px] font-bold bg-brand-500/30 text-brand-300 px-1.5 py-0.5 rounded border border-brand-500/30">
                                PRIMARY
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-400 mt-0.5">{r.sub}</div>
                        </div>
                        <ArrowLeft className="w-4 h-4 text-gray-500 rotate-180" />
                      </motion.button>
                    )
                  })}
                </div>

                <p className="text-center text-sm text-gray-600 mt-8">
                  By signing in you agree to our terms of service and privacy policy.
                </p>
              </motion.div>
            )}

            {/* ── Step 2: Login / Register ───────────────────────────────────── */}
            {(mode === "login" || mode === "register") && role && (
              <motion.div
                key="form"
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
              >
                {/* Back button */}
                <button
                  onClick={() => { setMode("select-role"); setRole(null) }}
                  className="flex items-center gap-2 text-sm text-gray-500 hover:text-white mb-6 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Change role
                </button>

                {/* Role badge */}
                {selectedRole && (
                  <div className={cn(
                    "inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm mb-6",
                    selectedRole.border,
                    `bg-gradient-to-r ${selectedRole.color}`
                  )}>
                    <selectedRole.icon className="w-4 h-4 text-white" />
                    <span className="text-white font-medium">{selectedRole.label}</span>
                  </div>
                )}

                <h1 className="text-3xl font-bold text-white mb-1">
                  {mode === "login" ? "Welcome Back" : "Create Account"}
                </h1>
                <p className="text-gray-400 mb-8">
                  {mode === "login" ? "Sign in to your account" : "Get started in minutes"}
                </p>

                {/* Google button */}
                <Button
                  type="button"
                  variant="outline"
                  className="w-full mb-4 border-white/15 hover:bg-white/5 text-white h-11 gap-2"
                  onClick={handleGoogle}
                  disabled={loading}
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  Continue with Google
                </Button>

                <div className="flex items-center gap-3 mb-4">
                  <div className="flex-1 h-px bg-white/10" />
                  <span className="text-xs text-gray-600">or with email</span>
                  <div className="flex-1 h-px bg-white/10" />
                </div>

                {/* Register extra fields */}
                {mode === "register" && (
                  <div className="space-y-3 mb-4">
                    {/* Full name */}
                    <div>
                      <Label htmlFor="name" className="text-gray-300 text-sm mb-1.5 block">Full Name *</Label>
                      <Input
                        id="name"
                        placeholder={role === "doctor" ? "Dr. Arjun Sharma" : role === "asha" ? "Sunita Devi" : "Priya Sharma"}
                        className="bg-white/5 border-white/15 text-white placeholder:text-gray-600 h-11"
                        {...regForm.register("name")}
                      />
                      {regForm.formState.errors.name && (
                        <p className="text-xs text-red-400 mt-1">{regForm.formState.errors.name.message}</p>
                      )}
                    </div>

                    {/* Phone — mandatory for all roles */}
                    <div>
                      <Label htmlFor="phone" className="text-gray-300 text-sm mb-1.5 block">
                        Mobile Number *
                        <span className="text-gray-600 font-normal ml-1.5">(for SMS health alerts)</span>
                      </Label>
                      <div className="flex gap-2">
                        <span className="flex items-center px-3 bg-white/5 border border-white/15 rounded-lg text-gray-400 text-sm whitespace-nowrap">🇮🇳 +91</span>
                        <Input
                          id="phone"
                          type="tel"
                          placeholder="9876543210"
                          maxLength={10}
                          className="bg-white/5 border-white/15 text-white placeholder:text-gray-600 h-11"
                          {...regForm.register("phone")}
                        />
                      </div>
                    </div>

                    {/* Doctor-specific: specialization */}
                    {role === "doctor" && (
                      <div>
                        <Label htmlFor="specialization" className="text-gray-300 text-sm mb-1.5 block">Specialization</Label>
                        <Input
                          id="specialization"
                          placeholder="General Medicine / Paediatrics…"
                          className="bg-white/5 border-white/15 text-white placeholder:text-gray-600 h-11"
                          {...regForm.register("specialization")}
                        />
                      </div>
                    )}

                    {/* ASHA-specific: district */}
                    {role === "asha" && (
                      <div>
                        <Label htmlFor="district" className="text-gray-300 text-sm mb-1.5 block">District / Block</Label>
                        <Input
                          id="district"
                          placeholder="Sitapur, Uttar Pradesh"
                          className="bg-white/5 border-white/15 text-white placeholder:text-gray-600 h-11"
                          {...regForm.register("district")}
                        />
                      </div>
                    )}
                  </div>
                )}

                <div className="mb-4">
                  <Label htmlFor="email" className="text-gray-300 text-sm mb-1.5 block">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    className="bg-white/5 border-white/15 text-white placeholder:text-gray-600 h-11"
                    {...(mode === "login" ? loginForm.register("email") : regForm.register("email"))}
                  />
                  {(mode === "login" ? loginForm.formState.errors.email : regForm.formState.errors.email) && (
                    <p className="text-xs text-red-400 mt-1">
                      {(mode === "login" ? loginForm.formState.errors.email : regForm.formState.errors.email)?.message}
                    </p>
                  )}
                </div>

                <div className="mb-6">
                  <Label htmlFor="password" className="text-gray-300 text-sm mb-1.5 block">Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPwd ? "text" : "password"}
                      placeholder="••••••••"
                      className="bg-white/5 border-white/15 text-white placeholder:text-gray-600 h-11 pr-10"
                      {...(mode === "login" ? loginForm.register("password") : regForm.register("password"))}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPwd((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
                    >
                      {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <Button
                  className="w-full h-11 bg-brand-600 hover:bg-brand-700 text-white font-semibold"
                  disabled={loading}
                  onClick={
                    mode === "login"
                      ? loginForm.handleSubmit(handleLogin)
                      : regForm.handleSubmit(handleRegister)
                  }
                >
                  {loading ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Please wait…</>
                  ) : mode === "login" ? "Sign In" : "Create Account"}
                </Button>

                <div className="relative flex items-center gap-3 my-2">
                  <div className="flex-1 h-px bg-gray-700" />
                  <span className="text-xs text-gray-500">or</span>
                  <div className="flex-1 h-px bg-gray-700" />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const demoNames = {
                      patient: "Priya Devi",
                      doctor:  "Dr. Arjun Sharma",
                      asha:    "Sunita ASHA Worker",
                    }
                    setAuth(
                      {
                        id: 1,
                        name: demoNames[role as keyof typeof demoNames] ?? "Demo User",
                        role: role as "patient" | "doctor" | "asha",
                      },
                      "demo_token"
                    )
                    navigate("/" + role)
                  }}
                  className="w-full flex items-center justify-center gap-2 border border-dashed border-orange-500/50 text-orange-400 hover:bg-orange-500/10 rounded-xl py-2.5 text-sm font-medium transition-colors"
                >
                  <Zap className="w-4 h-4" />
                  Try Demo (No Backend Needed)
                </button>

                <p className="text-center text-sm text-gray-500 mt-5">
                  {mode === "login" ? "No account? " : "Already have one? "}
                  <button
                    type="button"
                    className="text-brand-400 hover:text-brand-300 font-medium transition-colors"
                    onClick={() => setMode(mode === "login" ? "register" : "login")}
                  >
                    {mode === "login" ? "Create one" : "Sign in"}
                  </button>
                </p>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
