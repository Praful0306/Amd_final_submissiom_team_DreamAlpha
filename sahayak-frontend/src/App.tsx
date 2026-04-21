import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { lazy, Suspense } from "react"
import { Toaster } from "sonner"
import { AnimatePresence } from "framer-motion"
import { useStore } from "@/store/useStore"
import AppLayout from "@/components/layout/AppLayout"

// ── Lazy pages ────────────────────────────────────────────────────────────────
const Landing      = lazy(() => import("@/pages/Landing"))
const Auth         = lazy(() => import("@/pages/Auth"))

// Patient
const PatientDash    = lazy(() => import("@/pages/patient/Dashboard"))
const UploadReport   = lazy(() => import("@/pages/patient/UploadReport"))
const PatientDiag    = lazy(() => import("@/pages/patient/Diagnosis"))
const PatientRep     = lazy(() => import("@/pages/patient/Reports"))
const DoctorAccess   = lazy(() => import("@/pages/patient/DoctorAccess"))
const PatientProfile = lazy(() => import("@/pages/patient/Profile"))
const CallCenter     = lazy(() => import("@/pages/patient/CallCenter"))

// Doctor
const DoctorDash    = lazy(() => import("@/pages/doctor/Dashboard"))
const PatientDetail = lazy(() => import("@/pages/doctor/PatientDetail"))
const AccessPat     = lazy(() => import("@/pages/doctor/AccessPatient"))
const Appointments  = lazy(() => import("@/pages/doctor/Appointments"))

// ASHA
const AshaDash     = lazy(() => import("@/pages/asha/Dashboard"))
const AshaPatients = lazy(() => import("@/pages/asha/Patients"))
const AshaDiag     = lazy(() => import("@/pages/asha/Diagnosis"))
const Heatmap      = lazy(() => import("@/pages/asha/Heatmap"))
const Tasks        = lazy(() => import("@/pages/asha/Tasks"))
const Reminders    = lazy(() => import("@/pages/asha/Reminders"))
const MaternalHlth = lazy(() => import("@/pages/asha/MaternalHealth"))
const Immunization = lazy(() => import("@/pages/asha/Immunization"))
const Surveillance = lazy(() => import("@/pages/asha/Surveillance"))
const GovReport    = lazy(() => import("@/pages/asha/GovReport"))

// Shared
const Vitals       = lazy(() => import("@/pages/Vitals"))
const Chatbot      = lazy(() => import("@/pages/Chatbot"))

// ── Auth guard ────────────────────────────────────────────────────────────────
function RequireAuth({ role, children }: { role?: string; children: React.ReactNode }) {
  const { isAuthenticated, user } = useStore()
  if (!isAuthenticated) return <Navigate to="/auth" replace />
  if (role && user?.role !== role) {
    const routes: Record<string, string> = { patient: "/patient", doctor: "/doctor", asha: "/asha" }
    return <Navigate to={routes[user?.role ?? ""] ?? "/auth"} replace />
  }
  return <>{children}</>
}

function PageLoader() {
  return (
    <div className="min-h-screen bg-[#0f0f13] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
        <p className="text-gray-500 text-sm">Loading…</p>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
        <AnimatePresence mode="wait">
          <Routes>
            {/* Public */}
            <Route path="/"     element={<Landing />} />
            <Route path="/auth" element={<Auth />} />

            {/* Patient */}
            <Route path="/patient" element={<RequireAuth role="patient"><AppLayout role="patient" /></RequireAuth>}>
              <Route index         element={<PatientDash />} />
              <Route path="upload"  element={<UploadReport />} />
              <Route path="diagnose" element={<PatientDiag />} />
              <Route path="reports"  element={<PatientRep />} />
              <Route path="access"   element={<DoctorAccess />} />
              <Route path="vitals"   element={<Vitals />} />
              <Route path="chat"     element={<Chatbot />} />
              <Route path="call"     element={<CallCenter />} />
              <Route path="profile"  element={<PatientProfile />} />
            </Route>

            {/* Doctor */}
            <Route path="/doctor" element={<RequireAuth role="doctor"><AppLayout role="doctor" /></RequireAuth>}>
              <Route index              element={<DoctorDash />} />
              <Route path="patient/:id" element={<PatientDetail />} />
              <Route path="access"      element={<AccessPat />} />
              <Route path="appointments" element={<Appointments />} />
              <Route path="chat"         element={<Chatbot />} />
            </Route>

            {/* ASHA */}
            <Route path="/asha" element={<RequireAuth role="asha"><AppLayout role="asha" /></RequireAuth>}>
              <Route index               element={<AshaDash />} />
              <Route path="patients"     element={<AshaPatients />} />
              <Route path="diagnose"     element={<AshaDiag />} />
              <Route path="heatmap"      element={<Heatmap />} />
              <Route path="tasks"        element={<Tasks />} />
              <Route path="reminders"    element={<Reminders />} />
              <Route path="maternal"     element={<MaternalHlth />} />
              <Route path="immunization" element={<Immunization />} />
              <Route path="surveillance" element={<Surveillance />} />
              <Route path="report"       element={<GovReport />} />
              <Route path="chat"         element={<Chatbot />} />
            </Route>

            {/* Catch-all */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AnimatePresence>
      </Suspense>

      <Toaster
        position="top-right"
        toastOptions={{
          style: { background: "#1a1a22", border: "1px solid #2a2a35", color: "#f3f4f6" },
        }}
      />
    </BrowserRouter>
  )
}
