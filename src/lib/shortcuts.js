import { buildCycles, getCurrentCycle, calcCycleStats, catBudget, calcPotBalance } from './finance'

// Money as a notification reads it: "23,40 €", "18 €", "1.234,50 €".
export const money = (n) => {
  const v = Math.round((n || 0) * 100) / 100
  return v.toLocaleString('es-ES', { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2, useGrouping: true }) + ' €'
}
const fmt = money

// Everything the iPhone Shortcuts endpoint (api/shortcut.js) decides,
// as plain functions over the same rows the app loads -- so the
// numbers a shortcut reads out are exactly the ones on screen, and all
// of it is testable without a database.

// ── AMOUNTS ───────────────────────────────────────────────────
// Whatever Shortcuts hands over: a number, or text in any locale --
// "23,40 €", "€23.40", "1.234,56", "1,234.56 EUR", "-12,5". The Wallet
// "Transacción" trigger gives the amount as text with the currency.
// Returns a positive number rounded to cents, or null if there's none.
export function parseAmount(input) {
  if (typeof input === 'number') return Number.isFinite(input) && input !== 0 ? round2(Math.abs(input)) : null
  if (typeof input !== 'string') return null
  let s = input.replace(/[^\d.,]/g, '')
  if (!s) return null
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  if (lastComma > -1 && lastDot > -1) {
    // Both: whichever comes last is the decimal mark.
    const dec = lastComma > lastDot ? ',' : '.'
    const thou = dec === ',' ? '.' : ','
    s = s.split(thou).join('').replace(dec, '.')
  } else if (lastComma > -1 || lastDot > -1) {
    const mark = lastComma > -1 ? ',' : '.'
    const parts = s.split(mark)
    // "1.234" / "1,234,567": groups of exactly three after the mark are
    // thousands; "12,5" / "23.40" are decimals.
    const isThousands = parts.length > 2 || (parts[1].length === 3 && parts[0].length >= 1 && parts[0] !== '0')
    s = isThousands ? parts.join('') : parts.join('.')
  }
  const n = Number(s)
  return Number.isFinite(n) && n > 0 ? round2(n) : null
}
const round2 = (n) => Math.round(n * 100) / 100

// ── SHOPS ─────────────────────────────────────────────────────
const fold = (s) => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase()

const LEGAL_SUFFIXES = new Set(['sl', 'sa', 'slu', 'sau', 'scl', 'sll', 'cb', 'ltd', 'inc', 'gmbh', 'srl', 'bv'])

// The stable part of a shop name, for matching: "MERCADONA, S.A." and
// "Mercadona Av. Paz 23" both start with "mercadona". Drops accents,
// punctuation, store numbers and legal suffixes; keeps four words.
export function merchantKey(name) {
  const words = fold(name)
    .replace(/\b([a-z])\.(?=[a-z]\b)/g, '$1') // "s.a." → "sa."
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(w => w && !/\d/.test(w) && !LEGAL_SUFFIXES.has(w))
  return words.slice(0, 4).join(' ')
}

// Words too common to identify a shop on their own: "Bar Manolo" and
// "Bar Pepe" must not share a rule just because both start with "bar".
const GENERIC = new Set(['bar', 'bares', 'cafe', 'cafeteria', 'restaurante', 'rest', 'tienda', 'super',
  'supermercado', 'supermercados', 'farmacia', 'gasolinera', 'estacion', 'servicio', 'parking', 'hotel',
  'panaderia', 'frutas', 'fruteria', 'kiosko', 'quiosco', 'taberna', 'cerveceria', 'pizzeria', 'el', 'la',
  'los', 'las', 'de', 'del', 'the', 'casa', 'grupo', 'centro', 'mercado', 'comercial', 'www', 'com'])

// The learnt rule for a shop, most specific first:
//  1. exact key, or the longest rule key the shop name starts with
//     ("mercadona" covers "mercadona av paz");
//  2. otherwise, same distinctive first word -- another branch of the
//     same chain ("mercadona av paz" covers "mercadona c mayor") -- as
//     long as every rule for that word agrees on the category.
export function findRule(rules, merchant) {
  const key = merchantKey(merchant)
  if (!key) return null
  let best = null
  for (const r of rules) {
    if (key === r.merchant_key || key.startsWith(r.merchant_key + ' ')) {
      if (!best || r.merchant_key.length > best.merchant_key.length) best = r
    }
  }
  if (best) return best
  const first = key.split(' ')[0]
  if (first.length < 4 || GENERIC.has(first)) return null
  const sameChain = rules.filter(r => r.merchant_key.split(' ')[0] === first)
  if (!sameChain.length || sameChain.some(r => r.category_id !== sameChain[0].category_id)) return null
  return sameChain[0]
}

// ── CATEGORIES ────────────────────────────────────────────────
// What a shortcut can file an expense under: what the app offers for
// expenses (everything but saving categories), in the app's order.
export const expenseCategories = (categories) =>
  [...categories]
    .filter(c => c.type !== 'saving')
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))

const nameKey = (s) => fold(s).replace(/[^a-z0-9]+/g, '')

