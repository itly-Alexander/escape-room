import { useEffect, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { useNavigate, useParams } from 'react-router-dom'
import * as THREE from 'three'
import { loadBundledLevel } from '@/engine/levelStorage'
import { ambientMusic } from '@/engine/ambient'
import { useWorld } from '@/state/world'
import { LevelLights } from '@/engine/Lights'
import { SceneObjectView } from '@/engine/SceneObjectView'
import { FPSController } from './FPSController'
import { InteractReticle, type ReticleTarget } from './InteractReticle'
import { PlayHUD } from './PlayHUD'
import { HeldItem } from './HeldItem'
import { DevHUD } from './DevHUD'

const READABLE_DECAY_MS = 3200

function RenderedObjects() {
  const level = useWorld((s) => s.level)
  const pickedUp = useWorld((s) => s.pickedUpObjectIds)
  if (!level) return null
  return (
    <>
      {level.objects.map((o) =>
        pickedUp.has(o.id) ? null : <SceneObjectView key={o.id} object={o} animatePose />,
      )}
    </>
  )
}

// Hidden dev aid (F4). Overlays a bright hemisphere + ambient on top of the
// level lights so dark levels become fully legible for debugging.
function FullbrightOverlay() {
  const on = useWorld((s) => s.debugFullbright)
  if (!on) return null
  return (
    <>
      <ambientLight color="#ffffff" intensity={1.6} />
      <hemisphereLight color="#ffffff" groundColor="#cfd4dc" intensity={0.9} />
    </>
  )
}

export function PlayRoute() {
  const { levelId } = useParams()
  const navigate = useNavigate()
  const level = useWorld((s) => s.level)
  const loadLevel = useWorld((s) => s.loadLevel)
  const activeReadable = useWorld((s) => s.activeReadable)
  const setActiveReadable = useWorld((s) => s.setActiveReadable)
  const [reticle, setReticle] = useState<ReticleTarget | null>(null)
  const [codePrompt, setCodePrompt] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [locked, setLocked] = useState(false)
  const [hasEverLocked, setHasEverLocked] = useState(false)
  const canvasHostRef = useRef<HTMLDivElement>(null)
  const readableDecayRef = useRef<number | null>(null)

  useEffect(() => {
    if (!levelId) return
    try {
      const l = loadBundledLevel(levelId)
      if (!l) {
        setError(`Level "${levelId}" not found`)
        return
      }
      loadLevel(l)
      ambientMusic.start('play')
    } catch (e) {
      setError(String(e))
    }
    return () => { ambientMusic.stop() }
  }, [levelId, loadLevel])

  useEffect(() => {
    const onChange = () => {
      const nowLocked = !!document.pointerLockElement
      setLocked(nowLocked)
      if (nowLocked) setHasEverLocked(true)
    }
    document.addEventListener('pointerlockchange', onChange)
    return () => document.removeEventListener('pointerlockchange', onChange)
  }, [])

  const won = useWorld((s) => s.won)
  useEffect(() => {
    if (won && document.pointerLockElement) document.exitPointerLock()
  }, [won])

  // Readable panel: persists while the reticle is still on the source object.
  // Starts a short decay the moment you look away; cancels if you look back.
  useEffect(() => {
    if (!activeReadable) {
      if (readableDecayRef.current) {
        clearTimeout(readableDecayRef.current)
        readableDecayRef.current = null
      }
      return
    }
    const stillLooking = reticle?.object.id === activeReadable.objectId
    if (stillLooking) {
      if (readableDecayRef.current) {
        clearTimeout(readableDecayRef.current)
        readableDecayRef.current = null
      }
      return
    }
    if (!readableDecayRef.current) {
      readableDecayRef.current = window.setTimeout(() => {
        setActiveReadable(null)
        readableDecayRef.current = null
      }, READABLE_DECAY_MS)
    }
  }, [reticle, activeReadable, setActiveReadable])

  const requestLock = () => {
    const canvas = canvasHostRef.current?.querySelector('canvas')
    canvas?.requestPointerLock?.()
  }

  if (error) {
    return (
      <div style={{ padding: 40 }}>
        <p>{error}</p>
        <button onClick={() => navigate('/')}>Back to menu</button>
      </div>
    )
  }

  if (!level) return <div style={{ padding: 40 }}>Loading…</div>

  // True "paused" state: pause menu is up, not an in-game modal.
  const pauseMenuOpen = !locked && !codePrompt && !won
  // Freeze r3f render loop (and thus flicker/pose animations) while the pause
  // menu is up. Modals (code prompt, win overlay) do NOT freeze — the player
  // needs to see the chest lid open after unlocking.
  const frameloop = pauseMenuOpen ? 'demand' : 'always'

  return (
    <div ref={canvasHostRef} style={{ width: '100vw', height: '100vh' }}>
      <Canvas
        shadows
        frameloop={frameloop}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
        camera={{ fov: 70, near: 0.05, far: 100 }}
      >
        <color attach="background" args={[level.background]} />
        <LevelLights lights={level.lights} />
        <FullbrightOverlay />
        <RenderedObjects />
        <FPSController level={level} locked={locked} />
        <InteractReticle
          level={level}
          enabled={locked}
          onTargetChange={setReticle}
          onCodeRequest={setCodePrompt}
        />
        <HeldItem level={level} />
      </Canvas>
      <PlayHUD
        reticle={locked ? reticle : null}
        codePromptObjectId={codePrompt}
        onCloseCodePrompt={() => setCodePrompt(null)}
        onExit={() => navigate('/')}
      />
      {pauseMenuOpen && (
        <PauseOverlay
          mode={hasEverLocked ? 'paused' : 'start'}
          onResume={requestLock}
          onQuit={() => navigate('/')}
        />
      )}
      {import.meta.env.DEV && <DevHUD reticle={reticle} />}
    </div>
  )
}

function PauseOverlay({
  mode, onResume, onQuit,
}: {
  mode: 'start' | 'paused'
  onResume: () => void
  onQuit: () => void
}) {
  return (
    <div style={overlayStyle}>
      <div style={cardStyle}>
        <h1 style={{ margin: 0, fontSize: 28, letterSpacing: 2 }}>
          {mode === 'paused' ? 'Paused' : 'Ready?'}
        </h1>
        <div style={{ height: 24 }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 220 }}>
          <button style={primaryBtn} onClick={onResume}>
            {mode === 'paused' ? 'Resume' : 'Start'}
          </button>
          <button style={ghostBtn} onClick={onQuit}>
            Quit to menu
          </button>
        </div>
        {mode === 'start' && <ControlsLegend />}
      </div>
    </div>
  )
}

function ControlsLegend() {
  return (
    <div style={{ marginTop: 28, fontSize: 12, opacity: 0.6, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px' }}>
      <code>W A S D</code><span>move</span>
      <code>Shift</code><span>crouch</span>
      <code>Mouse</code><span>look</span>
      <code>E / Space</code><span>interact</span>
      <code>Esc</code><span>pause</span>
    </div>
  )
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.78)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: '#eaeaea', zIndex: 10,
}
const cardStyle: React.CSSProperties = {
  background: '#141414', border: '1px solid #222', borderRadius: 10,
  padding: '32px 36px', minWidth: 320, textAlign: 'center',
}
const primaryBtn: React.CSSProperties = {
  background: '#1a3a1a', color: '#dff5df', border: '1px solid #2a5a2a',
  padding: '10px 14px', borderRadius: 4, cursor: 'pointer', fontSize: 14,
}
const ghostBtn: React.CSSProperties = {
  background: 'transparent', color: '#eaeaea', border: '1px solid #333',
  padding: '10px 14px', borderRadius: 4, cursor: 'pointer', fontSize: 14,
}
