import { motion, AnimatePresence } from "framer-motion"
import { Wifi, WifiOff, RefreshCw } from "lucide-react"
import { useOffline } from "@/hooks/useOffline"

export function OfflineBar() {
  const { isOnline, queueCount } = useOffline()

  return (
    <AnimatePresence>
      {(!isOnline || queueCount > 0) && (
        <motion.div
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -40, opacity: 0 }}
          className="fixed top-0 inset-x-0 z-50"
        >
          <div
            className={`flex items-center justify-center gap-2 py-1.5 text-xs font-medium ${
              isOnline ? "bg-green-500/90" : "bg-orange-500/90"
            } text-white`}
          >
            {isOnline ? (
              <>
                <RefreshCw className="w-3 h-3 animate-spin" />
                Syncing {queueCount} offline {queueCount === 1 ? "record" : "records"}…
              </>
            ) : (
              <>
                <WifiOff className="w-3 h-3" />
                Offline mode — data saves locally
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
