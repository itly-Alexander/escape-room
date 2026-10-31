import { useEffect, useRef } from 'react'
import { watch } from '@/engine/watch'

// Your eyelids, for the doll's level. As your eyes dry out the edges of the
// view darken and close in; then the lids snap shut and open again. Driven by
// engine/watch.ts, so on any other level it never shows.
export function WatchOverlay() {
  const top = useRef<HTMLDivElement>(null)
  const bottom = useRef<HTMLDivElement>(null)
  const dry = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let id = 0
    const tick = () => {
      const b = watch.blink
      // Lids close a few percent while drying, then all the way in a blink.
      const shut = Math.max(b, watch.dry * 0.08)
      if (top.current) top.current.style.transform = `translateY(${(shut - 1) * 100}%)`
      if (bottom.current) bottom.current.style.transform = `translateY(${(1 - shut) * 100}%)`
      if (dry.current) dry.current.style.opacity = String(watch.dry * 0.85)
      id = requestAnimationFrame(tick)
    }
    id = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(id)
  }, [])

  return (
    <div style={rootStyle}>
      <div ref={dry} style={dryStyle} />
      <div ref={top} style={{ ...lidStyle, top: 0, borderRadius: '0 0 50% 50% / 0 0 18% 18%', transform: 'translateY(-100%)' }} />
      <div ref={bottom} style={{ ...lidStyle, bottom: 0, borderRadius: '50% 50% 0 0 / 18% 18% 0 0', transform: 'translateY(100%)' }} />
    </div>
  )
}

const rootStyle: React.CSSProperties = { position: 'fixed', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 5 }
const lidStyle: React.CSSProperties = { position: 'absolute', left: '-10%', width: '120%', height: '52%', background: '#050304' }
const dryStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  opacity: 0,
  background: 'radial-gradient(ellipse at center, rgba(0,0,0,0) 30%, rgba(40,8,8,0.55) 75%, rgba(0,0,0,0.9) 100%)',
}
