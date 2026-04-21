import { useState } from "react"
import { Outlet } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import { Sidebar } from "./Sidebar"
import { Topbar } from "./Topbar"
import { OfflineBar } from "@/components/shared/OfflineBar"

interface AppLayoutProps {
  role: string
}

export default function AppLayout({ role }: AppLayoutProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="flex h-screen bg-[#0f0f13] overflow-hidden">
      {/* Desktop sidebar */}
      <div className="hidden lg:block relative">
        <Sidebar
          role={role}
          collapsed={collapsed}
          onToggle={() => setCollapsed((c) => !c)}
        />
      </div>

      {/* Mobile sidebar overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              key="overlay"
              className="fixed inset-0 bg-black/60 z-40 lg:hidden"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
            />
            <motion.div
              key="mobile-sidebar"
              className="fixed inset-y-0 left-0 z-50 lg:hidden"
              initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            >
              <Sidebar
                role={role}
                collapsed={false}
                onToggle={() => setMobileOpen(false)}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Main content */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <OfflineBar />
        <Topbar onMobileMenu={() => setMobileOpen(true)} />

        <main className="flex-1 overflow-y-auto">
          <motion.div
            key={role}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="h-full"
          >
            <Outlet />
          </motion.div>
        </main>
      </div>
    </div>
  )
}
