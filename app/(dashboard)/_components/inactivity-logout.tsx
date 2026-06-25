'use client'

import { useEffect, useRef } from 'react'
import { logout } from '@/app/actions/auth'

const INACTIVITY_MS = 6 * 60 * 60 * 1000 // 6 hours

const EVENTS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'] as const

export function InactivityLogout() {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const reset = () => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => { logout() }, INACTIVITY_MS)
    }

    EVENTS.forEach((e) => window.addEventListener(e, reset, { passive: true }))
    reset()

    return () => {
      EVENTS.forEach((e) => window.removeEventListener(e, reset))
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  return null
}
