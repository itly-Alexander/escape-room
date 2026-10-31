import { useEffect, useState } from 'react'
import faceUrl from '@/assets/monster-face.png'

// Game over: her face fills the screen with a deafening shriek, then the
// "caught" card offers a retry.

/** A loud procedural shriek: screaming saws and noise through a harsh shaper, with a sub-bass hit under it. */
function playShriek(): () => void {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctx()
    void ctx.resume().catch(() => {})
    const t = ctx.currentTime
    const dur = 2.4

    const master = ctx.createGain()
    master.gain.setValueAtTime(0.0001, t)
    master.gain.exponentialRampToValueAtTime(1, t + 0.03)
    master.gain.setValueAtTime(1, t + dur * 0.7)
    master.gain.exponentialRampToValueAtTime(0.0001, t + dur)

    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -18
    comp.ratio.value = 8
    master.connect(comp)
    comp.connect(ctx.destination)

    // A human-ish scream: one glottal source (a saw, with a breathy rasp mixed in) at a
    // high, straining pitch, pushed through open "ah" formants. Pitch jumps up, strains,
    // wavers with fast vibrato and cracks, then falls off as the breath runs out.
    const src = ctx.createGain()
    const o = ctx.createOscillator()
    o.type = 'sawtooth'
    const f0 = o.frequency
    f0.setValueAtTime(240, t)
    f0.exponentialRampToValueAtTime(560, t + 0.12)
    f0.linearRampToValueAtTime(660, t + 0.9)
    f0.setValueAtTime(660, t + 0.9)
    f0.linearRampToValueAtTime(790, t + 1.0) // the crack: a sudden jump up
    f0.linearRampToValueAtTime(620, t + 1.7)
    f0.exponentialRampToValueAtTime(330, t + dur)
    const vib = ctx.createOscillator()
    vib.frequency.value = 6.5
    const vibDepth = ctx.createGain()
    vibDepth.gain.value = 16
    vib.connect(vibDepth)
    vibDepth.connect(f0)
    // Shaky, uneven pitch on top.
    const shake = ctx.createOscillator()
    shake.type = 'triangle'
    shake.frequency.value = 17
    const shakeDepth = ctx.createGain()
    shakeDepth.gain.value = 30
    shake.connect(shakeDepth)
    shakeDepth.connect(f0)
    const cord = ctx.createGain()
    cord.gain.value = 0.45
    o.connect(cord)
    cord.connect(src)

    // Breath/rasp noise.
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
    const noise = ctx.createBufferSource()
    noise.buffer = buf
    noise.loop = true
    const ng = ctx.createGain()
    ng.gain.value = 0.9
    noise.connect(ng)
    // Rasp: the noise (and so the whole voice) is chopped by a fast, ragged flutter.
    const rasp = ctx.createGain()
    rasp.gain.value = 0.55
    const raspLfo = ctx.createOscillator()
    raspLfo.type = 'sawtooth'
    raspLfo.frequency.value = 62
    const raspDepth = ctx.createGain()
    raspDepth.gain.value = 0.45
    raspLfo.connect(raspDepth)
    raspDepth.connect(rasp.gain)
    raspLfo.start(t)
    raspLfo.stop(t + dur)
    ng.connect(rasp)
    rasp.connect(src)

    // Throat strain: gentle distortion, then the vocal tract.
    const shaper = ctx.createWaveShaper()
    const curve = new Float32Array(1024)
    for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh(((i / 1023) * 2 - 1) * 4)
    shaper.curve = curve
    src.connect(shaper)
    const voice = ctx.createGain()
    voice.gain.value = 1.4
    voice.connect(master)
    const formant = (freq: number, q: number, gain: number) => {
      const f = ctx.createBiquadFilter()
      f.type = 'bandpass'
      f.frequency.setValueAtTime(freq * 0.8, t)
      f.frequency.exponentialRampToValueAtTime(freq, t + 0.2) // mouth snaps open
      f.Q.value = q
      const g = ctx.createGain()
      g.gain.value = gain
      shaper.connect(f)
      f.connect(g)
      g.connect(voice)
    }
    formant(850, 5, 1.6) // F1: wide-open "ah"
    formant(1500, 7, 1.2) // F2
    formant(2500, 9, 0.8) // F3
    formant(3400, 8, 0.5) // the shrill edge
    // Some of the raw tone gets through so it isn't all filtered.
    const direct = ctx.createGain()
    direct.gain.value = 0.15
    shaper.connect(direct)
    direct.connect(voice)

    o.start(t)
    vib.start(t)
    shake.start(t)
    noise.start(t)
    for (const n of [o, vib, shake, noise]) n.stop(t + dur)

    // The hit: a sub-bass thump as the face slams in.
    const boom = ctx.createOscillator()
    boom.frequency.setValueAtTime(90, t)
    boom.frequency.exponentialRampToValueAtTime(28, t + 0.5)
    const bg = ctx.createGain()
    bg.gain.setValueAtTime(1.2, t)
    bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.7)
    boom.connect(bg)
    bg.connect(master)
    boom.start(t)
    boom.stop(t + 0.8)

    return () => void ctx.close().catch(() => {})
  } catch {
    return () => {}
  }
}

