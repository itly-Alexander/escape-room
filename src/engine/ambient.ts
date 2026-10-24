// Procedural ambient score + one-shot SFX. No audio files — a slow drone
// with randomized bell tones in a minor pentatonic, plus synthesized
// pickup / locked / door / win cues.
//
// All sound starts on a user gesture (browser autoplay rules). The ambient
// has two modes: 'menu' (louder, bell tones) and 'play' (quieter, no bells).

type Node = { stop: () => void }
type Mode = 'menu' | 'play'

class AmbientMusic {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private nodes: Node[] = []
  private bellTimer: number | null = null
  private mode: Mode | null = null

  start(mode: Mode) {
    if (this.mode === mode) return
    if (this.mode) {
      this.stop()
    }
    this.mode = mode
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = this.ctx ?? new Ctx()
    this.ctx = ctx
    const master = ctx.createGain()
    master.gain.value = 0
    master.connect(ctx.destination)
    this.master = master

    const targetGain = mode === 'menu' ? 0.35 : 0.18
    master.gain.linearRampToValueAtTime(targetGain, ctx.currentTime + 3.5)

    this.nodes.push(this.drone(ctx, master, 55, 'sawtooth', -3, 180))
    this.nodes.push(this.drone(ctx, master, 55.4, 'sawtooth', -3, 180))
    this.nodes.push(this.drone(ctx, master, 82.5, 'sine', 0, 400))
    this.nodes.push(this.drone(ctx, master, 110, 'sine', -4, 500))

    const lfo = ctx.createOscillator()
    const lfoGain = ctx.createGain()
    lfo.frequency.value = 0.08
    lfoGain.gain.value = 0.08
    lfo.connect(lfoGain)
    lfoGain.connect(master.gain)
    lfo.start()
    this.nodes.push({ stop: () => { try { lfo.stop() } catch { /* ignore */ } } })

    if (mode === 'menu') this.scheduleBell()
  }

  stop() {
    if (!this.mode) return
    this.mode = null
    const ctx = this.ctx
    const master = this.master
    if (this.bellTimer != null) {
      clearTimeout(this.bellTimer)
      this.bellTimer = null
    }
    if (!ctx || !master) return
    master.gain.cancelScheduledValues(ctx.currentTime)
    master.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.2)
    const nodes = this.nodes
    this.nodes = []
    setTimeout(() => {
      for (const n of nodes) n.stop()
    }, 1400)
    this.master = null
  }

  isStarted() {
    return this.mode !== null
  }

  private drone(
    ctx: AudioContext,
    out: AudioNode,
    freq: number,
    type: OscillatorType,
    gainDb: number,
    lpfHz: number,
  ): Node {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    const lpf = ctx.createBiquadFilter()
    osc.type = type
    osc.frequency.value = freq
    lpf.type = 'lowpass'
    lpf.frequency.value = lpfHz
    lpf.Q.value = 0.6
    const linGain = Math.pow(10, gainDb / 20) * 0.18
    gain.gain.value = linGain
    osc.connect(lpf)
    lpf.connect(gain)
    gain.connect(out)
    osc.start()
    return { stop: () => { try { osc.stop() } catch { /* ignore */ } } }
  }

  private scheduleBell() {
    if (this.mode !== 'menu') return
    const delay = 4500 + Math.random() * 7000
    this.bellTimer = window.setTimeout(() => {
      this.playBell()
      this.scheduleBell()
    }, delay)
  }

  private readonly BELL_FREQS = [220, 261.63, 293.66, 329.63, 392]

  private playBell() {
    const ctx = this.ctx
    const master = this.master
    if (!ctx || !master) return
    const freq = this.BELL_FREQS[Math.floor(Math.random() * this.BELL_FREQS.length)]
    const now = ctx.currentTime

    const g = ctx.createGain()
    g.gain.setValueAtTime(0, now)
    g.gain.linearRampToValueAtTime(0.12, now + 0.04)
    g.gain.exponentialRampToValueAtTime(0.001, now + 4.5)

    const o1 = ctx.createOscillator()
    o1.type = 'sine'
    o1.frequency.value = freq
    const o2 = ctx.createOscillator()
    o2.type = 'sine'
    o2.frequency.value = freq * 2.01
    const o2g = ctx.createGain()
    o2g.gain.value = 0.18

    o1.connect(g)
    o2.connect(o2g)
    o2g.connect(g)
    g.connect(master)
    o1.start(now)
    o2.start(now)
    o1.stop(now + 5)
    o2.stop(now + 5)
  }
}

