/**
 * Sahayak AI — API Client
 * Typed wrappers for all backend endpoints.
 * Base URL: VITE_API_URL env var (defaults to same-origin / dev proxy)
 */
import {
  ensureOfflineSyncListeners,
  isOfflineNetworkError,
  queueMutation,
} from "@/lib/offline"

// Use VITE_API_URL if set (e.g. production), else proxy via /api (Vite dev proxy strips prefix)
const BASE = (import.meta.env.VITE_API_URL as string) || "/api"
ensureOfflineSyncListeners()

// ── Helpers ───────────────────────────────────────────────────────────────────

function getToken(): string | null {
  return localStorage.getItem("sahayak_token")
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  signal?: AbortSignal
): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = {}
  if (token) headers["Authorization"] = `Bearer ${token}`
  if (body !== undefined && !(body instanceof FormData)) {
    headers["Content-Type"] = "application/json"
  }

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body:
      body instanceof FormData
        ? body
        : body !== undefined
        ? JSON.stringify(body)
        : undefined,
    signal,
  })

  if (!res.ok) {
    // 401 = expired/invalid token — remove it so retries go unauthenticated
    if (res.status === 401) {
      localStorage.removeItem("sahayak_token")
      clearPatientIdCache()
    }
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    const detail = Array.isArray(err.detail)
      ? err.detail.map((e: { loc?: string[]; msg?: string }) => `${(e.loc || []).join(".")}: ${e.msg}`).join(", ")
      : (err.detail ?? `HTTP ${res.status}`)
    throw new Error(String(detail))
  }
  return res.json() as Promise<T>
}

const get  = <T>(path: string, signal?: AbortSignal) => request<T>("GET",    path, undefined, signal)
const post = <T>(path: string, body: unknown, signal?: AbortSignal) => request<T>("POST",   path, body, signal)
const patch = <T>(path: string, body: unknown) => request<T>("PATCH",  path, body)

async function postForm<T>(path: string, formData: FormData): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = {}
  if (token) headers["Authorization"] = `Bearer ${token}`
  const res = await fetch(`${BASE}${path}`, { method: "POST", headers, body: formData })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    const detail = Array.isArray(err.detail)
      ? err.detail.map((e: { loc?: string[]; msg?: string }) => `${(e.loc || []).join(".")}: ${e.msg}`).join(", ")
      : (err.detail ?? `HTTP ${res.status}`)
    throw new Error(String(detail))
  }
  return res.json() as Promise<T>
}

async function queueableJsonMutation<T>(
  method: "POST" | "PATCH" | "PUT",
  path: string,
  body: unknown,
  offlineResponse: T
): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (token) headers["Authorization"] = `Bearer ${token}`

  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }))
      throw new Error(String(err.detail ?? `HTTP ${res.status}`))
    }
    return res.json() as Promise<T>
  } catch (error) {
    if (!isOfflineNetworkError(error)) throw error
    await queueMutation(`${BASE}${path}`, method, body, headers)
    return offlineResponse
  }
}

// ── Auth ─────────────────────────────────────────────────────────────────────

export interface AuthResponse {
  access_token: string
  token_type: string
  user_id: number | string
  patient_id?: number | null   // SQLite patients.id — different from user_id
  role: string
  name?: string       // not always present
  full_name?: string  // backend uses full_name
}

export const firebaseLogin = (id_token: string, role: string) =>
  post<AuthResponse>("/auth/firebase-login", { id_token, role })

export const emailLogin = (email: string, password: string) =>
  post<AuthResponse>("/auth/login", { email, password })

export const registerUser = (data: {
  name: string; email: string; password: string; role: string
  specialization?: string; registration_number?: string; hospital?: string
  district?: string; village?: string; age?: number; gender?: string; phone?: string
}) => post<AuthResponse>("/auth/register", data)

export const getMe = () => get<{ id: number; patient_id?: number | null; full_name: string; email: string; role: string; share_code?: string }>("/auth/me")

// In-memory cache so we don't hit /auth/me on every save
let _cachedPatientId: number | null = null

/**
 * Resolve the correct SQLite patients.id for the current user.
 * Priority: in-memory cache → session store → /auth/me (authoritative).
 * Throws if it cannot be determined (prevents saving to wrong patient).
 */