export function JumpScare({ onRetry, onQuit, faceSrc = faceUrl }: { onRetry: () => void; onQuit: () => void; faceSrc?: string }) {
  const [card, setCard] = useState(false)

  useEffect(() => {
    const stop = playShriek()
    const id = window.setTimeout(() => setCard(true), 2600)
    return () => {
      window.clearTimeout(id)
      stop()
    }
  }, [])

  return (
    <div style={rootStyle}>
      <style>{`
        @keyframes scare-slam { 0% { transform: scale(0.4); opacity: 0 } 6% { opacity: 1 } 14% { transform: scale(1.25) } 100% { transform: scale(1.55) } }
        @keyframes scare-shake { 0%,100% { translate: 0 0 } 20% { translate: -14px 9px } 40% { translate: 12px -10px } 60% { translate: -9px -12px } 80% { translate: 13px 8px } }
        @keyframes scare-flash { 0% { opacity: 1 } 100% { opacity: 0 } }
        @keyframes scare-fade { 0% { opacity: 0 } 100% { opacity: 1 } }
      `}</style>
      <div style={{ position: 'absolute', inset: 0, animation: 'scare-shake 0.09s linear infinite' }}>
        <img
          src={faceSrc}
          alt=""
          style={{
            width: '100%', height: '100%', objectFit: 'cover',
            animation: 'scare-slam 2.6s cubic-bezier(.1,.9,.2,1) forwards',
            filter: 'contrast(1.35) saturate(1.2) brightness(1.1)',
          }}
        />
      </div>
      <div style={{ position: 'absolute', inset: 0, background: '#fff', animation: 'scare-flash 0.25s ease-out forwards' }} />
      <div style={{ position: 'absolute', inset: 0, boxShadow: 'inset 0 0 220px 80px rgba(80,0,0,0.85)' }} />
      {card && (
        <div style={cardWrap}>
          <h1 style={{ fontSize: 64, margin: 0, letterSpacing: 6, color: '#b01818' }}>CAUGHT</h1>
          <div style={{ display: 'flex', gap: 12, marginTop: 28 }}>
            <button style={btn} onClick={onRetry}>Try again</button>
            <button style={btn} onClick={onQuit}>Quit to menu</button>
          </div>
        </div>
      )}
    </div>
  )
}

const rootStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 50, background: '#000', overflow: 'hidden',
  fontFamily: '"IM Fell English", "Cinzel", serif',
}
const cardWrap: React.CSSProperties = {
  position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
  alignItems: 'center', justifyContent: 'center',
  background: 'rgba(0,0,0,0.78)', animation: 'scare-fade 0.8s ease-out forwards',
}
const btn: React.CSSProperties = {
  background: 'rgba(40,10,10,0.9)', color: '#e8dcc0', border: '1px solid #6a2020',
  padding: '10px 22px', fontSize: 16, cursor: 'pointer', fontFamily: 'inherit',
}
