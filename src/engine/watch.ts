// Shared state for the doll's level: whether she's awake, the player's eyes and
// the house's failing power. The doll (engine/Doll.tsx) drives it each frame; the
// lights, the eyelid overlay and the bulbs read it. Everything rests at "awake
// = false, eyes open, power on", so levels without a doll never notice it.

export const watch = {
  /** She has woken and is hunting. */
  awake: false,
  /** 0 = eyes open, 1 = shut (a blink). */
  blink: 0,
  /** 0..1: eyes drying out, the blink is coming. */
  dry: 0,
  /** 0..1: the house circuit. 1 = lights on, 0 = blackout. */
  power: 1,
}

export function resetWatch() {
  watch.awake = false
  watch.blink = 0
  watch.dry = 0
  watch.power = 1
}
