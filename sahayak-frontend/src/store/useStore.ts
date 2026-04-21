/**
 * Sahayak AI — Global Zustand Store
 */
import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { Patient } from "@/lib/api"
import { clearPatientIdCache } from "@/lib/api"

interface User {
  id: string | number       // auth user_id (users table)
  patient_id?: number | null // SQLite patients.id (different from id!)
  name: string
  full_name?: string
  email?: string
  role: "patient" | "doctor" | "asha"
  firebase_uid?: string
  phone?: string
}

interface AppStore {
  // Auth
  user: User | null
  token: string | null
  isAuthenticated: boolean
  setAuth: (user: User, token: string) => void
  clearAuth: () => void

  // Theme
  theme: "dark" | "light"
  toggleTheme: () => void

  // Online/Offline
  isOnline: boolean
  setOnline: (v: boolean) => void

  // Current patient (for ASHA/Doctor working with a patient)
  activePatient: Patient | null
  setActivePatient: (p: Patient | null) => void

  // ASHA selected patient for diagnosis
  diagnosisPatientId: number | null
  setDiagnosisPatientId: (id: number | null) => void

  // Language preference
  lang: string
  setLang: (l: string) => void

  // NPU status
  npuActive: boolean
  setNpuActive: (v: boolean) => void
}

export const useStore = create<AppStore>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      setAuth: (user, token) =>
        set({ user, token, isAuthenticated: true }),
      clearAuth: () => {
        clearPatientIdCache()
        set({ user: null, token: null, isAuthenticated: false, activePatient: null })
      },

      theme: "dark",
      toggleTheme: () =>
        set((s) => ({ theme: s.theme === "dark" ? "light" : "dark" })),

      isOnline: navigator.onLine,
      setOnline: (v) => set({ isOnline: v }),

      activePatient: null,
      setActivePatient: (p) => set({ activePatient: p }),

      diagnosisPatientId: null,
      setDiagnosisPatientId: (id) => set({ diagnosisPatientId: id }),

      lang: "en",
      setLang: (l) => set({ lang: l }),

      npuActive: false,
      setNpuActive: (v) => set({ npuActive: v }),
    }),
    {
      name: "sahayak-store",
      partialize: (s) => ({
        user: s.user,
        token: s.token,
        isAuthenticated: s.isAuthenticated,
        theme: s.theme,
        lang: s.lang,
      }),
    }
  )
)
