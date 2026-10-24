import { useEffect, useRef, useState } from 'react'
import { useWorld } from '@/state/world'
import { tryInteract } from '@/engine/interact'
import type { SceneObject } from '@/schema/level'
import type { ReticleTarget } from './InteractReticle'

type Props = {
  reticle: ReticleTarget | null
  codePromptObjectId: string | null
  onCloseCodePrompt: () => void
  onExit: () => void
}

export function PlayHUD({ reticle, codePromptObjectId, onCloseCodePrompt, onExit }: Props) {
  const hud = useWorld((s) => s.hud)
  const inventory = useWorld((s) => s.inventory)
  const level = useWorld((s) => s.level)
  const won = useWorld((s) => s.won)
  const selectedItem = useWorld((s) => s.selectedItem)
  const selectItem = useWorld((s) => s.selectItem)
  const pruneHud = useWorld((s) => s.pruneHud)
  const activeReadable = useWorld((s) => s.activeReadable)
  const [, force] = useState(0)

  useEffect(() => {
    const id = setInterval(() => {
      pruneHud()
      force((n) => n + 1)
    }, 250)
    return () => clearInterval(id)
  }, [pruneHud])

  // 1–9 to toggle selection by slot index.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      const match = /^Digit([1-9])$/.exec(e.code)
      if (!match) return
      const idx = Number(match[1]) - 1
      const w = useWorld.getState()
      const target = w.inventory[idx] ?? null
      if (!target) return
      selectItem(w.selectedItem === target ? null : target)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectItem])

  const codeObj = codePromptObjectId ? level?.objects.find((o) => o.id === codePromptObjectId) : null
  const codeLength = codeObj?.interact?.lock?.requires.kind === 'code'
    ? codeObj.interact.lock.requires.code.length
    : 3

  return (
    <div style={rootStyle}>
      {/* Reticle */}
      <div style={reticleStyle}>
        <div style={reticleDot(!!reticle)} />
      </div>

      {/* Interact prompt */}
      {reticle && (
        <div style={promptStyle}>
          <kbd style={kbd}>E</kbd> {reticle.prompt}
        </div>
      )}

      {/* HUD toasts */}
      <div style={toastColumn}>
        {hud.map((m) => (
          <div key={m.id} style={toastStyle}>
            {m.text}
          </div>
        ))}
      </div>

      {/* Readable panel (parchment, persistent while looking at the source) */}
      {activeReadable && <ReadablePanel text={activeReadable.text} />}

      {/* Inventory hotbar */}
      {inventory.length > 0 && level && (
        <div style={hotbarStyle}>
          {inventory.map((id, i) => {
            const meta = findPickupMeta(level, id)
            const isSelected = selectedItem === id
            return (
              <InventorySlot
                key={id}
                itemId={id}
                label={meta.label}
                icon={meta.icon}
                index={i + 1}
                selected={isSelected}
                onClick={() => selectItem(isSelected ? null : id)}
              />
            )
          })}
        </div>
      )}

      {/* Padlock modal */}
      {codeObj && (
        <PadlockModal
          codeLength={codeLength}
          sourceObject={codeObj}
          onCancel={onCloseCodePrompt}
          onSubmit={(code) => {
            const r = tryInteract(codeObj, code)
            if (r.kind === 'ok') onCloseCodePrompt()
            return r.kind
          }}
        />
      )}

      {/* Win overlay */}
      {won && (
        <div style={winOverlay}>
          <h1 style={{ margin: 0, fontSize: 48 }}>You escaped</h1>
          <button style={button} onClick={onExit}>Back to menu</button>
        </div>
      )}
    </div>
  )
}

function ReadablePanel({ text }: { text: string }) {
  return (
    <div style={readableBackdropStyle}>
      <div style={readableCardStyle}>{text}</div>
    </div>
  )
}

