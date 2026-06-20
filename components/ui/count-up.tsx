'use client'

import { useEffect, useRef, useState } from 'react'

type Props = {
  value: number
  duration?: number
  /** 'number' = plain integer, 'currency-th' = toLocaleString th-TH no decimals */
  format?: 'number' | 'currency-th'
}

function fmt(n: number, format: Props['format']) {
  if (format === 'currency-th') return n.toLocaleString('th-TH', { maximumFractionDigits: 0 })
  return String(n)
}

export function CountUp({ value, duration = 900, format = 'number' }: Props) {
  const [display, setDisplay] = useState(0)
  const rafRef = useRef<number>(0)
  const startRef = useRef<number | null>(null)

  useEffect(() => {
    startRef.current = null
    const animate = (ts: number) => {
      if (startRef.current === null) startRef.current = ts
      const elapsed = ts - startRef.current
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplay(Math.round(eased * value))
      if (progress < 1) rafRef.current = requestAnimationFrame(animate)
    }
    rafRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafRef.current)
  }, [value, duration])

  return <>{fmt(display, format)}</>
}
