/**
 * Sahayak AI — Firebase Auth Helpers (lazy-init)
 */
import { initializeApp, getApps, type FirebaseApp } from "firebase/app"
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  signOut as fbSignOut,
  onAuthStateChanged,
  type Auth,
  type User,
} from "firebase/auth"

let _app: FirebaseApp | null = null
let _auth: Auth | null = null

function getFirebaseAuth(): Auth {
  if (_auth) return _auth

  const cfg = {
    apiKey:            import.meta.env.VITE_FIREBASE_API_KEY            as string,
    authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN        as string,
    projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID         as string,
    storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET     as string,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string,
    appId:             import.meta.env.VITE_FIREBASE_APP_ID             as string,
  }

  _app  = getApps().length === 0 ? initializeApp(cfg) : getApps()[0]
  _auth = getAuth(_app)
  return _auth
}

// Kept for code that imports `auth` directly (Sidebar uses clearSession, not auth)
export const auth = { get current() { return getFirebaseAuth() } }

export async function signInWithGoogle(): Promise<{ idToken: string; user: User }> {
  const result = await signInWithPopup(getFirebaseAuth(), new GoogleAuthProvider())
  const idToken = await result.user.getIdToken()
  return { idToken, user: result.user }
}

export async function signOut() {
  await fbSignOut(getFirebaseAuth())
  localStorage.removeItem("sahayak_token")
  localStorage.removeItem("sahayak_role")
  localStorage.removeItem("sahayak_user")
}

export function onAuthChange(callback: (user: User | null) => void) {
  return onAuthStateChanged(getFirebaseAuth(), callback)
}

export function getStoredToken(): string | null {
  return localStorage.getItem("sahayak_token")
}

export function storeSession(token: string, role: string, user: { name: string; id: string | number }) {
  localStorage.setItem("sahayak_token", token)
  localStorage.setItem("sahayak_role", role)
  localStorage.setItem("sahayak_user", JSON.stringify(user))
}

export function clearSession() {
  localStorage.removeItem("sahayak_token")
  localStorage.removeItem("sahayak_role")
  localStorage.removeItem("sahayak_user")
}
