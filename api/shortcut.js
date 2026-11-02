import crypto from 'crypto'
import { withDb, jsonRows } from './_lib/push'
import { toLocalISODate } from '../src/lib/finance'
import {
  money as fmt, parseAmount, merchantKey, findRule, matchCategory, expenseCategories,
  remainingFor, expenseMessage, summaryMessage, recentExpenseOptions,
} from '../src/lib/shortcuts'

// The endpoint iPhone Shortcuts call, so the app works without opening
// it. Every answer is JSON with a `message` the shortcut can show as a
// notification as-is -- errors included (Shortcuts doesn't stop on a
// 4xx, it just hands over the body).
//
// Auth: "Authorization: Bearer <token>", the personal token from
// Ajustes → Atajos de iPhone. Only its SHA-256 is stored.
//
// Actions (?action=…; parameters as a JSON body or in the query):
//   expense     POST amount, merchant?, category?, note?, ask?, source?
//               category = name or id; "Decidir luego" (or none and no
//               learnt rule) files it under Pendientes de revisar.
//               ask=1 and no rule → answers status "ask" with the
//               category names instead of saving, so the shortcut can
//               show a menu and call again with the choice. Choosing a
//               category for a shop teaches the rule for next time.
//   categories  GET  the names an expense can go under (+ "Decidir luego")
//   summary     GET  category? → "Te quedan 34 € en Ocio…" or everything
//   recent      GET  labels of the latest expenses, for a Bizum menu
//   refund      POST amount, expense (label from `recent`, or id)
//
// Env: SHORTCUTS_DATABASE_URL, the pooler URL for the restricted
// shortcut_worker role (see supabase_patch_shortcuts.sql).

const LATER = 'Decidir luego'
const isLater = (v) => typeof v === 'string' && ['decidirluego', 'luego', 'pendiente', 'despues'].includes(
  v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, ''))

const reply = (res, status, body) => res.status(status).json(body)
const fail = (res, status, message) => reply(res, status, { status: 'error', message })