export async function resolvePatientId(user: { id: string | number; patient_id?: number | null }): Promise<number> {
  // 1. In-memory (fastest — within page session)
  if (_cachedPatientId && _cachedPatientId > 0) return _cachedPatientId

  // 2. SessionStorage (survives page navigations)
  const cached = sessionStorage.getItem("sahayak_patient_id")
  if (cached && !isNaN(Number(cached)) && Number(cached) > 0) {
    _cachedPatientId = Number(cached)
    return _cachedPatientId
  }

  // 3. From login response stored in Zustand
  if (user.patient_id && user.patient_id > 0) {
    _cachedPatientId = user.patient_id
    sessionStorage.setItem("sahayak_patient_id", String(user.patient_id))
    return user.patient_id
  }

  // 4. Always-authoritative: /auth/me (correct even for old sessions)
  const me = await getMe()
  if (me.patient_id && me.patient_id > 0) {
    _cachedPatientId = me.patient_id
    sessionStorage.setItem("sahayak_patient_id", String(me.patient_id))
    return me.patient_id
  }

  throw new Error("Patient profile not found. Please log out and log in again.")
}

/** Call this on logout to clear the cached patient_id */
export function clearPatientIdCache() {
  _cachedPatientId = null
  sessionStorage.removeItem("sahayak_patient_id")
}

// ── Diagnosis ────────────────────────────────────────────────────────────────

export interface DiagnosisResult {
  risk_level: string
  diagnosis: string | null
  disease_name: string | null
  confidence_pct: number | null
  clinical_summary: string | null
  recommendations: string[] | null
  action_items: string[] | null
  medications_suggested: string[] | null
  warning_signs: string[] | null
  followup_days: number | null
  sources: string[] | null
  community_alert: string | null
}

export const diagnose = (payload: {
  symptoms: string
  patient_id?: number | string | null
  patient_name?: string
  vitals?: string
  additional_context?: string
  lang?: string
}) => post<DiagnosisResult>("/diagnose/", payload)

export interface ExtractionResponse {
  success: boolean
  data?: Record<string, unknown>
  fields_filled?: number
  completion_pct?: number
  missing_fields?: string[]
  interpretation?: string[]
  red_flags?: string[]
  abnormal_count?: number
  error?: string
}

export const extractFile = (file: File) => {
  const fd = new FormData()
  fd.append("file", file)
  return postForm<ExtractionResponse>("/upload-report", fd)
}

export const tts = (text: string, lang = "en") =>
  post<{ audio_url: string; text: string }>("/diagnose/tts", { text, lang })

// ── Patient ───────────────────────────────────────────────────────────────────

export interface Patient {
  id: number
  name: string
  age: number
  gender: string
  phone?: string
  village?: string
  district?: string
  blood_group?: string
  weight_kg?: number
  medical_history?: string
  is_pregnant?: boolean
  risk_level?: string
  last_risk_level?: string   // returned by /doctor/patients
  last_report_date?: string  // ISO date of most-recent report
  total_reports?: number     // count of uploaded reports
  health_score?: number
  diagnosis?: string         // last diagnosis / current condition
  share_code?: string
  created_at?: string
}

export interface MedicalReport {
  id: number
  patient_id: number
  // Frontend-normalized field names (used in all charts/pages)
  bp_systolic?: number; bp_diastolic?: number
  heart_rate?: number; spo2?: number; temperature?: number
  blood_sugar_fasting?: number; blood_sugar_pp?: number
  hemoglobin?: number; creatinine?: number; weight_kg?: number
  // Raw DB field names (as returned by backend — normalized by getReports)
  bp?: string          // "120/80" format
  hr?: number
  temp?: number
  sugar_fasting?: number
  sugar_post?: number
  cholesterol?: number
  ai_risk_level?: string
  ai_summary?: string
  notes?: string
  symptoms?: string
  medications?: string
  diagnosis?: string
  risk_level?: string
  is_ai_extracted?: boolean | number
  created_at?: string
}

export const getPatientProfile = (id: number | string) =>
  get<Patient>(`/patient/${id}`)

export interface ProfileUpdateResult {
  success: boolean
  patient_id: number
  message: string
  queued?: boolean
}

export const updateProfile = (id: number | string, data: Partial<Patient>) =>
  queueableJsonMutation<ProfileUpdateResult>("POST", `/patients/${id}/profile`, data, {
    success: true,
    patient_id: Number(id),
    message: "Profile saved offline and queued for sync",
    queued: true,
  })

export interface LinkedDoctor {
  doctor_id:      number | null
  doctor_name:    string | null
  specialization: string | null
  hospital:       string | null
}
export const getLinkedDoctor = (patientId: number | string) =>
  get<LinkedDoctor>(`/patients/${patientId}/my-doctor`)

export interface NextSlots {
  doctor_id:       number
  today_date:      string
  today_slots:     string[]
  tomorrow_date:   string
  tomorrow_slots:  string[]
  recommended_date:  string
  recommended_slots: string[]
}
export const getNextSlots = (doctorId: number) =>
  get<NextSlots>(`/appointments/next-slots?doctor_id=${doctorId}`)

