// Same job as cron-alerts.js, on its own route: Vercel keys cron jobs
// by path, so the 19:00 UTC run (20:00 Madrid in winter) needs a
// second path to coexist with the 18:00 UTC one (summer).
export { default } from './cron-alerts'
