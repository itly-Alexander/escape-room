import { useEffect, useState } from 'react'
import { useWorld } from '@/state/world'
import { playerMotion } from './playerMotion'
import type { ReticleTarget } from './InteractReticle'

// Dev-only overlay. Toggle with F3. Shows live player position/yaw, aim
// target, inventory, and world flags — the readouts I need to pick exact
// coordinates and verify puzzle state when iterating on a level.
export function DevHUD({ reticle }: { reticle: ReticleTarget | null }) {
  const [visible, setVisible] = useState(false)
  const [, force] = useState(0)
  const inventory = useWorld((s) => s.inventory)
  const flags = useWorld((s) => s.flags)
  const level = useWorld((s) => s.level)
  const fullbright = useWorld((s) => s.debugFullbright)
  const toggleFullbright = useWorld((s) => s.toggleDebugFullbright)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'F3') {
        e.preventDefault()
        setVisible((v) => !v)
      } else if (e.code === 'F4') {
        e.preventDefault()
        toggleFullbright()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggleFullbright])

  useEffect(() => {
    if (!visible) return
    const id = setInterval(() => force((n) => n + 1), 100)
    return () => clearInterval(id)
  }, [visible])

  if (!visible) {
    return (
      <div style={hintStyle}>
        <kbd style={kbdStyle}>F3</kbd> dev
      </div>
    )
  }

  const yawDeg = ((playerMotion.yaw * 180) / Math.PI + 360) % 360
  const flagEntries = Object.entries(flags)
  const posString = `${playerMotion.posX.toFixed(2)}, ${playerMotion.posY.toFixed(2)}, ${playerMotion.posZ.toFixed(2)}`
  const copyPos = () => navigator.clipboard?.writeText(`[${playerMotion.posX.toFixed(2)}, ${playerMotion.posY.toFixed(2)}, ${playerMotion.posZ.toFixed(2)}]`)

  return (
    <div style={rootStyle}>
      <div style={titleStyle}>Dev — F3 to hide</div>

      <Row label="Level" value={level?.id ?? '—'} />
      <Row label="Pos" value={posString} onClick={copyPos} title="Click to copy as Vec3" />
      <Row label="Yaw" value={`${yawDeg.toFixed(1)}°`} />

      <Divider />

      <Row label="Aim" value={reticle?.object.id ?? '—'} />
      <Row label="Dist" value={reticle ? `${reticle.distance.toFixed(2)}m` : '—'} />
      <Row label="Fullbright (F4)" value={fullbright ? 'on' : 'off'} />

      <Divider />

      <div style={sectionLabelStyle}>Inventory</div>
      {inventory.length === 0 && <div style={emptyStyle}>(empty)</div>}
      {inventory.map((id) => (
        <div key={id} style={listRowStyle}>• {id}</div>
      ))}

      <Divider />

      <div style={sectionLabelStyle}>Flags</div>
      {flagEntries.length === 0 && <div style={emptyStyle}>(none)</div>}
      {flagEntries.map(([k, v]) => (
        <div key={k} style={listRowStyle}>
          <span>{k}</span>
          <span style={{ color: v ? '#8cf08c' : '#f08c8c', marginLeft: 8 }}>{String(v)}</span>
        </div>
      ))}
    </div>
  )
}

function Row({ label, value, onClick, title }: { label: string; value: string; onClick?: () => void; title?: string }) {
  return (
    <div
      style={{ ...rowStyle, cursor: onClick ? 'pointer' : 'default' }}
      onClick={onClick}
      title={title}
    >
      <span style={labelStyle}>{label}</span>
      <span style={valueStyle}>{value}</span>
    </div>
  )
}

function Divider() {
  return <div style={{ height: 1, background: 'rgba(255,255,255,0.1)', margin: '6px 0' }} />
}

const rootStyle: React.CSSProperties = {
  position: 'fixed', top: 12, left: 12, zIndex: 20,
  background: 'rgba(0,0,0,0.72)',
  color: '#d8d8d8',
  font: '12px/1.4 ui-monospace, "SF Mono", Consolas, monospace',
  padding: '10px 14px',
  borderRadius: 6,
  border: '1px solid rgba(255,255,255,0.08)',
  minWidth: 240,
  pointerEvents: 'auto',
  userSelect: 'text',
}
const titleStyle: React.CSSProperties = {
  fontSize: 10, textTransform: 'uppercase', letterSpacing: 2, opacity: 0.5, marginBottom: 8,
}
const rowStyle: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', gap: 12,
}
const labelStyle: React.CSSProperties = { opacity: 0.55 }
const valueStyle: React.CSSProperties = { color: '#f3d9a5' }
const sectionLabelStyle: React.CSSProperties = {
  fontSize: 10, textTransform: 'uppercase', letterSpacing: 2, opacity: 0.5, marginBottom: 4,
}
const listRowStyle: React.CSSProperties = { paddingLeft: 2 }
const emptyStyle: React.CSSProperties = { opacity: 0.4, paddingLeft: 2 }
const hintStyle: React.CSSProperties = {
  position: 'fixed', top: 10, left: 10, zIndex: 20,
  font: '11px/1 ui-monospace, monospace',
  color: 'rgba(255,255,255,0.35)',
  pointerEvents: 'none',
}
const kbdStyle: React.CSSProperties = {
  background: 'rgba(0,0,0,0.4)',
  border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: 3,
  padding: '0 4px',
  marginRight: 4,
}
