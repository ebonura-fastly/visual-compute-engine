import { type NodeProps, useReactFlow } from '@xyflow/react'
import { useCallback } from 'react'
import { NodeBase, NodeField, NodeSelect, NodeInput, NodeCheckbox, NodeSection, NodeTextarea } from './NodeBase'

export type BackendNodeData = {
  // Basic
  name: string
  host: string
  port: number

  // Timeouts (ms)
  connectTimeout?: number        // default 1000
  firstByteTimeout?: number      // default 15000
  betweenBytesTimeout?: number   // default 10000

  // SSL/TLS
  useTLS: boolean
  verifyCertificate?: boolean    // check_certificate()
  sniHostname?: string           // sni_hostname()
  caCertificate?: string         // ca_certificate() - PEM
  clientCertificate?: string     // provide_client_certificate() - PEM
  clientKey?: string             // client key - PEM
  minTLSVersion?: string         // '1.0' | '1.1' | '1.2' | '1.3'
  maxTLSVersion?: string         // '1.0' | '1.1' | '1.2' | '1.3'

  // Host
  overrideHost?: string          // override_host()
  preferIPv6?: boolean           // prefer_ipv6()

  // Connection Pooling
  enablePooling?: boolean        // enable_pooling()
  keepaliveTime?: number         // http_keepalive_time() - ms
  maxConnections?: number        // max_connections()
  maxConnectionUses?: number     // max_use()
  maxConnectionLifetime?: number // max_lifetime() - ms

  // TCP Keepalive
  tcpKeepalive?: boolean
  tcpKeepaliveTime?: number      // seconds
  tcpKeepaliveInterval?: number  // seconds
  tcpKeepaliveProbes?: number
}

const tlsVersionOptions = [
  { value: '', label: 'Default' },
  { value: '1.0', label: 'TLS 1.0' },
  { value: '1.1', label: 'TLS 1.1' },
  { value: '1.2', label: 'TLS 1.2' },
  { value: '1.3', label: 'TLS 1.3' },
]

