import { useEffect, useState } from "react"
import { useStore } from "@/store/useStore"
import { flushQueuedMutations, getQueueLength } from "@/lib/offline"
import { flushGovernmentSync } from "@/lib/api"

export function useOffline() {
  const { isOnline, setOnline } = useStore()
  const [queueCount, setQueueCount] = useState(0)

  useEffect(() => {
    const handleOnline  = async () => {
      setOnline(true)
      await refreshQueue()
      try {
        await flushQueuedMutations()
        await flushGovernmentSync()
      } catch {
        // Connectivity can flap in rural settings. We'll retry on the next reconnect.
      }
      await refreshQueue()
    }
    const handleOffline = () => setOnline(false)

    window.addEventListener("online",  handleOnline)
    window.addEventListener("offline", handleOffline)

    return () => {
      window.removeEventListener("online",  handleOnline)
      window.removeEventListener("offline", handleOffline)
    }
  }, [setOnline])

  async function refreshQueue() {
    const count = await getQueueLength()
    setQueueCount(count)
  }

  useEffect(() => { void refreshQueue() }, [isOnline])

  return { isOnline, queueCount }
}