export interface AppointmentItem {
  id:           number
  date:         string
  time:         string
  patient_id:   number | null
  patient_name: string
  phone:        string
  reason:       string
  status:       string
  is_manual:    boolean
  is_today:     boolean
}

export interface AppointmentMutationResult {
  success: boolean
  appt_id?: number
  date?: string
  time?: string
  doctor_id?: number
  message?: string
  error?: string
  free_slots?: string[]
  queued?: boolean
}
export const getDoctorAppointments = (doctorId: number, days = 7) =>
  get<AppointmentItem[]>(`/appointments/list?doctor_id=${doctorId}&days=${days}`)

export const bookAppointment = (data: {
  doctor_id: number
  patient_id?: number | null
  patient_name?: string
  patient_phone?: string
  date: string
  time_slot: string
  reason?: string
  firebase_uid?: string
}) => queueableJsonMutation<AppointmentMutationResult>(
  "POST",
  "/appointments/book",
  data,
  {
    success: true,
    appt_id: -Date.now(),
    date: data.date,
    time: data.time_slot,
    doctor_id: data.doctor_id,
    message: "Appointment saved offline and queued for sync",
    queued: true,
  }
)

export const addManualAppointment = (data: {
  doctor_id: number; patient_name: string; patient_phone?: string
  patient_id?: number; date: string; time_slot: string; reason?: string
}) => queueableJsonMutation<{ success: boolean; appt_id?: number; message?: string; error?: string; queued?: boolean }>(
  "POST",
  "/appointments/manual-add",
  data,
  {
    success: true,
    message: "Appointment saved offline and queued for sync",
    queued: true,
  }
)

/** Payload that matches the backend SaveFullReportRequest model exactly */
export interface SaveReportPayload {
  patient_id: number
  bp?: string
  hr?: string
  temp?: string
  spo2?: string
  weight_kg?: string
  sugar_fasting?: string
  sugar_post?: string
  hemoglobin?: string
  creatinine?: string
  cholesterol?: string
  symptoms?: string
  medical_history?: string
  diagnosis?: string
  medications?: string
  notes?: string
  risk_level?: string
  is_ai_extracted?: number
  report_title?: string
  report_type?: string
  firebase_uid?: string
  asha_worker_id?: number
}

/** Save report — throws if backend returns success:false (e.g. DB error).
 *  Deliberately omits the Authorization header: patient_id is already resolved
 *  securely by resolvePatientId(). Sending an expired token would cause 401. */
export const saveReport = async (data: SaveReportPayload): Promise<{ success: boolean; db_id?: number | null }> => {
  const result = await queueableJsonMutation<{ success: boolean; db_id?: number | null; error?: string; queued?: boolean }>(
    "POST",
    "/reports/save-full",
    data,
    {
      success: true,
      db_id: null,
      queued: true,
    }
  )
  if (!result.success) throw new Error(result.error || "Failed to save report to database")
  return result
}

/** Fetch reports and normalize backend field names → frontend field names. */
export const getReports = async (patientId: number | string): Promise<MedicalReport[]> => {
  const raw = await get<MedicalReport[]>(`/patient/${patientId}/reports`)
  return raw.map(r => {
    // Parse bp string "120/80" → bp_systolic / bp_diastolic
    let bpSys = r.bp_systolic, bpDia = r.bp_diastolic
    if (!bpSys && r.bp) {
      const parts = String(r.bp).split("/")
      bpSys = parseInt(parts[0]) || undefined
      bpDia = parseInt(parts[1]) || undefined
    }
    return {
      ...r,
      heart_rate:          r.heart_rate          ?? r.hr,
      temperature:         r.temperature         ?? r.temp,
      blood_sugar_fasting: r.blood_sugar_fasting ?? r.sugar_fasting,
      bp_systolic:         bpSys,
      bp_diastolic:        bpDia,
      risk_level:          r.risk_level          || r.ai_risk_level,
    }
  })
}

// Auth-level share-code endpoints (no patient ID needed — JWT identifies the user)
export const getShareCode = (_?: unknown) =>
  get<{ code: string; active: boolean; expires_at: string | null; patient_id: number }>("/auth/share-code")

export const generateShareCode = (_?: unknown) =>
  post<{ code: string; active: boolean; expires_at: string | null; message: string }>("/auth/generate-share-code", {})

export const revokeShareCode = (_?: unknown) =>
  post<{ message: string; active: boolean }>("/auth/revoke-share-code", {})

// ── Doctor ────────────────────────────────────────────────────────────────────

export const getDoctorPatients = async (): Promise<Patient[]> => {
  const raw = await get<Array<Patient & { last_risk_level?: string }>>("/doctor/patients")
  return raw.map(p => ({ ...p, risk_level: p.risk_level ?? p.last_risk_level }))
}