// A category from what the shortcut sent: its id, or its name however
// it was typed or dictated ("ocio", "Ocio", "🍹 Ocio", "comida fuera").
export function matchCategory(categories, input) {
  if (input == null || input === '') return null
  const byId = categories.find(c => c.id === input && c.type !== 'saving')
  if (byId) return byId
  const k = nameKey(input)
  if (!k) return null
  const cats = expenseCategories(categories)
  return cats.find(c => nameKey(c.name) === k)
    || cats.find(c => nameKey(c.name).startsWith(k) || k.startsWith(nameKey(c.name)))
    || null
}

// ── WHAT'S LEFT ───────────────────────────────────────────────
// Day-to-day categories: this cycle's budget minus what's been spent
// (reimbursements already discounted). Pots: their running balance.
// Saving categories have nothing "left" to spend: null.
export function remainingFor({ category, profile, categories, transactions, pctHistory = [], now = new Date() }) {
  if (!category || category.type === 'saving') return null
  const salary = profile?.salary || 0
  const cycles = buildCycles(transactions)
  if (category.type === 'pot') {
    return calcPotBalance({ category, salary, cycles, transactions, pctHistory, asOfDate: now })
  }
  const cycle = getCurrentCycle(cycles)
  if (!cycle) return null
  const stats = calcCycleStats({ transactions, cycle, categories, salary, fixedExpenses: [] })
  return catBudget(category, cycle.salary || salary) - (stats.spendByCat[category.id] || 0)
}

const DAY = 86400000

// Rough days until the next nómina: the current cycle's start plus the
// average length of the closed ones (30 if there are none yet).
export function daysToNextSalary(transactions, now = new Date()) {
  const cycles = buildCycles(transactions)
  const cycle = getCurrentCycle(cycles)
  if (!cycle) return null
  const closed = cycles.slice(0, -1)
  const avg = closed.length
    ? closed.reduce((s, c) => s + (c.end - c.start) / DAY + 1, 0) / closed.length
    : 30
  return Math.max(0, Math.ceil((cycle.start.getTime() + avg * DAY - now.getTime()) / DAY))
}

const leftText = (category, left) => left < -0.005
  ? (category.type === 'pot' ? `bote en negativo (${fmt(left)})` : `te has pasado ${fmt(-left)}`)
  : `${fmt(left)}`

// What the notification says after filing an expense.
export function expenseMessage({ amount, merchant, category, left }) {
  const head = `${fmt(amount)}${merchant ? ` · ${merchant}` : ''}`
  if (!category) return `${head}\nSin categoría: queda en Pendientes de revisar.`
  const line1 = `${head} → ${category.name}`
  if (left == null) return line1
  if (left < -0.005) return `${line1}\n${category.name}: ${leftText(category, left)}.`
  return `${line1}\nTe quedan ${fmt(left)} en ${category.name}${category.type === 'pot' ? ' (bote)' : ' este ciclo'}.`
}

// "¿Cuánto me queda?" -- for one category, or the whole picture.
export function summaryMessage({ category, profile, categories, transactions, pctHistory = [], now = new Date() }) {
  const days = daysToNextSalary(transactions, now)
  const daysText = days == null ? '' : days === 0 ? ' La nómina debería llegar hoy.' : ` Unos ${days} días para la nómina.`
  if (!getCurrentCycle(buildCycles(transactions))) return 'Aún no hay ninguna nómina apuntada, así que no hay ciclo en marcha.'
  const ctx = { profile, categories, transactions, pctHistory, now }

  if (category) {
    const left = remainingFor({ ...ctx, category })
    if (left == null) return `${category.name} es una categoría de ahorro: no tiene saldo para gastar.`
    if (left < -0.005) return `${category.name}: ${leftText(category, left)}.${daysText}`
    return `Te quedan ${fmt(left)} en ${category.name}${category.type === 'pot' ? ' (bote)' : ''}.${daysText}`
  }

  const cats = expenseCategories(categories)
  const lines = cats.map(c => ({ c, left: remainingFor({ ...ctx, category: c }) })).filter(x => x.left != null)
  const free = lines.filter(x => x.c.type === 'normal').reduce((s, x) => s + Math.max(0, x.left), 0)
  const detail = lines.map(x => `${x.c.name}${x.c.type === 'pot' ? ' (bote)' : ''}: ${leftText(x.c, x.left)}`).join('\n')
  return `Te quedan ${fmt(free)} para el día a día.${daysText}\n\n${detail}`
}

// ── BIZUM ─────────────────────────────────────────────────────
// Recent expenses a reimbursement can be linked to, labelled for a
// Shortcuts menu: "12/11 · Bar Manolo · 18 €". Labels are unique (a
// menu picks by label).
export function recentExpenseOptions(transactions, limit = 12) {
  const seen = new Map()
  return transactions
    .filter(t => t.type === 'expense')
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.created_at || '').localeCompare(a.created_at || ''))
    .slice(0, limit)
    .map(t => {
      const [, m, d] = (t.date || '').split('-')
      let label = `${d}/${m} · ${t.description || 'Gasto'} · ${fmt(t.amount)}`
      const n = (seen.get(label) || 0) + 1
      seen.set(label, n)
      if (n > 1) label += ` (${n})`
      return { id: t.id, label }
    })
}
