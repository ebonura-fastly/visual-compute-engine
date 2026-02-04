import { useState } from 'react'

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
      <button onClick={() => setIsOpen(true)} className="vce-panel-toggle vce-panel-toggle--test">
        Test Rule
      </button>
    )
  }

  return (
    <div className="vce-panel vce-panel--test">
      <div className="vce-panel-header">
        <span>Test Request</span>
        <button onClick={() => setIsOpen(false)} className="vce-panel-close">×</button>
      </div>
      <div className="vce-panel-body">
        <textarea
          value={request}
          onChange={(e) => setRequest(e.target.value)}
          className="form-textarea text-mono"
          rows={10}
        />
        <button
          onClick={handleExecute}
          disabled={!isLoaded}
          className="btn w-full vce-mt-2"
          data-variant="primary"
        >
          {isLoaded ? 'Execute' : 'Loading WASM...'}
        </button>
        {result && (
          <div className="vce-panel-result vce-mt-2">
            <div className="vce-panel-result-label">Result:</div>
            <pre className="vce-panel-result-content">{result}</pre>
          </div>
        )}
      </div>
    </div>
  )
}
