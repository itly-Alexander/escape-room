import { useEffect, useRef, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
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
import { JumpScare } from './JumpScare'
import { PursuitDirector } from '@/engine/PursuitDirector'
import { DevHUD } from './DevHUD'
import { WatchOverlay } from './WatchOverlay'
import { dollFaceDataUrl } from '@/engine/Doll'

const READABLE_DECAY_MS = 3200

function RenderedObjects() {
  const level = useWorld((s) => s.level)
  const pickedUp = useWorld((s) => s.pickedUpObjectIds)
  const flags = useWorld((s) => s.flags)
  // Objects held back by `appearsWhen` come into the world the first time
  // their flag is set, and then stay even if it's switched off again.
  const appeared = useRef(new Set<string>())
  if (!level) return null
  return (
    <>
      {level.objects.map((o) => {
        if (pickedUp.has(o.id)) return null
        if (o.appearsWhen && !appeared.current.has(o.id)) {
          if (!flags[o.appearsWhen]) return null
          appeared.current.add(o.id)
        }
        return <SceneObjectView key={o.id} object={o} animatePose />
      })}
    </>
  )
}

// Dev only: lets test scripts reach the camera and world state from the page.
function DevBridge() {
  const camera = useThree((s) => s.camera)
  useEffect(() => {
    ;(window as unknown as { __game?: unknown }).__game = { camera, world: useWorld }
  }, [camera])
  return null
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

  // Game over: let go of the mouse and stop the music; the jump scare takes over.
  const caught = useWorld((s) => s.caught)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!caught) return
    if (document.pointerLockElement) document.exitPointerLock()
    ambientMusic.stop()
  }, [caught])
  const retry = () => {
    if (!levelId) return
    const l = loadBundledLevel(levelId)
    if (!l) return
    loadLevel(l)
    ambientMusic.start('play')
    setAttempt((n) => n + 1) // remounts the scene, so the monster starts over
    setHasEverLocked(false)
  }

  // Readable panel: persists while the reticle is still on the source object.
  // Starts a short decay the moment you look away; cancels if you look back.
  useEffect(() => {
    if (!activeReadable || activeReadable.persistent) {
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

  // The padlock is keyboard-driven (WASD), so release the pointer lock while
  // it's open — otherwise the same keys would walk the player around.
  useEffect(() => {
    if (codePrompt && document.pointerLockElement) document.exitPointerLock()
  }, [codePrompt])

  const closeCodePrompt = () => {
    setCodePrompt(null)
    // Best effort: browsers may refuse without a fresh click/keypress.
    try { requestLock() } catch { /* falls back to the pause menu */ }
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
  const pauseMenuOpen = hasEverLocked && !locked && !codePrompt && !won && !caught
  // Before the first capture there's no dialog, just a click-to-begin hint.
  const showBeginHint = !hasEverLocked && !locked && !codePrompt && !won && !caught
  // Freeze r3f render loop (and thus flicker/pose animations) while the pause
  // menu is up. Modals (code prompt, win overlay) do NOT freeze — the player
  // needs to see the chest lid open after unlocking.
  const frameloop = pauseMenuOpen ? 'demand' : 'always'

  return (
    <div
      ref={canvasHostRef}
      style={{ width: '100vw', height: '100vh' }}
      onClick={showBeginHint ? requestLock : undefined}
    >
      <Canvas
        key={attempt}
        shadows
        frameloop={frameloop}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
        camera={{ fov: 70, near: 0.05, far: 100 }}
      >
        <color attach="background" args={[level.background]} />
        <LevelLights lights={level.lights} />
        <FullbrightOverlay />
        <RenderedObjects />
        <PursuitDirector />
        <FPSController level={level} locked={locked} />
        <InteractReticle
          level={level}
          enabled={locked}
          onTargetChange={setReticle}
          onCodeRequest={setCodePrompt}
        />
        <HeldItem level={level} />
        {import.meta.env.DEV && <DevBridge />}
      </Canvas>
      <PlayHUD
        reticle={locked ? reticle : null}
        codePromptObjectId={codePrompt}
        onCloseCodePrompt={closeCodePrompt}
        onExit={() => navigate('/')}
      />
      {showBeginHint && <BeginHint />}
      {pauseMenuOpen && (
        <PauseOverlay
          mode="paused"
          onResume={requestLock}
          onQuit={() => navigate('/')}
        />
      )}
      <WatchOverlay />
      {caught && (
        <JumpScare
          onRetry={retry}
          onQuit={() => navigate('/')}
          // Whoever caught you is who you see.
          faceSrc={level.objects.some((o) => o.mesh.kind === 'doll' && o.mesh.role === 'hunter') ? dollFaceDataUrl() : undefined}
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
        <h1 style={titleStyle}>
          {mode === 'paused' ? 'Paused' : 'Ready?'}
        </h1>
        <div style={subtitleStyle}>
          {mode === 'paused' ? '— the chamber waits —' : '— a chamber of locks and quiet secrets —'}
        </div>
        <div style={{ height: 24 }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 220 }}>
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

function BeginHint() {
  return (
    <div style={beginHintStyle}>
      click to begin
      <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7 }}>
        WASD move · Shift sprint · C crouch · E / Space interact · Esc pause
      </div>
    </div>
  )
}

function ControlsLegend() {
  return (
    <div style={{ marginTop: 28, fontSize: 13, opacity: 0.7, color: '#c9a76a', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px' }}>
      <code>W A S D</code><span>move</span>
      <code>Shift</code><span>sprint</span>
      <code>C</code><span>crouch</span>
      <code>Mouse</code><span>look</span>
      <code>E / Space</code><span>interact</span>
      <code>Esc</code><span>pause</span>
    </div>
  )
}

// Styled to match the start menu (MenuRoute.tsx) so the theme carries through.
const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0,
  background:
    'radial-gradient(ellipse at center, rgba(7,5,10,0.72) 0%, rgba(7,5,10,0.92) 100%)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: '#e8dcc0', zIndex: 10,
  fontFamily: '"IM Fell English", "Cinzel", serif',
}
const cardStyle: React.CSSProperties = {
  background: 'linear-gradient(180deg, rgba(50, 36, 22, 0.88) 0%, rgba(32, 22, 14, 0.88) 100%)',
  border: '1px solid rgba(120, 85, 50, 0.5)', borderRadius: 6,
  boxShadow: '0 20px 60px rgba(0,0,0,0.7), inset 0 0 60px rgba(0,0,0,0.4)',
  padding: '32px 40px 36px', minWidth: 340, textAlign: 'center',
}
const titleStyle: React.CSSProperties = {
  fontFamily: '"Cinzel Decorative", serif', fontWeight: 900, fontSize: 40,
  margin: 0, letterSpacing: 4, color: '#f3d9a5',
  textShadow: '0 0 20px rgba(255, 150, 60, 0.4), 0 0 2px rgba(0,0,0,0.9), 0 4px 12px rgba(0,0,0,0.9)',
}
const subtitleStyle: React.CSSProperties = {
  marginTop: 8, fontStyle: 'italic', fontSize: 15, opacity: 0.7, color: '#d9c08a', letterSpacing: 1,
}
const beginHintStyle: React.CSSProperties = {
  position: 'fixed', left: 0, right: 0, bottom: 48, textAlign: 'center',
  fontFamily: '"IM Fell English", "Cinzel", serif', fontStyle: 'italic',
  fontSize: 15, letterSpacing: 2, color: '#c9a76a', opacity: 0.8,
  textShadow: '0 2px 6px rgba(0,0,0,0.9)', pointerEvents: 'none',
}
const menuBtn: React.CSSProperties = {
  color: '#f3d9a5', padding: '10px 16px', borderRadius: 3, cursor: 'pointer',
  fontFamily: '"Cinzel", serif', fontSize: 13, letterSpacing: 2, textTransform: 'uppercase',
}
const primaryBtn: React.CSSProperties = {
  ...menuBtn,
  background: 'linear-gradient(180deg, #5a3a1e 0%, #3a2410 100%)',
  border: '1px solid #8a5e30',
}
const ghostBtn: React.CSSProperties = {
  ...menuBtn,
  background: 'rgba(20, 14, 8, 0.5)',
  border: '1px solid rgba(120, 85, 50, 0.5)',
  color: '#c9a76a',
}
