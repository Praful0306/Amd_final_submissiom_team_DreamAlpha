/**
 * Sahayak AI — Offline mutation queue
 * Persists mutating requests in IndexedDB and replays them when connectivity returns.
 */
import { openDB, type IDBPDatabase } from "idb"

export interface QueuedMutation {
  id?: number
  url: string
  method: "POST" | "PATCH" | "PUT"
  body: unknown
  headers: Record<string, string>
  createdAt: number
  updatedAt: number
  retryCount: number
  lastError?: string
}

let dbPromise: Promise<IDBPDatabase> | null = null
let listenersAttached = false
let flushInFlight: Promise<number> | null = null

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB("sahayak-offline", 2, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("queue")) {
          const store = db.createObjectStore("queue", { autoIncrement: true, keyPath: "id" })
          store.createIndex("createdAt", "createdAt")
        }
      },
    })
  }
  return dbPromise
}

export function isOfflineNetworkError(error: unknown): boolean {
  return !navigator.onLine || (error instanceof TypeError && /fetch/i.test(error.message))
}

export async function queueMutation(
  url: string,
  method: "POST" | "PATCH" | "PUT",
  body: unknown,
  headers: Record<string, string> = {}
) {
  const now = Date.now()
  const db = await getDB()
  await db.add("queue", {
    url,
    method,
    body,
    headers,
    createdAt: now,
    updatedAt: now,
    retryCount: 0,
  } satisfies QueuedMutation)
}

export async function flushQueuedMutations(): Promise<number> {
  if (flushInFlight) return flushInFlight

  flushInFlight = (async () => {
    if (!navigator.onLine) return 0

    const db = await getDB()
    const tx = db.transaction("queue", "readwrite")
    const store = tx.objectStore("queue")
    const queued = await store.getAll()

    let flushed = 0
    for (const item of queued as QueuedMutation[]) {
      if (!item.id) continue
      try {
        const res = await fetch(item.url, {
          method: item.method,
          headers: { "Content-Type": "application/json", ...item.headers },
          body: JSON.stringify(item.body),
        })
        if (res.ok) {
          await store.delete(item.id)
          flushed += 1
        } else {
          await store.put({
            ...item,
            retryCount: item.retryCount + 1,
            updatedAt: Date.now(),
            lastError: `HTTP ${res.status}`,
          })
        }
      } catch (error) {
        await store.put({
          ...item,
          retryCount: item.retryCount + 1,
          updatedAt: Date.now(),
          lastError: error instanceof Error ? error.message : "Network error",
        })
        break
      }
    }

    await tx.done
    return flushed
  })()

  try {
    return await flushInFlight
  } finally {
    flushInFlight = null
  }
}

export function ensureOfflineSyncListeners() {
  if (listenersAttached || typeof window === "undefined") return
  listenersAttached = true
  window.addEventListener("online", () => {
    void flushQueuedMutations()
  })
}

export async function getQueueLength(): Promise<number> {
  const db = await getDB()
  return db.count("queue")
}