function InventorySlot({
  itemId, label, icon, index, selected, onClick,
}: {
  itemId: string
  label: string
  icon: string | null
  index: number
  selected: boolean
  onClick: () => void
}) {
  const hue = hashHue(itemId)
  return (
    <button
      onClick={onClick}
      title={`${label} (${index})`}
      style={{
        ...slotStyle,
        borderColor: selected ? '#ffb84d' : '#333',
        boxShadow: selected ? '0 0 0 2px rgba(255,184,77,0.35)' : 'none',
      }}
    >
      <div
        style={{
          width: 44, height: 44, borderRadius: 6,
          background: `hsl(${hue} 55% 28%)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 26,
          boxShadow: 'inset 0 -8px 20px rgba(0,0,0,0.35)',
          lineHeight: 1,
        }}
      >
        {icon ?? (label.replace(/[^a-zA-Z0-9]/g, '').slice(0, 1).toUpperCase() || '?')}
      </div>
      <div style={{ fontSize: 11, opacity: 0.85, marginTop: 6 }}>{label}</div>
      <div style={{ position: 'absolute', top: 4, right: 6, fontSize: 10, opacity: 0.45 }}>
        {index}
      </div>
    </button>
  )
}

function findPickupMeta(level: { objects: { interact?: { behavior: unknown } }[] } | null, itemId: string): { label: string; icon: string | null } {
  if (!level) return { label: prettify(itemId), icon: null }
  for (const o of level.objects) {
    const b = o.interact?.behavior as { type?: string; itemId?: string; label?: string; icon?: string } | undefined
    if (b?.type === 'pickup' && b.itemId === itemId) {
      return { label: b.label ?? prettify(itemId), icon: b.icon ?? null }
    }
  }
  return { label: prettify(itemId), icon: null }
}

function hashHue(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h) % 360
}

function prettify(id: string): string {
  return id.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function PadlockModal({
  codeLength,
  sourceObject: _sourceObject,
  onCancel,
  onSubmit,
}: {
  codeLength: number
  sourceObject: SceneObject
  onCancel: () => void
  onSubmit: (code: string) => 'ok' | 'none' | 'locked'
}) {
  const [digits, setDigits] = useState<number[]>(() => Array(codeLength).fill(0))
  const [shake, setShake] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)

  const change = (i: number, delta: number) => {
    setDigits((d) => d.map((v, j) => (j === i ? (v + delta + 10) % 10 : v)))
  }
  const submit = () => {
    const code = digits.join('')
    const r = onSubmit(code)
    if (r === 'locked') {
      setShake(true)
      setTimeout(() => setShake(false), 400)
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
      else if (e.key === 'Enter') submit()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [digits])

  return (
    <div style={padlockBackdrop} onClick={onCancel}>
      <div
        ref={cardRef}
        style={{ ...padlockCard, animation: shake ? 'padlock-shake 0.4s ease-in-out' : undefined }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Shackle */}
        <svg width="120" height="70" viewBox="0 0 120 70" style={{ display: 'block', margin: '0 auto -12px' }}>
          <path
            d="M 30 65 L 30 32 A 30 30 0 0 1 90 32 L 90 65"
            fill="none"
            stroke="#9a8e78"
            strokeWidth="10"
            strokeLinecap="round"
          />
          <path
            d="M 30 65 L 30 32 A 30 30 0 0 1 90 32 L 90 65"
            fill="none"
            stroke="#4a4238"
            strokeWidth="2"
            strokeLinecap="round"
            opacity="0.5"
          />
        </svg>

        <div style={padlockBodyStyle}>
          <div style={padlockLabelStyle}>Enter combination</div>
          <div style={rowStyle}>
            {digits.map((d, i) => (
              <Dial key={i} value={d} onUp={() => change(i, 1)} onDown={() => change(i, -1)} />
            ))}
          </div>

          <div style={buttonRowStyle}>
            <button style={ghostButton} onClick={onCancel}>Cancel</button>
            <button style={unlockButton} onClick={submit}>Unlock</button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes padlock-shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-8px); }
          40% { transform: translateX(8px); }
          60% { transform: translateX(-6px); }
          80% { transform: translateX(4px); }
        }
      `}</style>
    </div>
  )
}

function Dial({ value, onUp, onDown }: { value: number; onUp: () => void; onDown: () => void }) {
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    if (e.deltaY < 0) onUp()
    else onDown()
  }
  return (
    <div style={dialStyle} onWheel={onWheel}>
      <button style={dialArrow} onClick={onUp} aria-label="increment">▲</button>
      <div style={dialWindow}>
        <div style={{ ...dialDigit, opacity: 0.25 }}>{(value + 1) % 10}</div>
        <div style={dialDigit}>{value}</div>
        <div style={{ ...dialDigit, opacity: 0.25 }}>{(value + 9) % 10}</div>
      </div>
      <button style={dialArrow} onClick={onDown} aria-label="decrement">▼</button>
    </div>
  )
}

const rootStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, pointerEvents: 'none', color: '#eaeaea',
  fontFamily: 'ui-sans-serif, system-ui, sans-serif',
}
const reticleStyle: React.CSSProperties = {
  position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
}
const reticleDot = (hot: boolean): React.CSSProperties => ({
  width: hot ? 10 : 6, height: hot ? 10 : 6, borderRadius: '50%',
  background: hot ? '#ffaa33' : '#eaeaea', opacity: hot ? 0.95 : 0.65,
  transition: 'all 80ms ease-out',
})
const promptStyle: React.CSSProperties = {
  position: 'fixed', left: '50%', top: 'calc(50% + 28px)', transform: 'translateX(-50%)',
  background: 'rgba(0,0,0,0.55)', padding: '6px 12px', borderRadius: 6, fontSize: 13,
}
const kbd: React.CSSProperties = {
  background: '#333', border: '1px solid #555', borderRadius: 3, padding: '1px 6px', marginRight: 6,
  fontFamily: 'ui-monospace, monospace', fontSize: 12,
}
const toastColumn: React.CSSProperties = {
  position: 'fixed', left: '50%', top: 48, transform: 'translateX(-50%)',
  display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center', maxWidth: 480,
}
const toastStyle: React.CSSProperties = {
  background: 'rgba(0,0,0,0.65)', padding: '8px 14px', borderRadius: 6, fontSize: 14,
  textAlign: 'center',
}
const hotbarStyle: React.CSSProperties = {
  position: 'fixed', left: '50%', bottom: 24, transform: 'translateX(-50%)',
  display: 'flex', gap: 8,
}
const slotStyle: React.CSSProperties = {
  position: 'relative',
  background: 'rgba(14,14,14,0.85)', border: '1px solid #333', borderRadius: 8,
  padding: '8px 10px', textAlign: 'center', minWidth: 70,
  display: 'flex', flexDirection: 'column', alignItems: 'center',
  color: '#eaeaea',
  font: 'inherit',
  cursor: 'pointer',
  pointerEvents: 'auto',
}
const readableBackdropStyle: React.CSSProperties = {
  position: 'fixed', left: 0, right: 0, bottom: 120,
  display: 'flex', justifyContent: 'center', pointerEvents: 'none',
}
const readableCardStyle: React.CSSProperties = {
  maxWidth: 540,
  padding: '22px 32px',
  background: 'linear-gradient(180deg, rgba(230, 210, 170, 0.95) 0%, rgba(210, 185, 140, 0.95) 100%)',
  color: '#2a1a0a',
  fontFamily: '"IM Fell English", serif',
  fontSize: 17,
  fontStyle: 'italic',
  lineHeight: 1.5,
  borderRadius: 4,
  border: '1px solid rgba(80, 50, 20, 0.5)',
  boxShadow: '0 12px 32px rgba(0,0,0,0.6), inset 0 0 40px rgba(120, 85, 50, 0.15)',
  textAlign: 'center',
}
const padlockBackdrop: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'auto',
}
const padlockCard: React.CSSProperties = {
  background: 'transparent',
  display: 'flex', flexDirection: 'column', alignItems: 'center',
  minWidth: 300,
}
const padlockBodyStyle: React.CSSProperties = {
  position: 'relative',
  background: 'linear-gradient(180deg, #6a6256 0%, #3a3630 100%)',
  border: '2px solid #2a2520',
  borderRadius: 14,
  padding: '28px 32px 24px',
  boxShadow: '0 24px 56px rgba(0,0,0,0.75), inset 0 2px 4px rgba(255,255,255,0.12), inset 0 -4px 10px rgba(0,0,0,0.5)',
  minWidth: 320,
}
const padlockLabelStyle: React.CSSProperties = {
  fontFamily: '"Cinzel", serif',
  fontSize: 11,
  letterSpacing: 3,
  textTransform: 'uppercase',
  textAlign: 'center',
  color: '#d6c08a',
  opacity: 0.85,
  marginBottom: 14,
}
const rowStyle: React.CSSProperties = {
  display: 'flex', gap: 10, justifyContent: 'center',
}
const dialStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
}
const dialWindow: React.CSSProperties = {
  width: 48, height: 72,
  background: 'linear-gradient(180deg, #141210 0%, #2a2420 50%, #141210 100%)',
  border: '1px solid #0a0806',
  borderRadius: 4,
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
  boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.6), 0 1px 2px rgba(255,255,255,0.08)',
  overflow: 'hidden',
  cursor: 'ns-resize',
}
const dialDigit: React.CSSProperties = {
  fontFamily: '"Cinzel", serif',
  fontSize: 20,
  fontWeight: 700,
  color: '#f3d9a5',
  lineHeight: 1.15,
}
const dialArrow: React.CSSProperties = {
  width: 48, height: 20,
  background: 'linear-gradient(180deg, #857a68 0%, #5a5248 100%)',
  color: '#2a2420',
  border: '1px solid #2a2520',
  borderRadius: 3,
  cursor: 'pointer',
  fontSize: 10,
  padding: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}
const buttonRowStyle: React.CSSProperties = {
  display: 'flex', gap: 8, marginTop: 20, justifyContent: 'center',
}
const ghostButton: React.CSSProperties = {
  background: 'transparent', color: '#d6c08a', border: '1px solid #5a5248',
  padding: '8px 18px', borderRadius: 3, cursor: 'pointer',
  fontFamily: '"Cinzel", serif', fontSize: 12, letterSpacing: 2, textTransform: 'uppercase',
}
const unlockButton: React.CSSProperties = {
  background: 'linear-gradient(180deg, #5a3a1e 0%, #3a2410 100%)',
  color: '#f3d9a5', border: '1px solid #8a5e30',
  padding: '8px 20px', borderRadius: 3, cursor: 'pointer',
  fontFamily: '"Cinzel", serif', fontSize: 12, letterSpacing: 2, textTransform: 'uppercase',
}
const button: React.CSSProperties = {
  background: '#2a2a2a', color: '#eaeaea', border: '1px solid #444',
  padding: '8px 14px', borderRadius: 4, cursor: 'pointer', pointerEvents: 'auto',
}
const winOverlay: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
  gap: 24, pointerEvents: 'auto',
}
