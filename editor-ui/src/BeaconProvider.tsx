import { MantineProvider, createTheme, beaconMantineTheme } from "@fastly/beacon-mantine"
import { ReactNode } from "react"

/**
 * CSS imports must be in cascade layer order (following Uniform pattern)
 */

// 1. Cascade layer order - MUST be first
import "@fastly/beacon-mantine/beacon.layer.css"

// 2. Reset
import "@fastly/beacon-mantine/reset.css"

// 3. Fonts
import "@fastly/beacon-mantine/inter.css"
import "@fastly/beacon-mantine/ibm-plex-mono.css"

// 4. Design tokens
import "@fastly/beacon-tokens/aspen.css"

// 5. Library styles
import "@mantine/core/styles.layer.css"
import "@fastly/beacon-mantine/styles.css"

const mantineTheme = createTheme(beaconMantineTheme)

interface BeaconProviderProps {
  children: ReactNode
}

export function BeaconProvider({ children }: BeaconProviderProps) {
  return (
    <MantineProvider theme={mantineTheme} defaultColorScheme="auto">
      {children}
    </MantineProvider>
  )
}
