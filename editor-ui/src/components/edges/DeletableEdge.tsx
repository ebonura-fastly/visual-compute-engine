import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  useReactFlow,
  type EdgeProps,
} from '@xyflow/react'
import { Box, ActionIcon } from '@fastly/beacon-mantine'
import { IconClose } from '@fastly/beacon-icons'

export function DeletableEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
}: EdgeProps) {
  const { setEdges } = useReactFlow()

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  const onEdgeClick = () => {
    setEdges((edges) => edges.filter((edge) => edge.id !== id))
  }

  return (
    <>
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={style} />
      <EdgeLabelRenderer>
        <Box
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all',
            padding: 4,
          }}
          className="nodrag nopan"
        >
          <ActionIcon
            onClick={onEdgeClick}
            variant="filled"
            size="sm"
            radius="sm"
            className="cc-edge-delete-btn"
            title="Delete connection"
          >
            <IconClose width={12} height={12} />
          </ActionIcon>
        </Box>
      </EdgeLabelRenderer>
    </>
  )
}
