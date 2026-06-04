import type { Peer } from '../lib/collab'

// Live collaborator cursors, drawn at a constant on-screen size (1/scale).
export default function PeerCursors({ peers, scale }: { peers: Peer[]; scale: number }) {
  return (
    <>
      {peers.map((pr) =>
        pr.x == null || pr.y == null ? null : (
          <g key={pr.id} pointerEvents="none">
            <circle cx={pr.x} cy={pr.y} r={6 / scale} fill={pr.color} stroke="#fff" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
            <text x={pr.x + 12 / scale} y={pr.y - 8 / scale} fontSize={12 / scale} fill={pr.color} fontWeight={700}>
              {pr.name}
            </text>
          </g>
        ),
      )}
    </>
  )
}
