// ── BROWSER NOTIFICATIONS ────────────────────────────────────
// Uses the standard Notification API (works in installed PWA too).
// No backend push service needed — checks run client-side when the
// app is open, which covers the common case of checking your phone.

export const requestNotificationPermission = async () => {
  if (!('Notification' in window)) return 'unsupported'
  if (Notification.permission === 'granted') return 'granted'
  if (Notification.permission === 'denied') return 'denied'
  return await Notification.requestPermission()
}

export const getNotificationPermission = () => {
  if (!('Notification' in window)) return 'unsupported'
  return Notification.permission
}

export const sendNotification = (title, options = {}) => {
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  try {
    new Notification(title, { icon: '/icon-192.png', badge: '/icon-192.png', ...options })
  } catch (e) { /* some browsers restrict direct `new Notification` inside SW context */ }
}

// ── BUDGET ALERT CHECKS ──────────────────────────────────────
// Call this once per session (e.g. on Dashboard mount) to check
// if any category has crossed the 80% or 100% threshold and hasn't
// been alerted yet this cycle. Uses localStorage to avoid spamming
// the same alert repeatedly within the same cycle.
export const checkBudgetAlerts = ({ categories, spendByCat, catBudgetFn, salary, cycleStartISO }) => {
  if (getNotificationPermission() !== 'granted') return

  const alertedKey = `fp_alerted_${cycleStartISO}`
  const alerted = new Set(JSON.parse(localStorage.getItem(alertedKey) || '[]'))

  categories.forEach(c => {
    if (c.type === 'saving') return
    const budget = catBudgetFn(c, salary)
    const spent = spendByCat[c.id] || 0
    if (budget <= 0) return
    const pct = spent / budget * 100

    const key100 = `${c.id}_100`
    const key80 = `${c.id}_80`

    if (pct >= 100 && !alerted.has(key100)) {
      sendNotification(`⚠️ ${c.icon} ${c.name}: presupuesto superado`, {
        body: `Has gastado ${Math.round(spent)} € de ${Math.round(budget)} € en este ciclo.`,
        tag: key100,
      })
      alerted.add(key100)
    } else if (pct >= 80 && pct < 100 && !alerted.has(key80)) {
      sendNotification(`🟡 ${c.icon} ${c.name}: 80% del presupuesto`, {
        body: `Llevas ${Math.round(spent)} € de ${Math.round(budget)} € en este ciclo.`,
        tag: key80,
      })
      alerted.add(key80)
    }
  })

  localStorage.setItem(alertedKey, JSON.stringify([...alerted]))
}
