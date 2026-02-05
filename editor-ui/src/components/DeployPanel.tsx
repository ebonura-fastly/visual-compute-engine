import { useState, useCallback } from 'react'
import type { Node, Edge } from '@xyflow/react'
import { Button, Flex, Box, Stack, Text, TextInput, Switch, Alert, Pill, Progress } from '@fastly/beacon-mantine'
import { IconClose } from '@fastly/beacon-icons'
import {
  validateGraph,
  generateCompressedConfigStoreContent,
  generateFastlyToml,
  type ServiceConfig
} from '../utils/ruleConverter'

type Props = {
  nodes: Node[]
  edges: Edge[]
}

const defaultConfig: ServiceConfig = {
  name: 'cc-service',
  backends: [
    { name: 'protected_origin', host: 'origin.example.com', useTls: true }
  ],
  defaultBackend: 'protected_origin',
  configStoreName: 'security_rules',
  logEndpoint: 'security_logs'
}

export function DeployPanel({ nodes, edges }: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [config, setConfig] = useState<ServiceConfig>(defaultConfig)
  const [stats, setStats] = useState<{
    originalSize: number
    compressedSize: number
    compressionRatio: number
    fitsInConfigStore: boolean
  } | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [exportedData, setExportedData] = useState<string | null>(null)

  const handleValidate = useCallback(() => {
    const result = validateGraph(nodes, edges)
    setErrors(result.errors)
    return result.valid
  }, [nodes, edges])

  const handlePack = useCallback(async () => {
    if (!handleValidate()) return

    try {
      const { content, stats: packStats } = await generateCompressedConfigStoreContent(nodes, edges)
      setStats(packStats)
      setExportedData(JSON.stringify(content, null, 2))
    } catch (err) {
      setErrors([`Compression error: ${err instanceof Error ? err.message : 'Unknown error'}`])
    }
  }, [nodes, edges, handleValidate])

  const handleExportConfigStore = useCallback(() => {
    if (!exportedData) return

    const blob = new Blob([exportedData], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${config.configStoreName}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [exportedData, config.configStoreName])

  const handleExportFastlyToml = useCallback(() => {
    const toml = generateFastlyToml(config)
    const blob = new Blob([toml], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'fastly.toml'
    a.click()
    URL.revokeObjectURL(url)
  }, [config])

  const updateBackend = useCallback((index: number, field: string, value: string | boolean) => {
    setConfig(prev => ({
      ...prev,
      backends: prev.backends.map((b, i) =>
        i === index ? { ...b, [field]: value } : b
      )
    }))
  }, [])

  if (!isOpen) {
    return (
      <Button
        onClick={() => setIsOpen(true)}
        className="cc-panel-toggle cc-panel-toggle--deploy"
      >
        Deploy
      </Button>
    )
  }

  const usagePercent = stats ? Math.round((stats.compressedSize / 8000) * 100) : 0

  return (
    <Box className="cc-panel cc-panel--deploy">
      <Flex className="cc-panel-header" justify="space-between" align="center">
        <Text size="sm" weight="bold">Deploy to Fastly</Text>
        <Button variant="subtle" size="compact-sm" onClick={() => setIsOpen(false)}>
          <IconClose width={14} height={14} />
        </Button>
      </Flex>

      <Stack className="cc-panel-body" gap="md">
        {/* Service Config */}
        <Stack className="cc-panel-section" gap="sm">
          <Text size="sm" weight="bold">Service Configuration</Text>
          <TextInput
            label="Service Name"
            value={config.name}
            onChange={(e) => setConfig(prev => ({ ...prev, name: e.target.value }))}
            size="sm"
          />
          <TextInput
            label="Config Store Name"
            value={config.configStoreName}
            onChange={(e) => setConfig(prev => ({ ...prev, configStoreName: e.target.value }))}
            size="sm"
          />
        </Stack>

        {/* Backend Config */}
        <Stack className="cc-panel-section" gap="sm">
          <Text size="sm" weight="bold">Backend (Protected Origin)</Text>
          {config.backends.map((backend, idx) => (
            <Stack key={idx} gap="sm">
              <TextInput
                label="Backend Name"
                value={backend.name}
                onChange={(e) => updateBackend(idx, 'name', e.target.value)}
                size="sm"
              />
              <TextInput
                label="Host"
                value={backend.host}
                onChange={(e) => updateBackend(idx, 'host', e.target.value)}
                placeholder="origin.example.com"
                size="sm"
              />
              <Flex align="center" gap="sm">
                <Switch
                  checked={backend.useTls ?? true}
                  onChange={(e) => updateBackend(idx, 'useTls', e.currentTarget.checked)}
                  size="sm"
                />
                <Text size="sm">Use TLS (HTTPS)</Text>
              </Flex>
            </Stack>
          ))}
        </Stack>

        {/* Actions */}
        <Button onClick={handlePack} fullWidth>
          Pack Rules
        </Button>

        {/* Validation Errors */}
        {errors.length > 0 && (
          <Alert variant="error" title="Validation Errors">
            {errors.map((err, i) => (
              <Text key={i} size="xs">• {err}</Text>
            ))}
          </Alert>
        )}

        {/* Compression Stats */}
        {stats && (
          <Stack className="cc-panel-stats" gap="sm">
            <Text size="sm" weight="bold">Compression Stats</Text>

            <Flex justify="space-between">
              <Text size="xs">Original:</Text>
              <Text size="xs">{stats.originalSize.toLocaleString()} bytes</Text>
            </Flex>
            <Flex justify="space-between">
              <Text size="xs">Compressed:</Text>
              <Text size="xs">{stats.compressedSize.toLocaleString()} bytes</Text>
            </Flex>
            <Flex justify="space-between" align="center">
              <Text size="xs">Ratio:</Text>
              <Pill variant="success">{stats.compressionRatio}% smaller</Pill>
            </Flex>

            {/* Config Store Usage Meter */}
            <Box>
              <Flex justify="space-between" style={{ marginBottom: '8px' }}>
                <Text size="xs">Config Store Usage</Text>
                <Text size="xs">{usagePercent}% of 8KB</Text>
              </Flex>
              <Progress
                value={usagePercent}
                color={!stats.fitsInConfigStore ? 'red' : stats.compressedSize > 6400 ? 'yellow' : 'green'}
                size="sm"
              />
              <Text size="xs" style={{ marginTop: '8px' }}>
                {stats.fitsInConfigStore
                  ? stats.compressedSize > 6400
                    ? 'Approaching limit - consider simplifying rules'
                    : 'Plenty of room for more rules'
                  : 'Exceeds 8KB limit - reduce rule complexity'}
              </Text>
            </Box>

            {stats.fitsInConfigStore && (
              <Flex gap="sm">
                <Button variant="outline" size="sm" onClick={handleExportConfigStore}>
                  Export Config Store JSON
                </Button>
                <Button variant="outline" size="sm" onClick={handleExportFastlyToml}>
                  Export fastly.toml
                </Button>
              </Flex>
            )}
          </Stack>
        )}

        {/* Info */}
        <Alert variant="action">
          <Text size="xs">
            Rules are compressed using gzip and base64 encoded to maximize storage efficiency.
            Config Store limit: 8,000 characters per value.
          </Text>
        </Alert>
      </Stack>
    </Box>
  )
}
