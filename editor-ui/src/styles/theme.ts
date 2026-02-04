/**
 * VCE Theme System
 *
 * Uses CSS custom properties (defined in tokens.css) with data-theme attribute.
 * Theme is stored in localStorage and respects system preference.
 */

import { useState, useEffect, useCallback } from 'react'

export type ThemeMode = 'light' | 'dark'

const STORAGE_KEY = 'vce-theme'

/**
 * Get initial theme from localStorage or system preference
 */
function getInitialTheme(): ThemeMode {
  // Check localStorage first
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') {
      return stored
    }

    // Fall back to system preference
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark'
    }
  }

  return 'light'
}

/**
 * Apply theme to document
 */
function applyTheme(mode: ThemeMode) {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', mode)
  }
}

/**
 * Hook to manage theme state
 *
 * Usage:
 * ```tsx
 * const { theme, isDark, toggle, setTheme } = useTheme()
 * ```
 */
export function useTheme() {
  const [theme, setThemeState] = useState<ThemeMode>(getInitialTheme)

  // Apply theme on mount and when it changes
  useEffect(() => {
    applyTheme(theme)
    localStorage.setItem(STORAGE_KEY, theme)
  }, [theme])

  // Listen for system preference changes (only when no manual preference)
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

    const handleChange = (e: MediaQueryListEvent) => {
      // Only auto-switch if user hasn't set a manual preference
      const stored = localStorage.getItem(STORAGE_KEY)
      if (!stored) {
        setThemeState(e.matches ? 'dark' : 'light')
      }
    }

    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  const toggle = useCallback(() => {
    setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark'))
  }, [])

  const setTheme = useCallback((mode: ThemeMode) => {
    setThemeState(mode)
  }, [])

  return {
    theme,
    isDark: theme === 'dark',
    isLight: theme === 'light',
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
  applyTheme(theme)
}
