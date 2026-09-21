// Which closed cycle (if any) should get its one-time recap right now:
// the one just before the current cycle, while the new cycle is still
// fresh (first 10 days), and only if it hasn't been shown yet on this
// device.
const RECAP_KEY = (cycle) => `fp_recap_seen_${cycle.txId || cycle.start.toISOString()}`

export function pendingRecap(cycles) {
  if (cycles.length < 2) return null
  const current = cycles[cycles.length - 1]
  const closed = cycles[cycles.length - 2]
  if (Date.now() - current.start.getTime() > 10 * 86400000) return null
  try {
    if (localStorage.getItem(RECAP_KEY(closed))) return null
  } catch { return null }
  return { cycle: closed, prevCycle: cycles.length >= 3 ? cycles[cycles.length - 3] : null }
}

export function markRecapSeen(cycle) {
  try { localStorage.setItem(RECAP_KEY(cycle), '1') } catch { /* private mode */ }
}
