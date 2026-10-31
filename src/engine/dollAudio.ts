// The doll's sounds. All synthesised, no files.
//
//  • Music box: a slow minor lullaby that plays from her while she's still.
//    The moment she moves it stops dead, so silence means she's coming.
//  • Joints: dry porcelain clicks and ticks from wherever she is, while she moves.
//  • Heartbeat: the player's, faster and louder the closer she is.
//  • Sting: a hard hit when you look back and find her somewhere new.
//  • Power: a clunk when the lights die, and an electric buzz as they stutter.

type AudioCtor = typeof AudioContext

/** Beyond this the music box can't be heard. */
const HEARING_RANGE = 16

// A lullaby in A minor: [MIDI note, beats]. 0 is a rest.
const LULLABY: Array<[number, number]> = [
  [76, 1], [72, 0.5], [74, 0.5], [76, 1], [69, 1],
  [71, 1], [72, 0.5], [71, 0.5], [69, 2],
  [76, 1], [79, 0.5], [77, 0.5], [76, 1], [72, 1],
  [74, 1], [71, 1], [69, 2],
  [72, 1], [71, 0.5], [69, 0.5], [68, 1], [69, 1],
  [64, 1.5], [0, 0.5], [64, 2],
]
const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12)

export class DollAudio {
  private ctx: AudioContext | null = null
  private out: GainNode | null = null // master, silenced while paused
  private box: GainNode | null = null // music box level, follows distance
  private boxTone: BiquadFilterNode | null = null
  private boxPan: PannerNode | null = null
  private fxPan: PannerNode | null = null // her clicks
  private heartBus: GainNode | null = null
  private sched: number | null = null
  private noise: AudioBuffer | null = null
  private nextNote = 0
  private note = 0
  private playing = true // the music box: false while she moves
  private nextBeat = 0
  private proximity = 0 // 0 far .. 1 on top of you
  private awake = false

