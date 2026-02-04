/**
 * BeaconShellHeader - Uses @fastly/beacon-shell's TopNav component
 *
 * This provides the exact same header as manage.fastly.com.
 * Requires: @fastly/beacon-shell, react-router-dom
 *
 * Note: The app must be wrapped in a BrowserRouter for this to work
 * because TopNav.Logo uses react-router-dom's <Link> internally.
 */

import { TopNav } from '@fastly/beacon-shell'
import { IconHelp } from '@fastly/beacon-icons'
import { Switch, Flex, Text } from '@fastly/beacon-mantine'
import { useTheme } from '../styles/theme'

interface BeaconShellHeaderProps {
  title?: string
}

export function BeaconShellHeader({ title = 'Visual Compute Engine' }: BeaconShellHeaderProps) {
  const { isDark, toggle } = useTheme()

  return (
    <TopNav>
      <TopNav.Logo />
      <TopNav.Title>{title}</TopNav.Title>
      <TopNav.Search>Search services...</TopNav.Search>

      {/* Theme Toggle - custom addition */}
      <Flex align="center" gap="xs" style={{ marginLeft: 'var(--LAYOUT--spacing--6)' }}>
        <Text size="xs" style={{ color: 'var(--COLOR--text--secondary)' }}>Light</Text>
        <Switch checked={isDark} onChange={() => toggle()} size="xs" />
        <Text size="xs" style={{ color: 'var(--COLOR--text--secondary)' }}>Dark</Text>
      </Flex>

      <TopNav.Menu icon={<IconHelp />}>
        <TopNav.MenuItem href="https://docs.fastly.com">Documentation</TopNav.MenuItem>
        <TopNav.MenuItem href="https://support.fastly.com">Support</TopNav.MenuItem>
      </TopNav.Menu>

      <TopNav.Menu icon={<TopNav.Avatar>U</TopNav.Avatar>}>
        <TopNav.MenuItem href="/settings">Settings</TopNav.MenuItem>
      </TopNav.Menu>
    </TopNav>
  )
}