export function BackendNode({ id, data, selected }: NodeProps) {
  const nodeData = data as BackendNodeData
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

  // Basic fields with defaults
  const name = nodeData.name || 'origin'
  const host = nodeData.host || ''
  const port = nodeData.port ?? 443
  const useTLS = nodeData.useTLS ?? true

  return (
    <NodeBase
      title={`Backend: ${name}`}
      category="routing"
      selected={selected}
      inputs={[
        { id: 'route', label: 'Route', type: 'bool' },
      ]}
      outputs={[
        { id: 'response', label: 'Response', type: 'geometry' },
        { id: 'error', label: 'Error', type: 'bool' },
      ]}
      width={240}
      docUrl="https://docs.fastly.com/en/guides/working-with-hosts"
    >
      {/* Basic - Always visible */}
      <NodeField label="Name">
        <NodeInput
          value={name}
          onChange={(v) => updateData('name', v)}
          placeholder="origin"
        />
      </NodeField>

      <NodeField label="Host">
        <NodeInput
          value={host}
          onChange={(v) => updateData('host', v)}
          placeholder="origin.example.com"
        />
      </NodeField>

      <NodeField label="Port">
        <NodeInput
          value={port}
          onChange={(v) => updateData('port', parseInt(v) || 443)}
          type="number"
          placeholder="443"
        />
      </NodeField>

      <NodeCheckbox
        checked={useTLS}
        onChange={(v) => updateData('useTLS', v)}
        label="Use TLS/SSL"
      />

      {/* Timeouts Section */}
      <NodeSection title="Timeouts (ms)">
        <NodeField label="Connect">
          <NodeInput
            value={nodeData.connectTimeout ?? ''}
            onChange={(v) => updateData('connectTimeout', parseInt(v) || 0)}
            type="number"
            placeholder="1000"
          />
        </NodeField>
        <NodeField label="First Byte">
          <NodeInput
            value={nodeData.firstByteTimeout ?? ''}
            onChange={(v) => updateData('firstByteTimeout', parseInt(v) || 0)}
            type="number"
            placeholder="15000"
          />
        </NodeField>
        <NodeField label="Between">
          <NodeInput
            value={nodeData.betweenBytesTimeout ?? ''}
            onChange={(v) => updateData('betweenBytesTimeout', parseInt(v) || 0)}
            type="number"
            placeholder="10000"
          />
        </NodeField>
      </NodeSection>

      {/* TLS Section */}
      {useTLS && (
        <NodeSection title="TLS Settings">
          <NodeCheckbox
            checked={nodeData.verifyCertificate ?? false}
            onChange={(v) => updateData('verifyCertificate', v)}
            label="Verify Certificate"
          />
          <NodeField label="SNI Host">
            <NodeInput
              value={nodeData.sniHostname || ''}
              onChange={(v) => updateData('sniHostname', v)}
              placeholder="(use host)"
            />
          </NodeField>
          <NodeField label="Min TLS">
            <NodeSelect
              value={nodeData.minTLSVersion || ''}
              onChange={(v) => updateData('minTLSVersion', v)}
              options={tlsVersionOptions}
            />
          </NodeField>
          <NodeField label="Max TLS">
            <NodeSelect
              value={nodeData.maxTLSVersion || ''}
              onChange={(v) => updateData('maxTLSVersion', v)}
              options={tlsVersionOptions}
            />
          </NodeField>
          <NodeField label="CA Cert">
            <NodeTextarea
              value={nodeData.caCertificate || ''}
              onChange={(v) => updateData('caCertificate', v)}
              placeholder="PEM certificate..."
              minRows={2}
              maxRows={4}
            />
          </NodeField>
          <NodeField label="Client Cert">
            <NodeTextarea
              value={nodeData.clientCertificate || ''}
              onChange={(v) => updateData('clientCertificate', v)}
              placeholder="PEM certificate..."
              minRows={2}
              maxRows={4}
            />
          </NodeField>
          <NodeField label="Client Key">
            <NodeTextarea
              value={nodeData.clientKey || ''}
              onChange={(v) => updateData('clientKey', v)}
              placeholder="PEM private key..."
              minRows={2}
              maxRows={4}
            />
          </NodeField>
        </NodeSection>
      )}

      {/* Advanced Section */}
      <NodeSection title="Advanced">
        <NodeField label="Override">
          <NodeInput
            value={nodeData.overrideHost || ''}
            onChange={(v) => updateData('overrideHost', v)}
            placeholder="Host header override"
          />
        </NodeField>
        <NodeCheckbox
          checked={nodeData.preferIPv6 ?? false}
          onChange={(v) => updateData('preferIPv6', v)}
          label="Prefer IPv6"
        />
      </NodeSection>

      {/* Pooling Section */}
      <NodeSection title="Connection Pooling">
        <NodeCheckbox
          checked={nodeData.enablePooling ?? true}
          onChange={(v) => updateData('enablePooling', v)}
          label="Enable Pooling"
        />
        {(nodeData.enablePooling ?? true) && (
          <>
            <NodeField label="Keepalive">
              <NodeInput
                value={nodeData.keepaliveTime ?? ''}
                onChange={(v) => updateData('keepaliveTime', parseInt(v) || 0)}
                type="number"
                placeholder="60000 ms"
              />
            </NodeField>
            <NodeField label="Max Conn">
              <NodeInput
                value={nodeData.maxConnections ?? ''}
                onChange={(v) => updateData('maxConnections', parseInt(v) || 0)}
                type="number"
                placeholder="0 = unlimited"
              />
            </NodeField>
            <NodeField label="Max Uses">
              <NodeInput
                value={nodeData.maxConnectionUses ?? ''}
                onChange={(v) => updateData('maxConnectionUses', parseInt(v) || 0)}
                type="number"
                placeholder="0 = unlimited"
              />
            </NodeField>
            <NodeField label="Max Life">
              <NodeInput
                value={nodeData.maxConnectionLifetime ?? ''}
                onChange={(v) => updateData('maxConnectionLifetime', parseInt(v) || 0)}
                type="number"
                placeholder="0 = unlimited"
              />
            </NodeField>
          </>
        )}
      </NodeSection>

      {/* TCP Keepalive Section */}
      <NodeSection title="TCP Keepalive">
        <NodeCheckbox
          checked={nodeData.tcpKeepalive ?? false}
          onChange={(v) => updateData('tcpKeepalive', v)}
          label="Enable TCP Keepalive"
        />
        {nodeData.tcpKeepalive && (
          <>
            <NodeField label="Time (s)">
              <NodeInput
                value={nodeData.tcpKeepaliveTime ?? ''}
                onChange={(v) => updateData('tcpKeepaliveTime', parseInt(v) || 0)}
                type="number"
                placeholder="7200"
              />
            </NodeField>
            <NodeField label="Interval (s)">
              <NodeInput
                value={nodeData.tcpKeepaliveInterval ?? ''}
                onChange={(v) => updateData('tcpKeepaliveInterval', parseInt(v) || 0)}
                type="number"
                placeholder="75"
              />
            </NodeField>
            <NodeField label="Probes">
              <NodeInput
                value={nodeData.tcpKeepaliveProbes ?? ''}
                onChange={(v) => updateData('tcpKeepaliveProbes', parseInt(v) || 0)}
                type="number"
                placeholder="9"
              />
            </NodeField>
          </>
        )}
      </NodeSection>
    </NodeBase>
  )
}
