import { type NodeProps } from '@xyflow/react'
import { NodeBase } from './NodeBase'

export function RequestNode({ selected }: NodeProps) {
  return (
    <NodeBase
      title="Request"
      category="input"
      selected={selected}
      inputs={[]}
      outputs={[
        { id: 'request', label: 'Request', type: 'geometry' },
      ]}
      width={140}
      docUrl="https://docs.fastly.com/en/guides/compute/"
    >
      <div className="cc-node-subtitle">
        Entry point
      </div>
    </NodeBase>
  )
}
