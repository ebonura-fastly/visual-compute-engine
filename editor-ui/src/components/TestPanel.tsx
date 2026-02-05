import { useState } from 'react'
import { Box, Flex, Text, Button, Textarea, Stack, Code } from '@fastly/beacon-mantine'
import { IconClose } from '@fastly/beacon-icons'

type Props = {
  onExecute: (context: object) => unknown
  isLoaded: boolean
}

const defaultRequest = {
  path: '/admin/settings',
  method: 'GET',
  client_ip: '1.2.3.4',
  country: 'DE',
  headers: {},
  user_agent: 'Mozilla/5.0',
}

export function TestPanel({ onExecute, isLoaded }: Props) {
  const [request, setRequest] = useState(JSON.stringify(defaultRequest, null, 2))
  const [result, setResult] = useState<string | null>(null)
  const [isOpen, setIsOpen] = useState(false)

  const handleExecute = () => {
    try {
      const ctx = JSON.parse(request)
      const res = onExecute(ctx)
      setResult(JSON.stringify(res, null, 2))
    } catch (err) {
      setResult(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  if (!isOpen) {
    return (
      <Button onClick={() => setIsOpen(true)} variant="outline" className="cc-panel-toggle cc-panel-toggle--test">
        Test Rule
      </Button>
    )
  }

  return (
    <Box className="cc-panel cc-panel--test">
      <Flex className="cc-panel-header" justify="space-between" align="center">
        <Text size="sm" weight="bold">Test Request</Text>
        <Button onClick={() => setIsOpen(false)} variant="subtle" size="compact-sm">
          <IconClose width={14} height={14} />
        </Button>
      </Flex>
      <Stack className="cc-panel-body" gap="sm">
        <Textarea
          value={request}
          onChange={(e) => setRequest(e.target.value)}
          className="text-mono"
          minRows={10}
          maxRows={15}
          autosize
        />
        <Button
          onClick={handleExecute}
          disabled={!isLoaded}
          fullWidth
        >
          {isLoaded ? 'Execute' : 'Loading WASM...'}
        </Button>
        {result && (
          <Box className="cc-panel-result">
            <Text size="xs" weight="bold" style={{ marginBottom: '8px' }}>Result:</Text>
            <Code block className="cc-panel-result-content">{result}</Code>
          </Box>
        )}
      </Stack>
    </Box>
  )
}
