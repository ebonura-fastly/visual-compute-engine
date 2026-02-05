import type { Node } from '@xyflow/react'
import { Box, Flex, Text, Select, TextInput, ActionIcon, Stack } from '@fastly/beacon-mantine'
import { IconClose } from '@fastly/beacon-icons'

type Props = {
  node: Node | null
  onUpdate: (id: string, data: Record<string, unknown>) => void
  onClose: () => void
}

const FIELDS = ['path', 'ip', 'country', 'device', 'useragent', 'header', 'method']
const OPERATORS = {
  path: ['equals', 'startsWith', 'contains', 'matches'],
  ip: ['equals', 'inRange'],
  country: ['equals', 'in', 'notIn'],
  device: ['is', 'isNot'],
  useragent: ['equals', 'contains', 'matches'],
  header: ['exists', 'notExists', 'equals', 'contains'],
  method: ['equals', 'in']
}
const LOGIC_OPS = ['AND', 'OR', 'NOT']
const ACTIONS = ['block', 'allow', 'challenge', 'log']

export function NodeEditor({ node, onUpdate, onClose }: Props) {
  if (!node) return null

  const update = (key: string, value: unknown) => {
    onUpdate(node.id, { ...node.data, [key]: value })
  }

  return (
    <Box className="cc-node-editor">
      <Flex className="cc-node-editor-header" justify="space-between" align="center">
        <Text size="sm" weight="bold">Edit {node.type}</Text>
        <ActionIcon onClick={onClose} variant="subtle" size="sm">
          <IconClose width={14} height={14} />
        </ActionIcon>
      </Flex>

      {node.type === 'condition' && (
        <Stack className="cc-node-editor-form" gap="sm">
          <Select
            label="Field"
            value={(node.data as { field?: string }).field || 'path'}
            onChange={(val) => val && update('field', val)}
            data={FIELDS.map(f => ({ value: f, label: f }))}
            size="sm"
          />
          <Select
            label="Operator"
            value={(node.data as { operator?: string }).operator || 'equals'}
            onChange={(val) => val && update('operator', val)}
            data={(OPERATORS[(node.data as { field?: string }).field as keyof typeof OPERATORS] ?? OPERATORS.path).map(op => ({ value: op, label: op }))}
            size="sm"
          />
          <TextInput
            label="Value"
            value={(node.data as { value?: string }).value || ''}
            onChange={(e) => update('value', e.target.value)}
            size="sm"
          />
        </Stack>
      )}

      {node.type === 'logic' && (
        <Stack className="cc-node-editor-form" gap="sm">
          <Select
            label="Operation"
            value={(node.data as { operation?: string }).operation || 'AND'}
            onChange={(val) => val && update('operation', val)}
            data={LOGIC_OPS.map(op => ({ value: op, label: op }))}
            size="sm"
          />
        </Stack>
      )}

      {node.type === 'action' && (
        <Stack className="cc-node-editor-form" gap="sm">
          <Select
            label="Action"
            value={(node.data as { action?: string }).action || 'block'}
            onChange={(val) => val && update('action', val)}
            data={ACTIONS.map(a => ({ value: a, label: a }))}
            size="sm"
          />
          <TextInput
            label="Status Code"
            type="number"
            value={String((node.data as { statusCode?: number }).statusCode || 403)}
            onChange={(e) => update('statusCode', parseInt(e.target.value))}
            size="sm"
          />
          <TextInput
            label="Message"
            value={(node.data as { message?: string }).message || ''}
            onChange={(e) => update('message', e.target.value)}
            size="sm"
          />
        </Stack>
      )}
    </Box>
  )
}
