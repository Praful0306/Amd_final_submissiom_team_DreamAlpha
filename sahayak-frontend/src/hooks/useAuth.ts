import { useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { useStore } from "@/store/useStore"

const ROLE_ROUTES: Record<string, string> = {
  patient: "/patient",
  doctor:  "/doctor",
  asha:    "/asha",
}

/**
 * Returns current auth state and redirects unauthenticated users to /auth.
 * Pass `requiredRole` to also enforce role-based access.
 */
export function useAuth(requiredRole?: string) {
  const { user, isAuthenticated } = useStore()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isAuthenticated) {
      navigate("/auth", { replace: true })
      return
    }
    if (requiredRole && user?.role !== requiredRole) {
      const redirectTo = ROLE_ROUTES[user?.role ?? ""] ?? "/auth"
      navigate(redirectTo, { replace: true })
    }
  }, [isAuthenticated, user, requiredRole, navigate])

  return { user, isAuthenticated }
}

/** Redirect already-authenticated users away from /auth */
export function useRedirectIfAuthed() {
  const { user, isAuthenticated } = useStore()
  const navigate = useNavigate()

  useEffect(() => {
    if (isAuthenticated && user) {
      const redirectTo = ROLE_ROUTES[user.role] ?? "/"
      navigate(redirectTo, { replace: true })
    }
  }, [isAuthenticated, user, navigate])
}
