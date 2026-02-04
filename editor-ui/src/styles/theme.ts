/**
 * VCE Theme System
 *
 * Uses beacon-mantine's useColorScheme hook (following Uniform pattern).
 * Theme is stored in localStorage and respects system preference.
 */

import { useState, useEffect, useCallback } from 'react'
import { useColorScheme } from '@fastly/beacon-mantine'

export type ThemeMode = 'light' | 'dark'

const STORAGE_KEY = 'vce-theme'

/**
 * Get initial theme from localStorage or system preference
 */
function getInitialTheme(): ThemeMode {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') {
      return stored
    }
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark'
    }
  }
  return 'light'
}

/**
 * Hook to manage theme state using beacon-mantine's useColorScheme
 *
 * Usage:
 * ```tsx
 * const { mode, isDark, toggle, setTheme } = useTheme()
 * ```
 */
export function useTheme() {
  const [mode, setModeState] = useState<ThemeMode>(getInitialTheme)
  const { setColorScheme } = useColorScheme('aspen')

  // Apply theme via beacon-mantine and persist to localStorage
  useEffect(() => {
    setColorScheme({ colorScheme: mode, theme: 'aspen' })
    localStorage.setItem(STORAGE_KEY, mode)
    // Also set data-theme for our custom CSS variables
    document.documentElement.setAttribute('data-theme', mode)
  }, [mode, setColorScheme])

  // Listen for system preference changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = (e: MediaQueryListEvent) => {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (!stored) {
        setModeState(e.matches ? 'dark' : 'light')
      }
    }
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  const toggle = useCallback(() => {
    setModeState((prev) => (prev === 'dark' ? 'light' : 'dark'))
  }, [])

  const setTheme = useCallback((newMode: ThemeMode) => {
    setModeState(newMode)
  }, [])

  return {
    mode,
    isDark: mode === 'dark',
    isLight: mode === 'light',
    toggle,
    setTheme,
  }
}

/**
 * Initialize theme on app load (call once in main.tsx)
 * This ensures theme is applied before React hydration to prevent flash
 */
export function initializeTheme() {
  const theme = getInitialTheme()
  document.documentElement.setAttribute('data-theme', theme)
}
