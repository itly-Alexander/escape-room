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
  private duck: GainNode | null = null
  private gloomTimers: number[] = []
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
    // Everything the score plays goes through one more gain, so a chase can push
    // the whole thing away and bring it back (see setDuck).
    if (!this.duck) {
      this.duck = ctx.createGain()
      this.duck.gain.value = 1
      this.duck.connect(ctx.destination)
    }
    master.connect(this.duck)
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
    else this.startGloom(ctx, master)
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
    for (const t of this.gloomTimers) clearTimeout(t)
    this.gloomTimers = []
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

  /** Scale the whole score (1 = normal, 0 = silent), easing over roughly `seconds`. */
  setDuck(level: number, seconds = 0.3) {
    if (!this.duck || !this.ctx) return
    this.duck.gain.setTargetAtTime(Math.max(0, Math.min(1, level)), this.ctx.currentTime, Math.max(0.01, seconds / 3))
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

  /**
   * The maze's score: slow, dark and sparse. Swelling minor pads that drift in
   * and out (A, B♭, C, E: the flat second gives it its unease), a lone low
   * note struck now and then and left to echo, a cold high tone that sours a
   * half-step, and the odd drip of water. Nothing repeats on a pattern.
   */
  private startGloom(ctx: AudioContext, master: GainNode) {
    // A long, dark echo that everything below is sent through.
    const send = ctx.createGain()
    send.gain.value = 0.7
    const delay = ctx.createDelay(2)
    delay.delayTime.value = 0.62
    const fb = ctx.createGain()
    fb.gain.value = 0.55
    const damp = ctx.createBiquadFilter()
    damp.type = 'lowpass'
    damp.frequency.value = 1400
    send.connect(delay)
    delay.connect(damp)
    damp.connect(fb)
    fb.connect(delay)
    damp.connect(master)
    const bus = ctx.createGain()
    bus.gain.value = 1
    bus.connect(master)
    bus.connect(send)

    const later = (fn: () => void, ms: number) => {
      const id = window.setTimeout(() => {
        this.gloomTimers = this.gloomTimers.filter((x) => x !== id)
        fn()
      }, ms)
      this.gloomTimers.push(id)
    }
    const alive = () => this.mode === 'play'

    const PAD = [110, 116.54, 130.81, 164.81, 196, 220]
    const pad = () => {
      if (!alive()) return
      const now = ctx.currentTime
      const root = PAD[Math.floor(Math.random() * PAD.length)]
      const notes = [root, root * (Math.random() < 0.5 ? 1.2 : 1.5), root * 2]
      const swell = 4 + Math.random() * 3
      const hold = 3 + Math.random() * 4
      for (const f of notes) {
        for (const detune of [-6, 7]) {
          const o = ctx.createOscillator()
          o.type = 'triangle'
          o.frequency.value = f
          o.detune.value = detune
          const lp = ctx.createBiquadFilter()
          lp.type = 'lowpass'
          lp.frequency.value = 520
          const g = ctx.createGain()
          g.gain.setValueAtTime(0, now)
          g.gain.linearRampToValueAtTime(0.035, now + swell)
          g.gain.setValueAtTime(0.035, now + swell + hold)
          g.gain.linearRampToValueAtTime(0, now + swell * 2 + hold)
          o.connect(lp)
          lp.connect(g)
          g.connect(bus)
          o.start(now)
          o.stop(now + swell * 2 + hold + 0.1)
        }
      }
      later(pad, (swell + hold) * 1000 * (0.8 + Math.random() * 0.8))
    }

    const NOTES = [55, 58.27, 65.41, 82.41, 98, 110]
    const pluck = () => {
      if (!alive()) return
      const now = ctx.currentTime
      const f = NOTES[Math.floor(Math.random() * NOTES.length)]
      for (const [mult, amp] of [[1, 0.16], [2, 0.05], [3, 0.02]] as const) {
        const o = ctx.createOscillator()
        o.type = 'sine'
        o.frequency.value = f * mult
        const g = ctx.createGain()
        g.gain.setValueAtTime(0, now)
        g.gain.linearRampToValueAtTime(amp, now + 0.02)
        g.gain.exponentialRampToValueAtTime(0.0008, now + 4.5)
        o.connect(g)
        g.connect(bus)
        o.start(now)
        o.stop(now + 4.6)
      }
      later(pluck, 5000 + Math.random() * 11000)
    }

    const cold = () => {
      if (!alive()) return
      const now = ctx.currentTime
      const f = 880 * (Math.random() < 0.5 ? 1 : 1.0595) // the A, or a half-step above it
      const o = ctx.createOscillator()
      o.type = 'sine'
      o.frequency.setValueAtTime(f, now)
      o.frequency.linearRampToValueAtTime(f * (Math.random() < 0.5 ? 0.985 : 1.012), now + 6)
      const g = ctx.createGain()
      g.gain.setValueAtTime(0, now)
      g.gain.linearRampToValueAtTime(0.012, now + 3)
      g.gain.linearRampToValueAtTime(0, now + 6)
      o.connect(g)
      g.connect(bus)
      o.start(now)
      o.stop(now + 6.2)
      later(cold, 14000 + Math.random() * 22000)
    }

    const drip = () => {
      if (!alive()) return
      const now = ctx.currentTime
      const f = 700 + Math.random() * 900
      const o = ctx.createOscillator()
      o.type = 'sine'
      o.frequency.setValueAtTime(f * 1.5, now)
      o.frequency.exponentialRampToValueAtTime(f, now + 0.07)
      const g = ctx.createGain()
      g.gain.setValueAtTime(0, now)
      g.gain.linearRampToValueAtTime(0.05, now + 0.004)
      g.gain.exponentialRampToValueAtTime(0.0005, now + 0.35)
      o.connect(g)
      g.connect(bus)
      o.start(now)
      o.stop(now + 0.4)
      later(drip, 1800 + Math.random() * 9000)
    }

    later(pad, 600)
    later(pluck, 4000)
    later(cold, 9000)
    later(drip, 2500)
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

export type SfxKind = 'pickup' | 'locked' | 'open' | 'door' | 'place' | 'crash' | 'win' | 'read'

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
        case 'door':
          this.doorSqueak(ctx, now)
          break
        case 'crash': {
          // A table going over: a heavy thud, wood clattering, things rolling off.
          this.thud(ctx, now, 70, 0.5, 0.45)
          this.thud(ctx, now + 0.09, 120, 0.3, 0.3)
          this.thud(ctx, now + 0.24, 180, 0.2, 0.2)
          this.thud(ctx, now + 0.36, 140, 0.15, 0.14)
          const n = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.5), ctx.sampleRate)
          const nd = n.getChannelData(0)
          for (let i = 0; i < nd.length; i++) nd[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / nd.length, 2.2) * (Math.random() < 0.15 ? 1 : 0.35)
          const src = ctx.createBufferSource()
          src.buffer = n
          const bp = ctx.createBiquadFilter()
          bp.type = 'bandpass'
          bp.frequency.value = 1800
          bp.Q.value = 0.8
          const g = ctx.createGain()
          g.gain.value = 0.3
          src.connect(bp)
          bp.connect(g)
          g.connect(ctx.destination)
          src.start(now)
          break
        }
        case 'place':
          // A wooden seal seating into its hollow: a dull knock and a small settle.
          this.thud(ctx, now, 210, 0.14, 0.2)
          this.thud(ctx, now + 0.07, 160, 0.1, 0.1)
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

  // Rusty hinge squeak: a pitch that rises in jerky stick-slip steps, with a
  // fast wobble, a detuned second voice for beating, amplitude that stutters
  // as the hinge catches, and a rasp of band-passed noise on top.
  // A dry hinge: a couple of short, thin squeals as the door catches and slips,
  // each gliding in pitch, preceded by the latch's small click. Kept quiet.
  private doorSqueak(ctx: AudioContext, when: number) {
    // Latch click.
    const clickBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.03), ctx.sampleRate)
    const cd = clickBuf.getChannelData(0)
    for (let i = 0; i < cd.length; i++) cd[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / cd.length, 3)
    const click = ctx.createBufferSource()
    click.buffer = clickBuf
    const clickBand = ctx.createBiquadFilter()
    clickBand.type = 'bandpass'
    clickBand.frequency.value = 1400
    clickBand.Q.value = 1.2
    const clickGain = ctx.createGain()
    clickGain.gain.value = 0.07
    click.connect(clickBand)
    clickBand.connect(clickGain)
    clickGain.connect(ctx.destination)
    click.start(when)

    // The squeals.
    let t = when + 0.09
    const bursts = 2 + Math.floor(Math.random() * 2)
    let pitch = 720 + Math.random() * 160
    for (let i = 0; i < bursts; i++) {
      const dur = 0.16 + Math.random() * 0.2
      const to = Math.max(520, Math.min(1500, pitch * (0.85 + Math.random() * 0.5)))
      const o = ctx.createOscillator()
      o.type = 'sawtooth'
      o.frequency.setValueAtTime(pitch, t)
      o.frequency.linearRampToValueAtTime(to, t + dur)
      // A thin, resonant squeal: band-pass near the second harmonic.
      const band = ctx.createBiquadFilter()
      band.type = 'bandpass'
      band.frequency.setValueAtTime(pitch * 2, t)
      band.frequency.linearRampToValueAtTime(to * 2, t + dur)
      band.Q.value = 9
      const vib = ctx.createOscillator()
      vib.frequency.value = 38
      const vibDepth = ctx.createGain()
      vibDepth.gain.value = 14
      vib.connect(vibDepth)
      vibDepth.connect(o.frequency)
      const g = ctx.createGain()
      const peak = 0.045 + Math.random() * 0.02
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(peak, t + 0.025)
      g.gain.setValueAtTime(peak, t + dur - 0.05)
      g.gain.linearRampToValueAtTime(0, t + dur)
      o.connect(band)
      band.connect(g)
      g.connect(ctx.destination)
      o.start(t)
      vib.start(t)
      o.stop(t + dur + 0.02)
      vib.stop(t + dur + 0.02)
      pitch = to
      t += dur + 0.04 + Math.random() * 0.08
    }
  }

  private creak(ctx: AudioContext, when: number) {
    const dur = 1.3
    const out = ctx.createGain()
    out.gain.value = 1
    out.connect(ctx.destination)

    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.setValueAtTime(900, when)
    bp.frequency.linearRampToValueAtTime(1700, when + dur)
    bp.Q.value = 4
    bp.connect(out)

    // Amplitude: swells in, then stutters between loud/quiet on each "slip".
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, when)
    g.gain.linearRampToValueAtTime(0.13, when + 0.06)
    for (let t = 0.1; t < dur - 0.2; t += 0.04 + Math.random() * 0.06) {
      g.gain.linearRampToValueAtTime(0.04 + Math.random() * 0.12, when + t)
    }
    g.gain.exponentialRampToValueAtTime(0.001, when + dur)
    g.connect(bp)

    // Stick-slip pitch: stepwise rise with random jumps, glides between them.
    const base = 520
    const pitch = (o: OscillatorNode, detune: number) => {
      o.type = 'sawtooth'
      o.frequency.setValueAtTime(base * detune, when)
      let f = base
      for (let t = 0.05; t < dur; t += 0.05 + Math.random() * 0.07) {
        f = Math.max(380, Math.min(1500, f * (0.93 + Math.random() * 0.2) + 14))
        o.frequency.linearRampToValueAtTime(f * detune, when + t)
      }
      o.connect(g)
    }
    const o1 = ctx.createOscillator()
    const o2 = ctx.createOscillator()
    pitch(o1, 1)
    pitch(o2, 1.012)

    // Fast wobble on both voices for the metallic shudder.
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 38
    const lfoGain = ctx.createGain()
    lfoGain.gain.value = 22
    lfo.connect(lfoGain)
    lfoGain.connect(o1.frequency)
    lfoGain.connect(o2.frequency)

    // Rasp.
    const n = Math.floor(ctx.sampleRate * dur)
    const buf = ctx.createBuffer(1, n, ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1
    const noise = ctx.createBufferSource()
    noise.buffer = buf
    const nbp = ctx.createBiquadFilter()
    nbp.type = 'bandpass'
    nbp.frequency.value = 3200
    nbp.Q.value = 2
    const ng = ctx.createGain()
    ng.gain.setValueAtTime(0.0, when)
    ng.gain.linearRampToValueAtTime(0.035, when + 0.1)
    ng.gain.exponentialRampToValueAtTime(0.001, when + dur)
    noise.connect(nbp)
    nbp.connect(ng)
    ng.connect(out)

    ;[o1, o2, lfo].forEach((o) => {
      o.start(when)
      o.stop(when + dur + 0.05)
    })
    noise.start(when)
    noise.stop(when + dur + 0.05)
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
