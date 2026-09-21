import { useEffect, useEffectEvent } from 'react'

export type PollCallback = (signal: AbortSignal) => Promise<void> | void

export function useVisiblePolling(callback: PollCallback, intervalMs: number, enabled = true) {
  const runCallback = useEffectEvent(callback)

  useEffect(() => {
    if (!enabled || typeof document === 'undefined') return
    let inFlight = false
    let controller: AbortController | null = null
    const run = () => {
      if (document.visibilityState !== 'visible' || inFlight) return
      inFlight = true
      controller = new AbortController()
      Promise.resolve(runCallback(controller.signal)).finally(() => {
        inFlight = false
        controller = null
      })
    }
    const onVisibilityChange = () => { if (document.visibilityState === 'visible') run() }
    const interval = window.setInterval(run, Math.max(intervalMs, 5000))
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      controller?.abort()
    }
  }, [enabled, intervalMs])
}