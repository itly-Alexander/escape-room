// A procedural, positional growl for the monster. No audio files: it's a rough
// imitation of a throat. A pulsy voice source (two detuned sawtooth "vocal
// cords" with jittery pitch and a fast fry-like flutter) plus breath noise is
// pushed through three moving formant filters, so it shifts between vowels the
// way a mouth does, then through soft distortion. It's deliberately unpredictable:
// it picks at random between a long growl, a harsh snarl, a sudden bark, a low
// rumble, a breathy hiss or a rapid burst of barks, with gaps that run from a
// breath to several seconds, so you can never settle into its rhythm.
//
// It plays continuously from the monster's position. Loudness falls off with
// distance and reaches silence at HEARING_RANGE, so it's only audible when the
// player is near; the sound also gets duller the further away it is.

/** Beyond this distance (metres) the growl is completely inaudible. */
export const HEARING_RANGE = 20
/** Within this distance it's at full volume. */
const FULL_VOLUME_RANGE = 3
const MAX_GAIN = 0.2

type AudioCtor = typeof AudioContext

// Rough vowel formants (F1, F2) a mouth passes through while growling.
const VOWELS: Array<[number, number]> = [
  [310, 870], // "oo"
  [520, 1000], // "uh"
  [700, 1220], // "aa"
  [450, 1900], // "eh"-ish, for a snarl
]

export class GrowlVoice {
  private ctx: AudioContext | null = null
  private level: GainNode | null = null // distance-controlled volume
  private tone: BiquadFilterNode | null = null // gets duller with distance
  private panner: PannerNode | null = null
  private sources: AudioScheduledSourceNode[] = []
  private timers: number[] = []
  private agitation = 0 // 0 = idle, 1 = hunting the player: screams and screeches
  private alert: (() => void) | null = null

  start() {
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: AudioCtor }).webkitAudioContext
      const ctx = new Ctx()
      this.ctx = ctx

      // --- Voice source: two detuned "vocal cords" and breath ------------------
      const source = ctx.createGain()
      const cordA = ctx.createOscillator()
      const cordB = ctx.createOscillator()
      cordA.type = 'sawtooth'
      cordB.type = 'sawtooth'
      const cordGainB = ctx.createGain()
      cordGainB.gain.value = 0.7
      cordA.connect(source)
      cordB.connect(cordGainB)
      cordGainB.connect(source)
      this.sources.push(cordA, cordB)

      const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
      const nd = noiseBuf.getChannelData(0)
      for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1
      const noise = ctx.createBufferSource()
      noise.buffer = noiseBuf
      noise.loop = true
      const breath = ctx.createGain()
      breath.gain.value = 0.25
      noise.connect(breath)
      breath.connect(source)
      this.sources.push(noise)

      // --- Fry / rattle: a fast, uneven amplitude flutter --------------------
      const flutter = ctx.createGain()
      flutter.gain.value = 0.45
      const flutterLfo = ctx.createOscillator()
      flutterLfo.type = 'sawtooth'
      flutterLfo.frequency.value = 24
      const flutterDepth = ctx.createGain()
      flutterDepth.gain.value = 0.55
      flutterLfo.connect(flutterDepth)
      flutterDepth.connect(flutter.gain)
      source.connect(flutter)
      this.sources.push(flutterLfo)

      // --- Mouth: chest + three moving formants ------------------------------
      const mouth = ctx.createGain()
      const chest = ctx.createBiquadFilter()
      chest.type = 'lowpass'
      chest.frequency.value = 220
      const chestGain = ctx.createGain()
      chestGain.gain.value = 0.9
      flutter.connect(chest)
      chest.connect(chestGain)
      chestGain.connect(mouth)

      const formant = (freq: number, q: number, gain: number) => {
        const f = ctx.createBiquadFilter()
        f.type = 'bandpass'
        f.frequency.value = freq
        f.Q.value = q
        const g = ctx.createGain()
        g.gain.value = gain
        flutter.connect(f)
        f.connect(g)
        g.connect(mouth)
        return f
      }
      const f1 = formant(520, 5, 2.4)
      const f2 = formant(1000, 7, 1.7)
      const f3 = formant(2400, 9, 0.7)

      // Soft distortion, then the loudness envelope for the growl phrases.
      const shaper = ctx.createWaveShaper()
      const curve = new Float32Array(1024)
      for (let i = 0; i < curve.length; i++) {
        const x = (i / (curve.length - 1)) * 2 - 1
        curve[i] = Math.tanh(x * 2.6)
      }
      shaper.curve = curve
      const env = ctx.createGain()
      env.gain.value = 0.18
      mouth.connect(shaper)
      shaper.connect(env)

      // --- Distance: tone, volume, direction ---------------------------------
      const tone = ctx.createBiquadFilter()
      tone.type = 'lowpass'
      tone.frequency.value = 2400
      tone.Q.value = 0.5
      this.tone = tone
      const level = ctx.createGain()
      level.gain.value = 0
      this.level = level
      const panner = ctx.createPanner()
      panner.panningModel = 'HRTF'
      // All distance attenuation is done by `level`; the panner only places it.
      panner.distanceModel = 'linear'
      panner.rolloffFactor = 0
      this.panner = panner

      env.connect(tone)
      tone.connect(level)
      level.connect(panner)
      panner.connect(ctx.destination)

      for (const s of this.sources) s.start()

      // --- Performance ------------------------------------------------------
      let f0 = 70
      let flutterRate = 22
      let jitter = 0.06 // how unsteady the pitch is right now
