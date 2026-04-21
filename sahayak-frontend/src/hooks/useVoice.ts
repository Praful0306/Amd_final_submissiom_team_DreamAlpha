import { useState, useRef, useCallback } from "react"
import { transcribe } from "@/lib/api"
import { useStore } from "@/store/useStore"

export type VoiceState = "idle" | "recording" | "processing" | "done" | "error"

/** Pick the best supported MIME type for the current browser. */
function getSupportedMimeType(): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4;codecs=mp4a",
    "audio/mp4",
    "audio/ogg;codecs=opus",
    "audio/ogg",
  ]
  for (const mt of candidates) {
    if (MediaRecorder.isTypeSupported(mt)) return mt
  }
  return ""   // browser default
}

export function useVoice(onResult?: (text: string) => void) {
  const [state,      setState]      = useState<VoiceState>("idle")
  const [transcript, setTranscript] = useState("")
  const [error,      setError]      = useState<string | null>(null)
  const mediaRecorder = useRef<MediaRecorder | null>(null)
  const chunks        = useRef<Blob[]>([])
  const actualMime    = useRef<string>("")
  const { lang }      = useStore()

  const start = useCallback(async () => {
    setError(null)
    setState("recording")
    chunks.current   = []
    actualMime.current = ""

    try {
      const stream   = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = getSupportedMimeType()
      const mr       = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      mediaRecorder.current = mr

      // Read back the actual mimeType the recorder chose (may differ from request)
      actualMime.current = mr.mimeType || mimeType || "audio/webm"

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.current.push(e.data)
      }

      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        setState("processing")

        const blobType = actualMime.current || "audio/webm"
        const blob     = new Blob(chunks.current, { type: blobType })

        if (blob.size < 100) {
          setError("Recording too short — please speak for at least 1 second")
          setState("error")
          return
        }

        try {
          const res = await transcribe(blob, lang)
          const text = res.text?.trim() ?? ""
          setTranscript(text)
          setState("done")
          if (text && text !== "[no speech detected]") {
            onResult?.(text)
          } else {
            setError("No speech detected — please speak clearly and try again")
            setState("error")
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Transcription failed"
          setError(msg)
          setState("error")
        }
      }

      mr.start(250)   // collect chunks every 250ms for lower latency
    } catch (err) {
      const msg = err instanceof Error
        ? err.message.includes("Permission denied") || err.message.includes("NotAllowed")
          ? "Microphone access denied — please allow microphone in browser settings"
          : err.message
        : "Mic access denied"
      setError(msg)
      setState("error")
    }
  }, [lang, onResult])

  const stop = useCallback(() => {
    if (mediaRecorder.current?.state === "recording") {
      mediaRecorder.current.stop()
    }
  }, [])

  const reset = useCallback(() => {
    setState("idle")
    setTranscript("")
    setError(null)
  }, [])

  return { state, transcript, error, start, stop, reset }
}
