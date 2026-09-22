import { withDb, jsonRows, sendToDevices } from './_lib/push'

// "Send me a test" from Settings: proves the whole chain (permission,
// subscription, keys, service worker) works on this person's devices
// without waiting until 20:00. The caller is identified by their
// Supabase session token, checked against Supabase Auth itself.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return res.status(401).json({ error: 'unauthorized' })
  const auth = await fetch(`${process.env.REACT_APP_SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: process.env.REACT_APP_SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
  })
  if (!auth.ok) return res.status(401).json({ error: 'unauthorized' })
  const { id: userId } = await auth.json()

  const delivered = await withDb(async (db) => {
    const devices = await jsonRows(db, 'select id, endpoint, p256dh, auth from push_subscriptions where user_id = $1', [userId])
    return sendToDevices(db, devices, {
      title: '🔔 Avisos activados',
      body: 'Así te llegarán los avisos de presupuesto, cada día a las 20:00 si hay algo que contar.',
      url: '/settings',
      tag: 'miplan-test',
    })
  })
  res.status(200).json({ delivered })
}