const later = (fn: () => void, ms: number) => {
        const id = window.setTimeout(() => {
          this.timers = this.timers.filter((x) => x !== id)
          fn()
        }, ms)
        this.timers.push(id)
        return id
      }
      const setPitch = (hz: number, glide: number) => {
        const t = ctx.currentTime
        cordA.frequency.setTargetAtTime(hz, t, glide)
        cordB.frequency.setTargetAtTime(hz * 1.013, t, glide)
      }
      const setMouth = ([a, b]: [number, number], speed: number) => {
        const t = ctx.currentTime
        f1.frequency.setTargetAtTime(a, t, speed)
        f2.frequency.setTargetAtTime(b, t, speed)
        f3.frequency.setTargetAtTime(2200 + b * 0.25, t, speed)
      }
      setPitch(f0, 0.01)
      setMouth(VOWELS[1], 0.01)

      // Constant micro-instability: pitch jitter and an uneven rattle rate.
      this.timers.push(
        window.setInterval(() => {
          const t = ctx.currentTime
          const j = f0 * (1 + (Math.random() - 0.5) * jitter)
          cordA.frequency.setTargetAtTime(j, t, 0.02)
          cordB.frequency.setTargetAtTime(j * 1.013, t, 0.02)
          flutterLfo.frequency.setTargetAtTime(flutterRate * (0.8 + Math.random() * 0.5), t, 0.03)
        }, 55),
      )

      type Kind = 'growl' | 'snarl' | 'bark' | 'rumble' | 'hiss' | 'burst' | 'scream' | 'screech' | 'wail' | 'breath'
      // Idle, she mostly just breathes: slow, deep, laboured, with the odd low rumble.
      const KINDS: Array<[Kind, number]> = [
        ['breath', 9],
        ['rumble', 1.5],
        ['growl', 0.5],
      ]
      // While she's hunting you: screams, screeches and wails, with a snarl or bark thrown in.
      const CHASE_KINDS: Array<[Kind, number]> = [
        ['scream', 3],
        ['screech', 3],
        ['wail', 1.6],
        ['burst', 1.6],
        ['snarl', 1],
      ]
      const pickKind = (): Kind => {
        const table = this.agitation > 0.5 ? CHASE_KINDS : KINDS
        let r = Math.random() * table.reduce((n, [, w]) => n + w, 0)
        for (const [k, w] of table) if ((r -= w) <= 0) return k
        return 'growl'
      }
      const rand = (a: number, b: number) => a + Math.random() * (b - a)

      // One sound. Returns how long it lasts, in seconds.
      const voice = (kind: Exclude<Kind, 'burst'>): number => {
        const t = ctx.currentTime
        const p = {
          // A deep, wet, rasping breath: mostly airy noise over a barely-there sub-bass hum, swelling and fading.
          breath: { len: rand(1.5, 2.8), peak: rand(0.45, 0.7), base: rand(18, 28), rise: rand(1.05, 1.2), attack: 0.45, release: 0.5, rate: rand(7, 12), jit: 0.04, breath: rand(1.4, 2), vowel: [210, 480] as [number, number] },
          growl: { len: rand(1.2, 3.4), peak: rand(0.55, 0.95), base: rand(40, 60), rise: rand(1.08, 1.32), attack: 0.16, release: 0.3, rate: rand(17, 26), jit: 0.07, breath: 0.3, vowel: VOWELS[2] },
          snarl: { len: rand(0.45, 1.2), peak: rand(0.85, 1), base: rand(90, 135), rise: rand(1.25, 1.7), attack: 0.05, release: 0.15, rate: rand(28, 38), jit: 0.1, breath: 0.55, vowel: VOWELS[3] },
          bark: { len: rand(0.1, 0.3), peak: 1, base: rand(110, 190), rise: rand(0.6, 0.85), attack: 0.008, release: 0.05, rate: rand(30, 44), jit: 0.14, breath: 0.45, vowel: VOWELS[2] },
          rumble: { len: rand(2.5, 5.5), peak: rand(0.4, 0.6), base: rand(36, 50), rise: rand(1.03, 1.15), attack: 0.5, release: 0.8, rate: rand(12, 18), jit: 0.05, breath: 0.2, vowel: VOWELS[0] },
          hiss: { len: rand(0.7, 2), peak: rand(0.25, 0.4), base: rand(60, 90), rise: 1, attack: 0.1, release: 0.4, rate: rand(20, 30), jit: 0.1, breath: 1, vowel: VOWELS[3] },
          // A full-throated scream: high, open and tearing, climbing as it goes.
          scream: { len: rand(0.9, 2.4), peak: 1, base: rand(480, 760), rise: rand(1.25, 1.65), attack: 0.03, release: 0.25, rate: rand(30, 42), jit: 0.1, breath: 0.5, vowel: [880, 1550] as [number, number] },
          // A shrill screech: very high and cracking, with a wild flutter.
          screech: { len: rand(0.5, 1.5), peak: 0.95, base: rand(1050, 1700), rise: rand(1.1, 1.35), attack: 0.02, release: 0.15, rate: rand(42, 60), jit: 0.18, breath: 0.6, vowel: [1050, 2400] as [number, number] },
          // A long, thin, rising wail.
          wail: { len: rand(1.6, 3), peak: 0.8, base: rand(380, 560), rise: rand(1.5, 2.1), attack: 0.2, release: 0.5, rate: rand(24, 34), jit: 0.07, breath: 0.4, vowel: [700, 1900] as [number, number] },
        }[kind]
        f0 = p.base
        flutterRate = p.rate
        jitter = p.jit
        setPitch(f0, 0.03)
        // The pitch climbs, then drops away; sometimes it lurches mid-way.
        later(() => (f0 = p.base * p.rise), p.len * 330)
        later(() => (f0 = p.base * rand(0.72, 0.95)), p.len * 800)
        if (Math.random() < 0.35 && p.len > 0.6) later(() => (f0 *= rand(1.25, 1.55)), p.len * rand(0.35, 0.65) * 1000)
        // The mouth opens, then closes down.
        const deep: [number, number] = [210, 480] // breathing stays in the chest
        setMouth(kind === 'breath' ? deep : VOWELS[1], 0.04)
        later(() => setMouth(p.vowel, kind === 'bark' ? 0.03 : 0.1), p.len * 250)
        later(() => setMouth(kind === 'breath' ? deep : VOWELS[0], 0.18), p.len * 800)
        // Loudness: a swell and a fade, now and then with a stutter in the middle.
        env.gain.cancelScheduledValues(t)
        env.gain.setTargetAtTime(p.peak, t, p.attack)
        if (Math.random() < 0.4 && p.len > 0.8) {
          const at = t + p.len * rand(0.3, 0.6)
          env.gain.setTargetAtTime(0.08, at, 0.02)
          env.gain.setTargetAtTime(p.peak * rand(0.8, 1), at + rand(0.1, 0.25), 0.03)
        }
        const breathing = kind === 'breath'
        env.gain.setTargetAtTime(breathing ? 0.02 : 0.14, t + p.len * 0.6, p.release)
        breath.gain.setTargetAtTime(p.breath, t, breathing ? 0.3 : 0.05)
        breath.gain.setTargetAtTime(breathing ? 0.1 : 0.2, t + p.len * 0.8, 0.25)
        return p.len
      }

      let phraseTimer: number | null = null
      const phrase = () => {
        const kind = pickKind()
        let lasts: number
        if (kind === 'burst') {
          // A rapid run of two to four barks, each a little different.
          const n = 2 + Math.floor(Math.random() * 3)
          let at = 0
          for (let i = 0; i < n; i++) {
            later(() => voice('bark'), at * 1000)
            at += rand(0.12, 0.3)
          }
          lasts = at
        } else {
          lasts = voice(kind)
        }
        // Then a gap of unpredictable length: sometimes barely a breath, sometimes long enough to relax.
        const r = Math.random()
        // Hunting, she hardly pauses for breath.
        const gap = this.agitation > 0.5 ? rand(0.05, 0.7) : kind === 'breath' ? rand(0.3, 1.1) : r < 0.3 ? rand(0.1, 0.6) : r < 0.8 ? rand(0.8, 3) : rand(3.5, 8)
        phraseTimer = later(phrase, (lasts + gap) * 1000)
      }
      phraseTimer = later(phrase, 600)
      // The moment she spots you: cut off whatever she was doing and scream.
      this.alert = () => {
        if (phraseTimer !== null) {
          window.clearTimeout(phraseTimer)
          this.timers = this.timers.filter((x) => x !== phraseTimer)
        }
        phrase()
      }
    } catch {
      this.ctx = null // no Web Audio — the monster is silent
    }
  }

  /** 0..1: how worked up she is. Above half she screams; the instant it rises she cuts in with one. */
  setAgitation(a: number) {
    const rising = this.agitation <= 0.5 && a > 0.5
    this.agitation = a
    if (rising) this.alert?.()
  }

  /** Browsers keep audio suspended until the page has had a user gesture. */
  resume() {
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume().catch(() => {})
  }

  /**
   * @param listener   listener position, and the direction they face
   * @param source     where the growl comes from
   * @param silenced   force silence (e.g. while paused)
   */
  update(
    listener: { x: number; y: number; z: number; fx: number; fy: number; fz: number },
    source: { x: number; y: number; z: number },
    silenced: boolean,
  ) {
    const { ctx, level, tone, panner } = this
    if (!ctx || !level || !tone || !panner) return
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
    panner.positionX.setValueAtTime(source.x, t)
    panner.positionY.setValueAtTime(source.y, t)
    panner.positionZ.setValueAtTime(source.z, t)

    const d = Math.hypot(source.x - listener.x, source.y - listener.y, source.z - listener.z)
    const closeness = 1 - Math.min(1, Math.max(0, (d - FULL_VOLUME_RANGE) / (HEARING_RANGE - FULL_VOLUME_RANGE)))
    const volume = silenced ? 0 : MAX_GAIN * (1 + 0.5 * this.agitation) * closeness * closeness
    level.gain.setTargetAtTime(volume, t, 0.08)
    // Duller with distance: air and walls eat the highs first.
    // (Wide open while she's screaming, so the highs aren't dulled away.)
    tone.frequency.setTargetAtTime(500 + (1900 + 4500 * this.agitation) * closeness, t, 0.1)
  }

  dispose() {
    for (const t of this.timers) {
      window.clearTimeout(t)
      window.clearInterval(t)
    }
    this.timers = []
    for (const s of this.sources) {
      try {
        s.stop()
      } catch {
        /* already stopped */
      }
    }
    this.sources = []
    void this.ctx?.close().catch(() => {})
    this.ctx = null
  }
}
