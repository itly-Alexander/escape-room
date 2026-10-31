// The chase score and the player's heartbeat. All synthesised, no files.
//
// Everything is driven by one number, `intensity` (0..1): at 0 it's silent and
// idle (nothing is scheduled), at 1 it's a full chase. It has its own audio
// context so it can be faded without touching the ambient score.
//
//  • Heartbeat: a prominent, fast lub-dub, thumped out from a low sine with a
//    pitch drop and a soft knock. It speeds up the longer the chase lasts.
//  • Pulse: a dark sub bass pumping on the beat.
//  • Strings: a cluster of shrieking high sawtooths a half-step apart,
//    tremolo-ing, sliding up and down, never settling.
//  • Ostinato: a nervous high pluck pattern, chromatic and relentless.
//  • Stinger: a violent hit when the chase begins.

type AudioCtor = typeof AudioContext

const rand = (a: number, b: number) => a + Math.random() * (b - a)

export class PursuitAudio {
  private ctx: AudioContext | null = null
  private out: GainNode | null = null // overall level, follows intensity
  private strings: GainNode | null = null
  private pulse: GainNode | null = null
  private bus: GainNode | null = null
  private sources: AudioScheduledSourceNode[] = []
  private sched: number | null = null
  private intensity = 0
  private muted = false
  private chaseT = 0 // how long the chase has run, drives the tempo
  private nextBeat = 0
  private nextStep = 0
  private step = 0
  private stringNotes: OscillatorNode[] = []
  private nextSlide = 0