export const ambientMusic = new AmbientMusic()

// ---- SFX ----

export type SfxKind = 'pickup' | 'locked' | 'open' | 'win' | 'read'

class Sfx {
  private ctx: AudioContext | null = null

  private ensure(): AudioContext {
    if (this.ctx) return this.ctx
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    this.ctx = new Ctx()
    return this.ctx
  }

  play(kind: SfxKind) {
    try {
      const ctx = this.ensure()
      const now = ctx.currentTime
      switch (kind) {
        case 'pickup':
          this.chime(ctx, now, [660, 990], 0.25, 0.14)
          break
        case 'locked':
          this.thud(ctx, now, 110, 0.35, 0.18)
          this.thud(ctx, now + 0.08, 95, 0.3, 0.15)
          break
        case 'open':
          this.creak(ctx, now)
          break
        case 'win':
          this.chime(ctx, now, [523.25, 659.25, 783.99], 1.4, 0.22)
          break
        case 'read':
          this.paperRustle(ctx, now)
          break
      }
    } catch {
      // Audio may not be unlocked yet — silently ignore.
    }
  }

  private chime(ctx: AudioContext, when: number, freqs: number[], decay: number, peak: number) {
    freqs.forEach((f, i) => {
      const start = when + i * 0.08
      const g = ctx.createGain()
      g.gain.setValueAtTime(0, start)
      g.gain.linearRampToValueAtTime(peak, start + 0.02)
      g.gain.exponentialRampToValueAtTime(0.001, start + decay)
      const o = ctx.createOscillator()
      o.type = 'triangle'
      o.frequency.value = f
      o.connect(g)
      g.connect(ctx.destination)
      o.start(start)
      o.stop(start + decay + 0.05)
    })
  }

  private thud(ctx: AudioContext, when: number, freq: number, decay: number, peak: number) {
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, when)
    g.gain.linearRampToValueAtTime(peak, when + 0.005)
    g.gain.exponentialRampToValueAtTime(0.001, when + decay)
    const o = ctx.createOscillator()
    o.type = 'square'
    o.frequency.setValueAtTime(freq * 1.4, when)
    o.frequency.exponentialRampToValueAtTime(freq * 0.6, when + decay)
    const lpf = ctx.createBiquadFilter()
    lpf.type = 'lowpass'
    lpf.frequency.value = 400
    o.connect(lpf)
    lpf.connect(g)
    g.connect(ctx.destination)
    o.start(when)
    o.stop(when + decay + 0.05)
  }

  private creak(ctx: AudioContext, when: number) {
    const dur = 0.9
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, when)
    g.gain.linearRampToValueAtTime(0.14, when + 0.05)
    g.gain.linearRampToValueAtTime(0.08, when + dur * 0.6)
    g.gain.exponentialRampToValueAtTime(0.001, when + dur)
    const o = ctx.createOscillator()
    o.type = 'sawtooth'
    o.frequency.setValueAtTime(140, when)
    o.frequency.exponentialRampToValueAtTime(240, when + dur)
    const lpf = ctx.createBiquadFilter()
    lpf.type = 'lowpass'
    lpf.frequency.value = 1200
    lpf.Q.value = 6
    o.connect(lpf)
    lpf.connect(g)
    g.connect(ctx.destination)
    o.start(when)
    o.stop(when + dur + 0.05)
  }

  private paperRustle(ctx: AudioContext, when: number) {
    const dur = 0.5
    const bufferSize = Math.floor(ctx.sampleRate * dur)
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize)
    }
    const src = ctx.createBufferSource()
    src.buffer = buffer
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 2200
    bp.Q.value = 1
    const g = ctx.createGain()
    g.gain.value = 0.18
    src.connect(bp)
    bp.connect(g)
    g.connect(ctx.destination)
    src.start(when)
    src.stop(when + dur)
  }
}

export const sfx = new Sfx()
