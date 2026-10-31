// Locks the pointer with raw mouse input where the browser allows it. Chrome
// on Windows otherwise now and then reports a huge bogus mouse movement while
// locked, which spins the view round in a single frame.
export function requestLock(el: Element | null | undefined) {
  if (!el?.requestPointerLock) return
  try {
    const p = (el.requestPointerLock as (o?: { unadjustedMovement?: boolean }) => Promise<void> | void)({ unadjustedMovement: true })
    if (p && typeof p.catch === 'function') {
      // Not supported (or refused): fall back to a plain lock.
      p.catch((e: unknown) => {
        if ((e as { name?: string })?.name === 'NotSupportedError') el.requestPointerLock()
      })
    }
  } catch {
    el.requestPointerLock()
  }
}
