import { withDb, jsonRows, sendToDevices } from './_lib/push'
import { computeAlerts, bundleAlerts } from '../src/lib/alerts'

// Daily budget alerts, pushed at 20:00 Spanish time.
//
// Vercel cron runs in UTC and Spain moves between UTC+2 (summer) and
// UTC+1 (winter), so vercel.json schedules this at 18:00 UTC and, via
// cron-alerts-winter.js, at 19:00 UTC. Whichever run lands in the
// 20:00 Madrid hour does the work and the other one exits; push_log
// makes a second run harmless anyway.
//
// ?force=1 skips the hour check (manual runs; still needs CRON_SECRET).
export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'unauthorized' })
  }
  // Cycle boundaries are local midnights in the app; judge them the
  // same way here.
  process.env.TZ = 'Europe/Madrid'

  const hour = Number(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Madrid', hour: 'numeric', hourCycle: 'h23',
  }).format(new Date()))
  if (hour !== 20 && req.query.force !== '1') {
    return res.status(200).json({ skipped: `son las ${hour}h en Madrid` })
  }

  const report = await withDb(async (db) => {
    const subs = await jsonRows(db, `
      select s.id, s.user_id, s.endpoint, s.p256dh, s.auth, p.salary, p.household_id
      from push_subscriptions s join profiles p on p.id = s.user_id`)
    if (!subs.length) return { users: 0, sent: 0 }

    const households = [...new Set(subs.map(s => s.household_id).filter(Boolean))]
    // One connection runs one query at a time, so these go in sequence.
    const categories = await jsonRows(db, 'select * from categories where household_id = any($1)', [households])
    const transactions = await jsonRows(db, 'select * from transactions where household_id = any($1)', [households])
    const pctHistory = await jsonRows(db, 'select * from category_pct_history where household_id = any($1)', [households])
    const log = await jsonRows(db, 'select user_id, key from push_log where user_id = any($1)', [[...new Set(subs.map(s => s.user_id))]])
    const alreadySent = new Set(log.map(l => `${l.user_id}|${l.key}`))
    const byHousehold = (rows, h) => rows.filter(r => r.household_id === h)

    const byUser = {}
    subs.forEach(s => { (byUser[s.user_id] ||= []).push(s) })

    let sent = 0
    for (const [userId, devices] of Object.entries(byUser)) {
      const h = devices[0].household_id
      const fresh = computeAlerts({
        profile: { salary: devices[0].salary },
        categories: byHousehold(categories, h),
        transactions: byHousehold(transactions, h),
        pctHistory: byHousehold(pctHistory, h),
      }).filter(a => !alreadySent.has(`${userId}|${a.key}`))

      const payload = bundleAlerts(fresh)
      if (!payload) continue
      // Only remembered as sent if it reached at least one device --
      // otherwise tomorrow's run tries again.
      if (await sendToDevices(db, devices, payload)) {
        sent++
        await db.query(
          'insert into push_log (user_id, key) select $1, unnest($2::text[]) on conflict do nothing',
          [userId, fresh.map(a => a.key)],
        )
      }
    }
    return { users: Object.keys(byUser).length, sent }
  })

  res.status(200).json(report)
}