export const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex')

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  // Dates and cycle boundaries are local midnights in the app.
  process.env.TZ = 'Europe/Madrid'

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return fail(res, 401, 'Falta el token. Cópialo de Ajustes → Atajos de iPhone.')

  const p = { ...req.query, ...(req.body && typeof req.body === 'object' ? req.body : {}) }
  const action = String(p.action || '').toLowerCase()

  try {
    await withDb(async (db) => {
      const [me] = await jsonRows(db, `
        select t.user_id, p.household_id, p.salary
        from shortcut_tokens t join profiles p on p.id = t.user_id
        where t.token_hash = $1`, [hashToken(token)])
      if (!me) return fail(res, 401, 'Token no válido. Genera uno nuevo en Ajustes → Atajos de iPhone y cámbialo en el atajo.')
      if (!me.household_id) return fail(res, 409, 'Tu cuenta aún no tiene hogar. Abre la app una vez y vuelve a probar.')
      await db.query('update shortcut_tokens set last_used_at = now() where user_id = $1', [me.user_id])

      const h = me.household_id
      const profile = { salary: Number(me.salary) || 0 }
      const load = async () => ({
        categories: await jsonRows(db, 'select * from categories where household_id = $1', [h]),
        transactions: await jsonRows(db, 'select * from transactions where household_id = $1', [h]),
        pctHistory: await jsonRows(db, 'select * from category_pct_history where household_id = $1', [h]),
      })

      if (action === 'categories') {
        const { categories } = await load()
        const names = [...expenseCategories(categories).map(c => c.name), LATER]
        return reply(res, 200, { status: 'ok', categories: names, message: names.join('\n') })
      }

      if (action === 'summary') {
        const data = await load()
        let category = null
        if (p.category) {
          category = matchCategory(data.categories, p.category)
          if (!category) return fail(res, 404, `No encuentro la categoría "${p.category}".`)
        }
        return reply(res, 200, { status: 'ok', message: summaryMessage({ ...data, profile, category }) })
      }

      if (action === 'recent') {
        const { transactions } = await load()
        const options = recentExpenseOptions(transactions)
        if (!options.length) return fail(res, 404, 'Aún no hay gastos a los que enlazar un Bizum.')
        return reply(res, 200, { status: 'ok', labels: options.map(o => o.label), message: options.map(o => o.label).join('\n') })
      }

      if (action === 'expense') {
        if (req.method !== 'POST') return fail(res, 405, 'Usa el método POST para apuntar un gasto.')
        const amount = parseAmount(p.amount)
        if (!amount) return fail(res, 400, `No he entendido el importe "${p.amount ?? ''}".`)
        const merchant = String(p.merchant || '').trim().slice(0, 80)
        const note = String(p.note || '').trim().slice(0, 200)
        const { categories } = await load()

        let category = null
        let learn = false
        if (p.category != null && String(p.category).trim() !== '' && !isLater(p.category)) {
          category = matchCategory(categories, String(p.category))
          if (!category) return fail(res, 404, `No encuentro la categoría "${p.category}". Revisa el nombre en la app.`)
          learn = !!merchantKey(merchant)
        } else if (!isLater(p.category)) {
          const rules = await jsonRows(db, 'select * from merchant_rules where household_id = $1', [h])
          const rule = findRule(rules, merchant)
          category = rule && categories.find(c => c.id === rule.category_id && c.type !== 'saving')
          if (!category && truthy(p.ask)) {
            const names = [...expenseCategories(categories).map(c => c.name), LATER]
            return reply(res, 200, {
              status: 'ask', categories: names, amount, merchant,
              message: `¿Categoría para ${merchant || 'este gasto'} · ${fmt(amount)}?`,
            })
          }
        }

        if (learn) {
          await db.query(`
            insert into merchant_rules (household_id, merchant_key, merchant_label, category_id)
            values ($1, $2, $3, $4)
            on conflict (household_id, merchant_key)
            do update set category_id = excluded.category_id, merchant_label = excluded.merchant_label, updated_at = now()`,
          [h, merchantKey(merchant), merchant, category.id])
        }

        const description = merchant || note || 'Gasto rápido'
        // A shortcut run twice by accident (double tap, retry on a bad
        // connection) shouldn't file the same expense twice.
        const [dupe] = await jsonRows(db, `
          select id from transactions
          where user_id = $1 and type = 'expense' and amount = $2 and description = $3
            and created_at > now() - interval '90 seconds'`, [me.user_id, amount, description])
        let id = dupe?.id
        if (!id) {
          const { rows } = await db.query(`
            insert into transactions (user_id, household_id, type, amount, date, description, notes, category_id, is_salary, needs_review, source)
            values ($1, $2, 'expense', $3, $4, $5, $6, $7, false, $8, $9) returning id`,
          [me.user_id, h, amount, toLocalISODate(new Date()), description,
            merchant && note ? note : null, category?.id || null, !category,
            p.source === 'pay' ? 'shortcut-pay' : 'shortcut-quick'])
          id = rows[0].id
        }

        const data = await load()
        const left = category ? remainingFor({ ...data, profile, category }) : null
        return reply(res, 200, {
          status: dupe ? 'duplicate' : 'saved', id, category: category?.name || null, left,
          message: (dupe ? 'Ya estaba apuntado. ' : '') + expenseMessage({ amount, merchant, category, left }),
        })
      }

      if (action === 'refund') {
        if (req.method !== 'POST') return fail(res, 405, 'Usa el método POST para apuntar un Bizum.')
        const amount = parseAmount(p.amount)
        if (!amount) return fail(res, 400, `No he entendido el importe "${p.amount ?? ''}".`)
        const data = await load()
        const ref = String(p.expense || '').trim()
        const id = data.transactions.some(t => t.id === ref)
          ? ref
          : recentExpenseOptions(data.transactions).find(o => o.label === ref)?.id
        const original = data.transactions.find(t => t.id === id && t.type === 'expense')
        if (!original) return fail(res, 404, 'No encuentro ese gasto. Vuelve a lanzar el atajo y elige uno de la lista.')

        await db.query(`
          insert into transactions (user_id, household_id, type, amount, date, description, category_id, is_salary, linked_expense_id, source)
          values ($1, $2, 'transfer', $3, $4, $5, null, false, $6, 'shortcut-refund')`,
        [me.user_id, h, amount, toLocalISODate(new Date()), `Bizum · ${original.description}`.slice(0, 120), original.id])

        const fresh = await load()
        const category = fresh.categories.find(c => c.id === original.category_id)
        const left = category ? remainingFor({ ...fresh, profile, category }) : null
        let message = `Bizum de ${fmt(amount)} enlazado a ${original.description}.`
        if (category && left != null) message += `\nTe quedan ${fmt(left)} en ${category.name}${category.type === 'pot' ? ' (bote)' : ''}.`
        return reply(res, 200, { status: 'saved', message })
      }

      return fail(res, 400, 'Acción desconocida. Usa expense, categories, summary, recent o refund.')
    }, process.env.SHORTCUTS_DATABASE_URL)
  } catch (err) {
    console.error('shortcut failed', action, err)
    if (!res.headersSent) fail(res, 500, 'No se ha podido guardar. Prueba otra vez en un momento.')
  }
}

const truthy = (v) => v === true || v === 1 || ['1', 'true', 'si', 'sí', 'yes'].includes(String(v).toLowerCase())
