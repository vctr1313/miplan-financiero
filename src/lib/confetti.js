// Tiny dependency-free confetti burst for moments worth celebrating
// (a saving goal reaching 100%). Draws on a throwaway full-screen
// canvas that removes itself when the last piece has fallen.
const COLORS = ['#007aff', '#34c759', '#ff9500', '#ff2d55', '#af52de', '#ffcc00', '#32ade6']

export function burstConfetti({ x = 0.5, y = 0.35, count = 140 } = {}) {
  if (typeof window === 'undefined') return
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

  const canvas = document.createElement('canvas')
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const W = window.innerWidth
  const H = window.innerHeight
  canvas.width = W * dpr
  canvas.height = H * dpr
  Object.assign(canvas.style, {
    position: 'fixed', inset: '0', width: '100%', height: '100%',
    pointerEvents: 'none', zIndex: 2000,
  })
  document.body.appendChild(canvas)
  const ctx = canvas.getContext('2d')
  ctx.scale(dpr, dpr)

  const originX = W * x
  const originY = H * y
  const pieces = Array.from({ length: count }, () => {
    const angle = Math.random() * Math.PI * 2
    const speed = 6 + Math.random() * 9
    return {
      x: originX, y: originY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 7,
      w: 6 + Math.random() * 6, h: 8 + Math.random() * 8,
      rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.35,
      color: COLORS[(Math.random() * COLORS.length) | 0],
      life: 0,
    }
  })

  let frame
  const tick = () => {
    ctx.clearRect(0, 0, W, H)
    let alive = 0
    for (const p of pieces) {
      p.life++
      p.vy += 0.32            // gravity
      p.vx *= 0.985           // air drag
      p.vy *= 0.985
      p.x += p.vx
      p.y += p.vy
      p.rot += p.vr
      if (p.y > H + 40) continue
      alive++
      const fade = Math.max(0, 1 - p.life / 190)
      ctx.save()
      ctx.globalAlpha = fade
      ctx.translate(p.x, p.y)
      ctx.rotate(p.rot)
      // Squash on one axis as it spins, so pieces seem to flip over.
      ctx.scale(1, Math.cos(p.life * 0.18))
      ctx.fillStyle = p.color
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h)
      ctx.restore()
    }
    if (alive > 0 && pieces[0].life < 260) frame = requestAnimationFrame(tick)
    else canvas.remove()
  }
  frame = requestAnimationFrame(tick)
  return () => { cancelAnimationFrame(frame); canvas.remove() }
}
