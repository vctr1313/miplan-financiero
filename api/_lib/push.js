import webpush from 'web-push'
import pg from 'pg'

// Shared by the push endpoints. Files under api/_lib are not routes.
//
// Env (Vercel project settings, never in the repo):
//   ALERTS_DATABASE_URL  pooler URL for the restricted push_worker role
//                        (see supabase_patch_push.sql)
//   VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY  the push signing key pair; the
//                        public half is also in src/lib/push.js
//   CRON_SECRET          Vercel sends it to cron routes as a bearer token

export async function withDb(fn) {
  const client = new pg.Client({
    connectionString: process.env.ALERTS_DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  })
  await client.connect()
  try {
    return await fn(client)
  } finally {
    await client.end()
  }
}

// Rows as JSON, so dates, timestamps and numerics arrive exactly as
// PostgREST hands them to the app (strings and numbers), and the
// shared finance code sees the same shapes it does in the browser.
export async function jsonRows(client, sql, params = []) {
  const { rows } = await client.query(`select coalesce(json_agg(q), '[]'::json) as rows from (${sql}) q`, params)
  return rows[0].rows
}

let configured = false
function configure() {
  if (configured) return
  webpush.setVapidDetails(
    'https://miplan-financiero.vercel.app',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  )
  configured = true
}

// Sends one payload to each of a person's devices. A device that
// uninstalled the app or revoked permission answers 404/410: its row is
// deleted so it isn't retried forever. Returns how many were delivered.
export async function sendToDevices(client, subs, payload) {
  configure()
  let delivered = 0
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload),
        { TTL: 12 * 3600 },
      )
      delivered++
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        await client.query('delete from push_subscriptions where id = $1', [s.id])
      } else {
        console.error('push failed', s.id, err.statusCode, err.body || err.message)
      }
    }
  }
  return delivered
}