export interface AccessPatientResult {
  patient_id: number
  patient_name: string
  message: string
}

export const accessPatient = (code: string) =>
  post<AccessPatientResult>("/doctor/access-patient", { share_code: code.toUpperCase().trim() })


// ── ASHA ──────────────────────────────────────────────────────────────────────

export const getMyPatients = () =>
  get<Patient[]>("/patients/my-patients")

export const registerPatient = (data: Partial<Patient> & { asha_firebase_uid?: string }) =>
  queueableJsonMutation<{ success: boolean; patient_id: number; share_code: string; name: string; phone?: string; message: string; queued?: boolean }>(
    "POST",
    "/patients/create-by-asha",
    {
      name:              data.name,
      phone:             (data as Record<string, unknown>).phone as string || "",
      age:               data.age,
      gender:            data.gender,
      village:           data.village,
      district:          data.district,
      blood_group:       data.blood_group,
      medical_history:   data.medical_history,
      is_pregnant:       data.is_pregnant,
      asha_firebase_uid: data.asha_firebase_uid,
    },
    {
      success: true,
      patient_id: -Date.now(),
      share_code: "PENDING_SYNC",
      name: data.name ?? "Patient",
      phone: data.phone,
      message: "Patient saved offline and queued for sync",
      queued: true,
    }
  ).then(res => ({ ...res, id: res.patient_id, age: data.age ?? 0, gender: data.gender ?? "", risk_level: "PENDING" } as unknown as Patient))

export interface SyncStatus {
  status: string
  supabase_configured: boolean
  pending: number
  failed: number
  syncing: number
  synced: number
  last_synced_at?: string | null
  remote_table: string
  setup_sql?: string
  records_found?: number
  records_pushed?: number
  errors?: number
  message?: string
}

export const getGovernmentSyncStatus = () =>
  get<SyncStatus>("/sync/status")

export const flushGovernmentSync = () =>
  post<SyncStatus>("/sync/flush", {})

export const proactiveAgent = () =>
  post<{ message: string; priority_patients: Patient[]; alerts: string[] }>("/agent/proactive", {})

export const getAnalyticsStats = (uid: string) =>
  get<{
    total_patients: number
    high_risk_count: number
    diagnoses_today: number
    reports_today: number
    disease_distribution: Record<string, number>
    district_heatmap: Array<{ district: string; count: number; disease: string }>
  }>(`/analytics/stats?uid=${uid}`)

export const getDeepImpact = (uid: string) =>
  get<{ impact_score: number; badges: string[]; summary: string }>(`/deep_impact?uid=${uid}`)

// ── Chat ──────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: "user" | "assistant"
  content: string
}

export const chat = (messages: ChatMessage[], role: string, lang = "en") =>
  post<{ response: string }>("/chat", { messages, role, lang })

// ── Voice Form Fill ───────────────────────────────────────────────────────────

export interface VoiceFormResult {
  success: boolean
  form: {
    patient_name?: string | null
    age?: number | null
    gender?: string | null
    village?: string | null
    bp?: string | null
    sugar?: number | null
    hb?: number | null
    temp?: number | null
    hr?: number | null
    spo2?: number | null
    symptoms?: string | null
    diagnosis?: string | null
    medications?: string | null
    notes?: string | null
  }
  fields_filled?: number
  filled_by_voice?: boolean
  original_text?: string
  error?: string
}

export const fillFormFromVoice = (text: string) =>
  post<VoiceFormResult>("/voice/fill-form", { text })

// ── VAPI ─────────────────────────────────────────────────────────────────────

export interface TriggerVapiCallPayload {
  patient_name: string
  patient_phone?: string
  patient_id?: number | string | null
  call_type?: string
  lang?: "kn" | "hi" | "en"
  asha_name?: string
  query?: string
  asha_phone?: string
}

export interface TriggerVapiCallResult {
  success: boolean
  call_id?: string
  status?: string
  message?: string
  error?: string
  demo?: boolean
  demo_mode?: boolean
  phone?: string
  patient_name?: string
}

export const triggerVapiCall = (payload: TriggerVapiCallPayload) =>
  post<TriggerVapiCallResult>("/vapi/call-patient", payload)

// ── Transcribe ────────────────────────────────────────────────────────────────

export const transcribe = (audioBlob: Blob, lang = "en") => {
  const fd = new FormData()
  fd.append("file", audioBlob, "audio.webm")
  fd.append("language", lang)
  return postForm<{ text: string; duration?: number; language?: string }>("/transcribe/", fd)
}

// ── Referral ──────────────────────────────────────────────────────────────────

export const generateReferral = (data: {
  patient_id: number | string
  diagnosis: string
  urgency: string
  notes?: string
}) => post<{ referral_id: string; pdf_url?: string }>("/referral/", data)
