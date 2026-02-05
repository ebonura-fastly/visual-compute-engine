/**
 * Configure Compute Theme System
 *
 * Thin wrapper around beacon-mantine's useColorScheme hook.
 * Theme is stored in localStorage (key: fui__appearance__dark-mode-enabled)
 * and managed entirely by beacon-mantine.
 */

import { useCallback } from 'react'
import { useColorScheme } from '@fastly/beacon-mantine'

export type ThemeMode = 'light' | 'dark'

/**
 * Hook to manage theme state using beacon-mantine's useColorScheme
 *
 * Usage:
 * ```tsx
 * const { mode, isDark, toggle, setTheme } = useTheme()
 * ```
 */
export function useTheme() {
  const { colorScheme, setColorScheme } = useColorScheme('aspen')

  const toggle = useCallback(() => {
    setColorScheme({ colorScheme: colorScheme === 'dark' ? 'light' : 'dark' })
  }, [colorScheme, setColorScheme])

  const setTheme = useCallback((newMode: ThemeMode) => {
    setColorScheme({ colorScheme: newMode })
  }, [setColorScheme])

  return {
    mode: colorScheme,
    isDark: colorScheme === 'dark',
    isLight: colorScheme === 'light',
    toggle,
    setTheme,
  }
}