  start() {
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: AudioCtor }).webkitAudioContext
      const ctx = new Ctx()
      this.ctx = ctx

      const comp = ctx.createDynamicsCompressor()
      comp.threshold.value = -14
      comp.ratio.value = 6
      comp.connect(ctx.destination)
      const out = ctx.createGain()
      out.gain.value = 0
      out.connect(comp)
      this.out = out
      const bus = ctx.createGain()
      bus.gain.value = 1
      bus.connect(out)
      this.bus = bus

      // --- strings: four shrieking voices a half-step apart ---------------------
      const strings = ctx.createGain()
      strings.gain.value = 0
      const hp = ctx.createBiquadFilter()
      hp.type = 'highpass'
      hp.frequency.value = 700
      const peak = ctx.createBiquadFilter()
      peak.type = 'peaking'
      peak.frequency.value = 2600
      peak.Q.value = 1.2
      peak.gain.value = 9
      strings.connect(hp)
      hp.connect(peak)
      peak.connect(bus)
      this.strings = strings

      const trem = ctx.createOscillator()
      trem.frequency.value = 11
      const tremDepth = ctx.createGain()
      tremDepth.gain.value = 0.35
      const tremBase = ctx.createGain()
      tremBase.gain.value = 0.65
      trem.connect(tremDepth)
      tremDepth.connect(tremBase.gain)
      tremBase.connect(strings)
      this.sources.push(trem)

      const STRING_BASE = [1318.5, 1396.9, 1864.7, 2093] // E6 F6 A#6 C7: tense, grating
      for (const f of STRING_BASE) {
        for (const d of [-9, 8]) {
          const o = ctx.createOscillator()
          o.type = 'sawtooth'
          o.frequency.value = f
          o.detune.value = d
          const vib = ctx.createOscillator()
          vib.frequency.value = rand(5.5, 7.5)
          const vibGain = ctx.createGain()
          vibGain.gain.value = f * 0.006
          vib.connect(vibGain)
          vibGain.connect(o.frequency)
          const g = ctx.createGain()
          g.gain.value = 0.045
          o.connect(g)
          g.connect(tremBase)
          this.sources.push(o, vib)
          this.stringNotes.push(o)
        }
      }

      // --- pulse: a dark, pumping sub ------------------------------------------------------
      const pulse = ctx.createGain()
      pulse.gain.value = 0
      const sub = ctx.createOscillator()
      sub.type = 'sawtooth'
      sub.frequency.value = 36
      const subLp = ctx.createBiquadFilter()
      subLp.type = 'lowpass'
      subLp.frequency.value = 160
      sub.connect(subLp)
      subLp.connect(pulse)
      pulse.connect(bus)
      this.pulse = pulse
      this.sources.push(sub)

      for (const s of this.sources) s.start()

      this.nextBeat = ctx.currentTime + 0.1
      this.nextStep = ctx.currentTime + 0.1
      // Look-ahead scheduler: schedules the next few hundred ms of notes.
      this.sched = window.setInterval(() => this.schedule(), 40)
    } catch {
      this.ctx = null
    }
  }

  /** Browsers hold audio until the page has seen a gesture. */
  resume() {
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume().catch(() => {})
  }

  /** Silence everything while the game is paused (frames stop, so it can't be left running). */
  setMuted(m: boolean) {
    this.muted = m
    this.apply()
  }

  /** 0..1, the strength of the chase. Called every frame. */
  setIntensity(i: number, chaseSeconds: number) {
    const was = this.intensity
    this.intensity = i
    this.chaseT = chaseSeconds
    if (was < 0.02 && i >= 0.02) this.stinger()
    this.apply()
  }

  private apply() {
    const { ctx, out, strings, pulse } = this
    if (!ctx || !out || !strings || !pulse) return
    const t = ctx.currentTime
    const i = this.muted ? 0 : this.intensity
    out.gain.setTargetAtTime(0.9 * i, t, 0.12)
    strings.gain.setTargetAtTime(0.55 + 0.45 * i, t, 0.3)
    pulse.gain.setTargetAtTime(0.0, t, 0.05) // the sub is gated per beat in schedule()
  }

  private bpm() {
    // Hard and fast from the start, getting worse the longer it goes on.
    return 148 + Math.min(1, this.chaseT / 25) * 28
  }

  private schedule() {
    const ctx = this.ctx
    if (!ctx || this.intensity < 0.02 || this.muted) {
      if (ctx) {
        // Don't let a backlog build while idle: resume from "now".
        this.nextBeat = Math.max(this.nextBeat, ctx.currentTime + 0.05)
        this.nextStep = Math.max(this.nextStep, ctx.currentTime + 0.05)
      }
      return
    }
    const ahead = ctx.currentTime + 0.25
    const beat = 60 / this.bpm()
    while (this.nextBeat < ahead) {
      this.heartbeat(this.nextBeat)
      this.subHit(this.nextBeat, beat)
      this.nextBeat += beat
    }
    const stepLen = beat / 4 // sixteenth notes
    while (this.nextStep < ahead) {
      this.ostinato(this.nextStep, stepLen)
      this.step++
      this.nextStep += stepLen
    }
    if (ctx.currentTime > this.nextSlide) {
      this.slideStrings()
      this.nextSlide = ctx.currentTime + rand(0.25, 0.9)
    }
  }

  /** lub-dub: two thumps close together, then the rest of the beat. */
  private heartbeat(at: number) {
    this.thump(at, 1, 62)
    this.thump(at + 0.17 + Math.random() * 0.02, 0.72, 54)
  }

  private thump(at: number, level: number, freq: number) {
    const ctx = this.ctx!
    const bus = this.bus!
    const o = ctx.createOscillator()
    o.type = 'sine'
    o.frequency.setValueAtTime(freq * 1.9, at)
    o.frequency.exponentialRampToValueAtTime(freq * 0.62, at + 0.12)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, at)
    g.gain.linearRampToValueAtTime(1.15 * level, at + 0.008)
    g.gain.exponentialRampToValueAtTime(0.001, at + 0.26)
    o.connect(g)
    g.connect(bus)
    o.start(at)
    o.stop(at + 0.3)
    // The chest "knock": a short burst of low-passed noise.
    const nb = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.06), ctx.sampleRate)
    const d = nb.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2)
    const n = ctx.createBufferSource()
    n.buffer = nb
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 380
    const ng = ctx.createGain()
    ng.gain.value = 0.5 * level
    n.connect(lp)
    lp.connect(ng)
    ng.connect(bus)
    n.start(at)
  }

  /** The sub bass punches on every beat. */
  private subHit(at: number, beat: number) {
    const pulse = this.pulse
    if (!pulse) return
    pulse.gain.cancelScheduledValues(at)
    pulse.gain.setValueAtTime(0.0, at)
    pulse.gain.linearRampToValueAtTime(0.5, at + 0.01)
    pulse.gain.exponentialRampToValueAtTime(0.02, at + beat * 0.8)
  }

  private readonly OSTINATO = [880, 932.3, 880, 830.6, 880, 987.8, 932.3, 880, 1046.5, 987.8, 932.3, 1108.7, 1046.5, 932.3, 880, 830.6]

  /** Nervous high plucks, quieter on the off-steps, with a rise through each bar. */
  private ostinato(at: number, len: number) {
    const ctx = this.ctx!
    const i = this.step % this.OSTINATO.length
    const accent = i % 4 === 0
    if (!accent && Math.random() < 0.22) return // the odd gap keeps it from sounding like a machine
    const f = this.OSTINATO[i] * (this.step % 64 >= 48 ? 2 : 1) // every fourth bar jumps an octave
    const o = ctx.createOscillator()
    o.type = 'square'
    o.frequency.value = f
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = f * 2
    bp.Q.value = 3
    const g = ctx.createGain()
    const peak = accent ? 0.11 : 0.06
    g.gain.setValueAtTime(0, at)
    g.gain.linearRampToValueAtTime(peak, at + 0.004)
    g.gain.exponentialRampToValueAtTime(0.001, at + len * 1.5)
    o.connect(bp)
    bp.connect(g)
    g.connect(this.bus!)
    o.start(at)
    o.stop(at + len * 1.6)
  }

  /** The shrieks slide a little way up or down, so the cluster is never at rest. */
  private slideStrings() {
    const ctx = this.ctx!
    const t = ctx.currentTime
    for (const o of this.stringNotes) {
      if (Math.random() < 0.5) continue
      const cents = rand(-180, 220)
      o.detune.cancelScheduledValues(t)
      o.detune.setTargetAtTime(cents, t, rand(0.08, 0.3))
    }
  }

  /** A hard hit as the chase begins: a boom, a screech and a burst of noise. */
  private stinger() {
    const ctx = this.ctx
    const bus = this.bus
    if (!ctx || !bus || this.muted) return
    const t = ctx.currentTime
    const boom = ctx.createOscillator()
    boom.type = 'sine'
    boom.frequency.setValueAtTime(90, t)
    boom.frequency.exponentialRampToValueAtTime(28, t + 0.7)
    const bg = ctx.createGain()
    bg.gain.setValueAtTime(1.4, t)
    bg.gain.exponentialRampToValueAtTime(0.001, t + 1.1)
    boom.connect(bg)
    bg.connect(bus)
    boom.start(t)
    boom.stop(t + 1.2)
    for (const f of [1568, 1661.2, 2217.5]) {
      const s = ctx.createOscillator()
      s.type = 'sawtooth'
      s.frequency.setValueAtTime(f * 0.7, t)
      s.frequency.exponentialRampToValueAtTime(f, t + 0.25)
      const sg = ctx.createGain()
      sg.gain.setValueAtTime(0, t)
      sg.gain.linearRampToValueAtTime(0.12, t + 0.04)
      sg.gain.exponentialRampToValueAtTime(0.001, t + 1.4)
      s.connect(sg)
      sg.connect(bus)
      s.start(t)
      s.stop(t + 1.5)
    }
    const nb = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.5), ctx.sampleRate)
    const d = nb.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 1.5)
    const n = ctx.createBufferSource()
    n.buffer = nb
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 2500
    const ng = ctx.createGain()
    ng.gain.value = 0.5
    n.connect(hp)
    hp.connect(ng)
    ng.connect(bus)
    n.start(t)
  }

  dispose() {
    if (this.sched !== null) window.clearInterval(this.sched)
    this.sched = null
    for (const s of this.sources) {
      try {
        s.stop()
      } catch {
        /* already stopped */
      }
    }
    this.sources = []
    this.stringNotes = []
    void this.ctx?.close().catch(() => {})
    this.ctx = null
  }
}
