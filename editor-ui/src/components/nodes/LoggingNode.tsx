import { type NodeProps, useReactFlow } from '@xyflow/react'
import { useCallback } from 'react'
import { NodeBase, NodeField, NodeSelect, NodeInput, NodeCheckbox } from './NodeBase'

export type LoggingNodeData = {
  endpoint: 'bigquery' | 's3' | 'gcs' | 'https' | 'syslog' | 'datadog' | 'splunk' | 'sumologic'
  destination: string
  format: 'json' | 'ndjson' | 'csv' | 'vcl'
  sampleRate: number
  includeHeaders: boolean
  includeBody: boolean
  customFields?: string
}

const endpointOptions = [
  { value: 'bigquery', label: 'Google BigQuery' },
  { value: 's3', label: 'Amazon S3' },
  { value: 'gcs', label: 'Google Cloud Storage' },
  { value: 'https', label: 'HTTPS Endpoint' },
  { value: 'syslog', label: 'Syslog' },
  { value: 'datadog', label: 'Datadog' },
  { value: 'splunk', label: 'Splunk' },
  { value: 'sumologic', label: 'Sumo Logic' },
]

const formatOptions = [
  { value: 'json', label: 'JSON' },
  { value: 'ndjson', label: 'NDJSON' },
  { value: 'csv', label: 'CSV' },
  { value: 'vcl', label: 'VCL Format' },
]

export function LoggingNode({ id, data, selected }: NodeProps) {
  const nodeData = data as LoggingNodeData
  const { setNodes } = useReactFlow()

  const updateData = useCallback((field: string, value: string | number | boolean) => {
    setNodes((nodes) =>
      nodes.map((node) =>
        node.id === id
          ? { ...node, data: { ...node.data, [field]: value } }
          : node
      )
    )
  }, [id, setNodes])

  const endpoint = nodeData.endpoint || 'bigquery'
  const format = nodeData.format || 'json'
  const sampleRate = nodeData.sampleRate ?? 100

  // Dynamic title based on endpoint
  const endpointLabels: Record<string, string> = {
    bigquery: 'BigQuery Log',
    s3: 'S3 Log',
    gcs: 'GCS Log',
    https: 'HTTPS Log',
    syslog: 'Syslog',
    datadog: 'Datadog Log',
    splunk: 'Splunk Log',
    sumologic: 'Sumo Logic Log',
  }

  // Get placeholder based on endpoint type
  const getPlaceholder = () => {
    switch (endpoint) {
      case 'bigquery': return 'project.dataset.table'
      case 's3': return 's3://bucket/path/'
      case 'gcs': return 'gs://bucket/path/'
      case 'https': return 'https://logs.example.com'
      case 'syslog': return 'syslog://logs.example.com:514'
      case 'datadog': return 'https://http-intake.logs.datadoghq.com'
      case 'splunk': return 'https://input-prd-p-xxx.cloud.splunk.com:8088'
      case 'sumologic': return 'https://endpoint.sumologic.com/...'
      default: return 'Destination URL'
    }
  }

  return (
    <NodeBase
      title={endpointLabels[endpoint] || 'Logging'}
      category="action"
      selected={selected}
      inputs={[
        { id: 'trigger', label: 'Log Event', type: 'bool' },
      ]}
      outputs={[
        { id: 'done', label: 'Done', type: 'bool' },
      ]}
      width={220}
      docUrl="https://docs.fastly.com/en/guides/setting-up-remote-log-streaming-for-compute"
    >
      <NodeField label="Endpoint">
        <NodeSelect
          value={endpoint}
          onChange={(v) => updateData('endpoint', v)}
          options={endpointOptions}
        />
      </NodeField>

      <NodeField label="Dest">
        <NodeInput
          value={nodeData.destination || ''}
          onChange={(v) => updateData('destination', v)}
          placeholder={getPlaceholder()}
        />
      </NodeField>

      <NodeField label="Format">
        <NodeSelect
          value={format}
          onChange={(v) => updateData('format', v)}
          options={formatOptions}
        />
      </NodeField>

      <NodeField label="Sample %">
        <NodeInput
          value={sampleRate}
          onChange={(v) => updateData('sampleRate', parseInt(v) || 100)}
          type="number"
          placeholder="100"
        />
      </NodeField>

      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <NodeCheckbox
          checked={nodeData.includeHeaders ?? true}
          onChange={(v) => updateData('includeHeaders', v)}
          label="Include headers"
        />
        <NodeCheckbox
          checked={nodeData.includeBody ?? false}
          onChange={(v) => updateData('includeBody', v)}
          label="Include body"
        />
      </div>
    </NodeBase>
  )
}
