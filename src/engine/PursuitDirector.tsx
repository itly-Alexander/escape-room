import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { ambientMusic } from './ambient'
import { LOSE_AFTER_S, pursuit, resetPursuit } from './pursuit'
import { PursuitAudio } from './pursuitAudio'
import { useWorld } from '@/state/world'

/**
 * Runs the pursuit. The monster flags `pursuit.seenFrame` whenever she can see
 * the player. The first sighting starts the chase: the ambience is ducked away
 * and the chase score and heartbeat come up. Once the player has been out of
 * her sight for LOSE_AFTER_S seconds the chase ends and the ambience returns.
 */
export function PursuitDirector() {
  const audio = useRef<PursuitAudio | null>(null)
  const clock = useRef({ now: 0, lastSeen: -1e9, chaseStart: 0 })
  const paused = useThree((s) => s.frameloop === 'demand')
  const pausedRef = useRef(paused)
  pausedRef.current = paused

  useEffect(() => {
    resetPursuit()
    const a = new PursuitAudio()
    a.start()
    audio.current = a
    const resume = () => a.resume()
    window.addEventListener('pointerdown', resume)
    window.addEventListener('keydown', resume)
    return () => {
      window.removeEventListener('pointerdown', resume)
      window.removeEventListener('keydown', resume)
      a.dispose()
      audio.current = null
      ambientMusic.setDuck(1, 0.1)
      resetPursuit()
    }
  }, [])

  // Frames stop while paused, so cut the sound the moment that happens.
  useEffect(() => {
    audio.current?.setMuted(paused)
    ambientMusic.setDuck(paused ? 1 : 1 - 0.9 * pursuit.intensity, 0.1)
  }, [paused])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.5) // a hitch must not stretch the 10 s countdown
    if (useWorld.getState().caught) {
      audio.current?.setMuted(true)
      ambientMusic.setDuck(0, 0.05)
      return
    }
    const c = clock.current
    c.now += dt

    if (pursuit.seenFrame) {
      if (!pursuit.chasing) {
        pursuit.chasing = true
        c.chaseStart = c.now
      }
      c.lastSeen = c.now
    }
    pursuit.seenFrame = false
    if (pursuit.chasing && c.now - c.lastSeen > LOSE_AFTER_S) pursuit.chasing = false

    // Up fast (about half a second), down slowly (about four seconds).
    const target = pursuit.chasing ? 1 : 0
    const rate = target > pursuit.intensity ? 1 / 0.5 : 1 / 4
    pursuit.intensity += Math.sign(target - pursuit.intensity) * Math.min(Math.abs(target - pursuit.intensity), rate * dt)

    const a = audio.current
    if (!a) return
    a.setIntensity(pursuit.intensity, pursuit.chasing ? c.now - c.chaseStart : 0)
    ambientMusic.setDuck(1 - 0.9 * pursuit.intensity, 0.25)
  })

  return null
}
