// Module-scoped per-frame player motion data. Written by FPSController and
// read by HeldItem (walk-bob/idle-sway) and DevHUD (pos / yaw). Using a ref
// rather than zustand avoids per-frame re-renders.
export const playerMotion = {
  moving: false,
  bobT: 0,
  crouching: false,
  posX: 0,
  posY: 0,
  posZ: 0,
  yaw: 0,
}
