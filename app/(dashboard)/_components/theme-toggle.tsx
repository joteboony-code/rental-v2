'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { Moon, Sun } from 'lucide-react'

function subscribeTheme(callback: () => void) {
  window.addEventListener('storage', callback)
  window.addEventListener('themechange', callback)
  return () => {
    window.removeEventListener('storage', callback)
    window.removeEventListener('themechange', callback)
  }
}

function getThemeSnapshot() {
  return document.documentElement.classList.contains('dark')
}

function getServerThemeSnapshot() {
  return false
}

export function ThemeToggle() {
  const dark = useSyncExternalStore(subscribeTheme, getThemeSnapshot, getServerThemeSnapshot)

  useEffect(() => {
    const stored = window.localStorage.getItem('theme')
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const nextDark = stored ? stored === 'dark' : prefersDark
    document.documentElement.classList.toggle('dark', nextDark)
    window.dispatchEvent(new Event('themechange'))
  }, [])

  function toggle() {
    const nextDark = !dark
    document.documentElement.classList.toggle('dark', nextDark)
    window.localStorage.setItem('theme', nextDark ? 'dark' : 'light')
    window.dispatchEvent(new Event('themechange'))
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? 'ใช้โหมดสว่าง' : 'ใช้โหมดมืด'}
      className="sidebar-item group relative flex size-10 items-center justify-center rounded-xl text-slate-400 transition-all duration-150 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-100"
    >
      {dark ? <Sun className="size-[18px]" strokeWidth={1.75} /> : <Moon className="size-[18px]" strokeWidth={1.75} />}
      <span className="sidebar-tooltip absolute left-[calc(100%+10px)] z-50 rounded-lg bg-slate-950 px-2.5 py-1.5 text-xs font-medium text-white shadow-xl">
        {dark ? 'โหมดสว่าง' : 'โหมดมืด'}
      </span>
    </button>
  )
}