  start() {
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: AudioCtor }).webkitAudioContext
      const ctx = new Ctx()
      this.ctx = ctx
      const comp = ctx.createDynamicsCompressor()
      comp.threshold.value = -16
      comp.ratio.value = 5
      comp.connect(ctx.destination)
      const out = ctx.createGain()
      out.gain.value = 1
      out.connect(comp)
      this.out = out

      const nb = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
      const d = nb.getChannelData(0)
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
      this.noise = nb

      const place = () => {
        const p = ctx.createPanner()
        p.panningModel = 'HRTF'
        p.distanceModel = 'linear'
        p.rolloffFactor = 0 // loudness is handled by hand
        p.connect(out)
        return p
      }
      // Music box: slightly muffled with distance and walls.
      this.boxPan = place()
      const tone = ctx.createBiquadFilter()
      tone.type = 'lowpass'
      tone.frequency.value = 5000
      tone.connect(this.boxPan)
      this.boxTone = tone
      const box = ctx.createGain()
      box.gain.value = 0
      box.connect(tone)
      this.box = box
      // Clicks: loud up close, and the panner says where from.
      this.fxPan = place()

      const heart = ctx.createGain()
      heart.gain.value = 0
      heart.connect(out)
      this.heartBus = heart

      this.nextNote = ctx.currentTime + 0.3
      this.nextBeat = ctx.currentTime + 0.3
      this.sched = window.setInterval(() => this.schedule(), 50)
    } catch {
      this.ctx = null
    }
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume().catch(() => {})
  }

  setPaused(paused: boolean) {
    if (!this.ctx || !this.out) return
    this.out.gain.setTargetAtTime(paused ? 0 : 1, this.ctx.currentTime, 0.03)
  }

  /**
   * Called each frame.
   * @param moving  she's moving (the music box stops)
   * @param dist    metres between her and the player
   */
  update(
    listener: { x: number; y: number; z: number; fx: number; fy: number; fz: number },
    source: { x: number; y: number; z: number },
    state: { awake: boolean; moving: boolean; dist: number },
  ) {
    const { ctx, box, boxTone, boxPan, fxPan, heartBus } = this
    if (!ctx || !box || !boxTone || !boxPan || !fxPan || !heartBus) return
    const t = ctx.currentTime
    const l = ctx.listener
    if (l.positionX) {
      l.positionX.setValueAtTime(listener.x, t)
      l.positionY.setValueAtTime(listener.y, t)
      l.positionZ.setValueAtTime(listener.z, t)
      l.forwardX.setValueAtTime(listener.fx, t)
      l.forwardY.setValueAtTime(listener.fy, t)
      l.forwardZ.setValueAtTime(listener.fz, t)
      l.upX.setValueAtTime(0, t)
      l.upY.setValueAtTime(1, t)
      l.upZ.setValueAtTime(0, t)
    } else {
      l.setPosition(listener.x, listener.y, listener.z)
      l.setOrientation(listener.fx, listener.fy, listener.fz, 0, 1, 0)
    }
    for (const p of [boxPan, fxPan]) {
      p.positionX.setValueAtTime(source.x, t)
      p.positionY.setValueAtTime(source.y, t)
      p.positionZ.setValueAtTime(source.z, t)
    }
    const near = 1 - Math.min(1, Math.max(0, (state.dist - 1.5) / (HEARING_RANGE - 1.5)))
    // The box cuts out the instant she moves, and only creeps back once she's still.
    const wasPlaying = this.playing
    this.playing = !state.moving
    if (wasPlaying && !this.playing) box.gain.cancelScheduledValues(t)
    box.gain.setTargetAtTime(this.playing ? 0.32 * near * near : 0, t, this.playing ? 0.6 : 0.015)
    boxTone.frequency.setTargetAtTime(900 + 5000 * near, t, 0.2)

    this.awake = state.awake
    this.proximity = state.awake ? 1 - Math.min(1, Math.max(0, (state.dist - 1) / 8)) : 0
    heartBus.gain.setTargetAtTime(0.9 * this.proximity, t, 0.3)
  }

  private schedule() {
    const ctx = this.ctx
    if (!ctx) return
    const ahead = ctx.currentTime + 0.2
    // Music box: only advances while it's playing, so it picks up where it stopped.
    if (!this.playing) this.nextNote = Math.max(this.nextNote, ctx.currentTime + 0.4)
    while (this.playing && this.nextNote < ahead) {
      const [n, beats] = LULLABY[this.note % LULLABY.length]
      // Slow, and a little uneven, like a spring running down.
      const beat = 0.52 * (1 + (Math.random() - 0.5) * 0.08)
      if (n) this.pluck(this.nextNote, midi(n))
      this.nextNote += beats * beat
      this.note++
      if (this.note % LULLABY.length === 0) this.nextNote += 1.6 // a breath before it starts over
    }
    // Heartbeat: 60 bpm far away, 150 on top of her.
    if (!this.awake || this.proximity < 0.02) {
      this.nextBeat = Math.max(this.nextBeat, ctx.currentTime + 0.05)
    } else {
      while (this.nextBeat < ahead) {
        this.thump(this.nextBeat, 1, 60)
        this.thump(this.nextBeat + 0.16, 0.7, 52)
        this.nextBeat += 60 / (60 + 90 * this.proximity)
      }
    }
  }

  /** One music box tine: a bright sine with a quick metallic overtone, ringing out. */
  private pluck(at: number, f: number) {
    const ctx = this.ctx!
    const box = this.box!
    const detune = (Math.random() - 0.5) * 18 // an old comb, not quite in tune
    for (const [mult, level, decay] of [[1, 0.5, 1.6], [3.01, 0.12, 0.35], [5.4, 0.05, 0.12]] as const) {
      const o = ctx.createOscillator()
      o.frequency.value = f * mult
      o.detune.value = detune
      const g = ctx.createGain()
      g.gain.setValueAtTime(0, at)
      g.gain.linearRampToValueAtTime(level, at + 0.004)
      g.gain.exponentialRampToValueAtTime(0.0005, at + decay)
      o.connect(g)
      g.connect(box)
      o.start(at)
      o.stop(at + decay + 0.05)
    }
  }

  private thump(at: number, level: number, freq: number) {
    const ctx = this.ctx!
    const o = ctx.createOscillator()
    o.frequency.setValueAtTime(freq * 1.8, at)
    o.frequency.exponentialRampToValueAtTime(freq * 0.6, at + 0.12)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, at)
    g.gain.linearRampToValueAtTime(level, at + 0.01)
    g.gain.exponentialRampToValueAtTime(0.001, at + 0.25)
    o.connect(g)
    g.connect(this.heartBus!)
    o.start(at)
    o.stop(at + 0.3)
  }

  private burst(at: number, len: number, type: BiquadFilterType, freq: number, q: number, level: number, dest: AudioNode) {
    const ctx = this.ctx!
    const n = ctx.createBufferSource()
    n.buffer = this.noise
    const f = ctx.createBiquadFilter()
    f.type = type
    f.frequency.value = freq
    f.Q.value = q
    const g = ctx.createGain()
    g.gain.setValueAtTime(level, at)
    g.gain.exponentialRampToValueAtTime(0.001, at + len)
    n.connect(f)
    f.connect(g)
    g.connect(dest)
    n.start(at, Math.random() * 0.5)
    n.stop(at + len + 0.02)
  }

  /** A porcelain joint knocking: a dry click and, sometimes, a glassy tick. */
  click(volume: number) {
    const ctx = this.ctx
    if (!ctx || !this.fxPan) return
    const t = ctx.currentTime
    const v = Math.min(1, volume)
    this.burst(t, 0.03, 'bandpass', 2400 + Math.random() * 1800, 4, 0.9 * v, this.fxPan)
    if (Math.random() < 0.55) {
      const o = ctx.createOscillator()
      o.frequency.value = 2600 + Math.random() * 2400
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.12 * v, t + 0.01)
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.09)
      o.connect(g)
      g.connect(this.fxPan)
      o.start(t + 0.01)
      o.stop(t + 0.12)
    }
    // A creak of old ball joints turning.
    if (Math.random() < 0.3) this.burst(t + 0.02, 0.18, 'bandpass', 700 + Math.random() * 500, 9, 0.35 * v, this.fxPan)
  }

  /** You look back and she's somewhere else: a violent hit. */
  sting(strength = 1) {
    const ctx = this.ctx
    if (!ctx || !this.out) return
    const t = ctx.currentTime
    const boom = ctx.createOscillator()
    boom.frequency.setValueAtTime(110, t)
    boom.frequency.exponentialRampToValueAtTime(30, t + 0.6)
    const bg = ctx.createGain()
    bg.gain.setValueAtTime(1.1 * strength, t)
    bg.gain.exponentialRampToValueAtTime(0.001, t + 0.9)
    boom.connect(bg)
    bg.connect(this.out)
    boom.start(t)
    boom.stop(t + 1)
    // A cluster of shrieking strings a half-step apart.
    for (const f of [1244.5, 1318.5, 1396.9, 1975.5]) {
      const s = ctx.createOscillator()
      s.type = 'sawtooth'
      s.frequency.setValueAtTime(f * 0.94, t)
      s.frequency.exponentialRampToValueAtTime(f, t + 0.08)
      const sg = ctx.createGain()
      sg.gain.setValueAtTime(0, t)
      sg.gain.linearRampToValueAtTime(0.07 * strength, t + 0.02)
      sg.gain.exponentialRampToValueAtTime(0.001, t + 1.3)
      s.connect(sg)
      sg.connect(this.out)
      s.start(t)
      s.stop(t + 1.4)
    }
    this.burst(t, 0.35, 'highpass', 3000, 0.7, 0.4 * strength, this.out)
  }

  /** The lights die: a heavy clunk somewhere in the walls. */
  clunk() {
    const ctx = this.ctx
    if (!ctx || !this.out) return
    const t = ctx.currentTime
    const o = ctx.createOscillator()
    o.frequency.setValueAtTime(70, t)
    o.frequency.exponentialRampToValueAtTime(35, t + 0.25)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.7, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.4)
    o.connect(g)
    g.connect(this.out)
    o.start(t)
    o.stop(t + 0.45)
    this.burst(t, 0.12, 'lowpass', 600, 0.7, 0.5, this.out)
  }

  /** Mains buzz while the lights stutter. */
  buzz(len: number) {
    const ctx = this.ctx
    if (!ctx || !this.out) return
    const t = ctx.currentTime
    const o = ctx.createOscillator()
    o.type = 'sawtooth'
    o.frequency.value = 100
    const f = ctx.createBiquadFilter()
    f.type = 'bandpass'
    f.frequency.value = 400
    f.Q.value = 2
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(0.06, t + 0.03)
    g.gain.setValueAtTime(0.06, t + len * 0.8)
    g.gain.linearRampToValueAtTime(0, t + len)
    o.connect(f)
    f.connect(g)
    g.connect(this.out)
    o.start(t)
    o.stop(t + len + 0.05)
  }

  dispose() {
    if (this.sched !== null) window.clearInterval(this.sched)
    this.sched = null
    void this.ctx?.close().catch(() => {})
    this.ctx = null
  }
}
