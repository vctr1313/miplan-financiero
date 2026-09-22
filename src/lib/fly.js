// After saving a movement, its amount flies from the save button to
// where it landed -- the category's row on the home screen if it's in
// view, otherwise the Movimientos tab/menu item -- which then bounces.
// Purely decorative: skipped under "reduce motion" or without WAAPI.

const inView = (el) => {
  if (!el) return false
  const r = el.getBoundingClientRect()
  return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth
}

const findTarget = (categoryId) => {
  const candidates = [
    categoryId && document.querySelector(`[data-cat-row="${categoryId}"]`),
    document.querySelector('.bottom-nav [data-path="/transactions"]'),
    document.querySelector('.sidebar [data-path="/transactions"]'),
  ]
  return candidates.find(inView) || null
}

export function flyAmount({ text, from, color = 'var(--i5)', categoryId }) {
  if (!from || typeof document === 'undefined' || !document.body.animate) return
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
  const target = findTarget(categoryId)
  if (!target) return

  const chip = document.createElement('div')
  chip.className = 'fly-chip'
  chip.textContent = text
  chip.style.setProperty('--fly-c', color)
  document.body.appendChild(chip)

  const to = target.getBoundingClientRect()
  const x0 = from.left + from.width / 2
  const y0 = from.top + from.height / 2
  const x1 = to.left + Math.min(to.width, 60) / 2
  const y1 = to.top + to.height / 2
  // Up and over: the midpoint rises above both ends, like a thrown coin.
  const midY = Math.min(y0, y1) - 90
  const at = (x, y, s, o) => ({ transform: `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${s})`, opacity: o })

  chip.animate(
    [at(x0, y0, 1, 1), { ...at((x0 + x1) / 2, midY, 1.12, 1), offset: 0.45 }, at(x1, y1, 0.35, 0.15)],
    { duration: 820, easing: 'cubic-bezier(.45,0,.25,1)', fill: 'forwards' }
  ).finished.then(() => {
    chip.remove()
    target.animate(
      [{ transform: 'scale(1)' }, { transform: 'scale(1.06)', filter: 'brightness(1.25)' }, { transform: 'scale(1)' }],
      { duration: 420, easing: 'cubic-bezier(.34,1.56,.64,1)' }
    )
  }).catch(() => chip.remove())
}
