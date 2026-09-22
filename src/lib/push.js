import { supabase } from './supabase'

// Web Push for the daily 20:00 alerts (sent by api/cron-alerts.js).
// This key is the PUBLIC half of the VAPID pair -- safe to ship; the
// private half only exists in the Vercel env.
const VAPID_PUBLIC_KEY = 'BFFiYHbF47u15_8pkmxZcsPSM5VNtU2RitNsHs5lTqVJx8TqefxW80lzGlp-FADlsu1I_DqmKNjYvVEk5JIQl5Y'

const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true

// 'ok' | 'ios-install' (iPhone only allows push from the installed
// app, not from Safari) | 'unsupported'
export function pushSupport() {
  if (isIOS() && !isStandalone()) return 'ios-install'
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported'
  return 'ok'
}

export const notificationPermission = () =>
  ('Notification' in window) ? Notification.permission : 'unsupported'

const base64ToBytes = (b64) => {
  const s = atob((b64 + '='.repeat((4 - b64.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(s, c => c.charCodeAt(0))
}

export async function currentPushSubscription() {
  if (pushSupport() !== 'ok') return null
  const reg = await navigator.serviceWorker.getRegistration()
  return reg ? reg.pushManager.getSubscription() : null
}

export async function enablePush() {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error(permission === 'denied'
    ? 'Has bloqueado las notificaciones. Actívalas en los ajustes del navegador para esta web.'
    : 'No se concedió el permiso.')
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription() || await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64ToBytes(VAPID_PUBLIC_KEY),
  })
  const { endpoint, keys } = sub.toJSON()
  const { error } = await supabase.rpc('save_push_subscription', {
    p_endpoint: endpoint, p_p256dh: keys.p256dh, p_auth: keys.auth,
    p_user_agent: navigator.userAgent.slice(0, 200),
  })
  if (error) throw error
  return sub
}

export async function disablePush() {
  const sub = await currentPushSubscription()
  if (!sub) return
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
  await sub.unsubscribe()
}

export async function sendTestPush() {
  const { data } = await supabase.auth.getSession()
  const res = await fetch('/api/push-test', {
    method: 'POST',
    headers: { Authorization: `Bearer ${data.session?.access_token || ''}` },
  })
  if (!res.ok) throw new Error(`El servidor respondió ${res.status}`)
  const { delivered } = await res.json()
  if (!delivered) throw new Error('No se pudo entregar a ningún dispositivo. Desactiva y vuelve a activar los avisos.')
  return delivered
}
