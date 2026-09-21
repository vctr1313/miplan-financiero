// Pure logic for importing a bank statement. Everything here works on
// plain arrays of strings (rows of cells), so the file format -- CSV
// or XLSX (see lib/xlsx.js) -- doesn't matter past the reader.

// ── CSV ───────────────────────────────────────────────────────
// Spanish banks export with ';' (because ',' is the decimal mark), but
// some use ',' or tabs. Pick whichever splits the first lines most
// consistently.
export function detectDelimiter(text) {
  const sample = text.split(/\r?\n/).filter(l => l.trim()).slice(0, 15)
  let best = ';'
  let bestScore = -1
  for (const d of [';', ',', '\t', '|']) {
    const counts = sample.map(l => splitCsvLine(l, d).length)
    const common = mode(counts)
    const score = common > 1 ? counts.filter(c => c === common).length * common : 0
    if (score > bestScore) { best = d; bestScore = score }
  }
  return best
}

const mode = (arr) => {
  const f = {}
  let m = arr[0]
  arr.forEach(v => { f[v] = (f[v] || 0) + 1; if (f[v] > (f[m] || 0)) m = v })
  return m
}

function splitCsvLine(line, d) {
  const out = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++ }
      else if (ch === '"') quoted = false
      else cur += ch
    } else if (ch === '"') quoted = true
    else if (ch === d) { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur)
  return out.map(c => c.trim())
}

export function parseCsv(text) {
  const clean = text.replace(/^﻿/, '')
  const d = detectDelimiter(clean)
  return clean.split(/\r?\n/).filter(l => l.trim()).map(l => splitCsvLine(l, d))
}

// ── VALUES ────────────────────────────────────────────────────
// "1.234,56" / "-12,50" / "12.50" / "1,234.56" / "12,50 €" / "(12,50)"
export function parseAmount(raw) {
  if (raw == null) return null
  if (typeof raw === 'number') return raw
  let s = String(raw).trim().replace(/[€\s ]/g, '').replace(/EUR$/i, '')
  if (!s) return null
  let negative = false
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1) }
  if (s.endsWith('-')) { negative = true; s = s.slice(0, -1) }
  if (s.startsWith('-')) { negative = !negative; s = s.slice(1) }
  else if (s.startsWith('+')) s = s.slice(1)
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  if (lastComma > lastDot) {
    s = s.replace(/\./g, '').replace(',', '.')          // 1.234,56
  } else if (lastDot > lastComma && lastComma !== -1) {
    s = s.replace(/,/g, '')                              // 1,234.56
  } else if (lastDot !== -1 && lastComma === -1) {
    // Only dots: "1.234" (thousands) vs "12.50" (decimals).
    const parts = s.split('.')
    if (parts.length > 2 || (parts[1] && parts[1].length === 3 && parts[0].length <= 3)) s = s.replace(/\./g, '')
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return null
  const n = parseFloat(s)
  return negative ? -n : n
}

// dd/mm/yyyy, dd-mm-yy, dd.mm.yyyy, yyyy-mm-dd, or an Excel serial
// day number. Returns YYYY-MM-DD (local calendar date) or null.
export function parseDate(raw) {
  if (raw == null || raw === '') return null
  const pad = (n) => String(n).padStart(2, '0')
  const build = (y, m, d) => {
    if (y < 100) y += 2000
    const dt = new Date(y, m - 1, d)
    if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null
    return `${y}-${pad(m)}-${pad(d)}`
  }
  if (typeof raw === 'number' || /^\d{5}(\.\d+)?$/.test(String(raw).trim())) {
    // Excel serial: days since 1899-12-30.
    const serial = Math.floor(Number(raw))
    if (serial < 20000 || serial > 80000) return null
    const dt = new Date(1899, 11, 30 + serial)
    return build(dt.getFullYear(), dt.getMonth() + 1, dt.getDate())
  }
  const s = String(raw).trim().split(/[ T]/)[0]
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/)
  if (m) return build(+m[1], +m[2], +m[3])
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/)
  if (m) return build(+m[3], +m[2], +m[1])
  return null
}

// ── COLUMN DETECTION ──────────────────────────────────────────
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()

const HEADER_HINTS = {
  date: ['fecha operacion', 'fecha', 'f. operacion', 'f.operacion', 'date', 'fecha valor'],
  description: ['concepto', 'descripcion', 'movimiento', 'detalle', 'description', 'observaciones', 'texto'],
  amount: ['importe', 'cantidad', 'amount', 'euros'],
  debit: ['cargo', 'cargos', 'debe', 'debito', 'gasto'],
  credit: ['abono', 'abonos', 'haber', 'credito', 'ingreso'],
  balance: ['saldo', 'balance', 'disponible'],
}

const matchHeader = (cell, key) => {
  const c = norm(cell)
  return HEADER_HINTS[key].some(h => c === h || c.startsWith(h + ' ') || c.includes(h))
}

// Finds the header row (banks put account details above the table) and
// guesses which column holds what. The user can correct every guess.
export function detectColumns(rows) {
  let headerIdx = -1
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const r = rows[i]
    const hasDate = r.some(c => matchHeader(c, 'date'))
    const hasMoney = r.some(c => matchHeader(c, 'amount') || matchHeader(c, 'debit') || matchHeader(c, 'credit'))
    if (hasDate && hasMoney) { headerIdx = i; break }
  }

  const header = headerIdx >= 0 ? rows[headerIdx] : []
  const body = rows.slice(headerIdx + 1).filter(r => r.some(c => String(c).trim()))
  const width = Math.max(0, ...rows.map(r => r.length))
  const find = (key, exclude = []) => {
    const idx = header.findIndex((c, i) => !exclude.includes(i) && matchHeader(c, key))
    return idx >= 0 ? idx : null
  }

  let date = find('date')
  let debit = find('debit')
  let credit = find('credit')
  const balance = find('balance')
  // Never take a date column ("F. Valor", "Fecha valor") as money.
  const dateCols = header.map((c, i) => (matchHeader(c, 'date') ? i : null)).filter(v => v != null)
  let amount = find('amount', [balance, ...dateCols].filter(v => v != null))
  let description = find('description')

  // Fall back to content sniffing when headers don't say.
  const sample = body.slice(0, 20)
  const ratio = (col, test) => sample.length ? sample.filter(r => test(r[col])).length / sample.length : 0
  if (date == null) {
    for (let c = 0; c < width; c++) if (ratio(c, v => parseDate(v)) > 0.7) { date = c; break }
  }
  if (amount == null && debit == null && credit == null) {
    for (let c = 0; c < width; c++) {
      if (c === date || c === balance) continue
      if (ratio(c, v => parseAmount(v) != null) > 0.7) { amount = c; break }
    }
  }
  if (description == null) {
    let bestLen = 0
    for (let c = 0; c < width; c++) {
      if ([date, amount, debit, credit, balance].includes(c)) continue
      const len = sample.reduce((s, r) => s + String(r[c] || '').length, 0)
      if (len > bestLen) { bestLen = len; description = c }
    }
  }
  if (amount != null) { debit = null; credit = null }

  return { headerIdx, date, description, amount, debit, credit }
}

// ── ROWS ──────────────────────────────────────────────────────
export function extractMovements(rows, mapping) {
  const { headerIdx, date, description, amount, debit, credit } = mapping
  const out = []
  rows.slice(headerIdx + 1).forEach((r, i) => {
    const d = parseDate(r[date])
    if (!d) return
    let value = null
    if (amount != null) value = parseAmount(r[amount])
    else {
      const out_ = parseAmount(r[debit]) || 0
      const in_ = parseAmount(r[credit]) || 0
      // Some banks put the debit as a positive number in its column.
      value = in_ - Math.abs(out_)
    }
    if (value == null || value === 0) return
    out.push({
      key: `r${i}`,
      date: d,
      description: String(r[description] ?? '').replace(/\s+/g, ' ').trim() || 'Movimiento importado',
      amount: Math.round(Math.abs(value) * 100) / 100,
      sign: value < 0 ? -1 : 1,
    })
  })
  return out
}

// ── SUGGESTIONS ───────────────────────────────────────────────
// Words that identify a merchant, minus the noise banks wrap around
// it ("COMPRA TARJ. 1234 MERCADONA MADRID ES").
const NOISE = new Set(['compra', 'tarj', 'tarjeta', 'pago', 'recibo', 'transferencia', 'transf', 'bizum', 'de',
  'del', 'la', 'el', 'en', 'con', 'sl', 'sa', 'slu', 'es', 'esp', 'eur', 'madrid', 'barcelona', 'www', 'com'])
export const keywords = (s) => norm(s).replace(/[^a-z0-9 ]/g, ' ').split(/\s+/)
  .filter(w => w.length > 2 && !NOISE.has(w) && !/^\d+$/.test(w))

// Learns from the user's own history: the category most often used for
// past movements sharing a merchant word with this one.
export function buildCategoryModel(transactions) {
  const byWord = {}
  transactions.forEach(t => {
    if (t.type !== 'expense' || !t.category_id) return
    new Set(keywords(t.description)).forEach(w => {
      const m = byWord[w] || (byWord[w] = {})
      m[t.category_id] = (m[t.category_id] || 0) + 1
    })
  })
  return byWord
}

export function suggestCategory(description, model) {
  const votes = {}
  keywords(description).forEach(w => {
    const m = model[w]
    if (!m) return
    Object.entries(m).forEach(([cat, n]) => { votes[cat] = (votes[cat] || 0) + n })
  })
  const best = Object.entries(votes).sort((a, b) => b[1] - a[1])[0]
  return best ? best[0] : null
}

export const looksLikeSalary = (description) => /\bn[oó]mina\b|\bsalario\b|\bpayroll\b/i.test(description)

// Same date, same amount and a shared merchant word (or identical
// text) as an existing movement: almost certainly already recorded.
export function findDuplicate(mov, transactions) {
  const words = new Set(keywords(mov.description))
  return transactions.find(t =>
    t.date === mov.date &&
    Math.abs(t.amount - mov.amount) < 0.005 &&
    (norm(t.description) === norm(mov.description) || keywords(t.description).some(w => words.has(w)))
  ) || null
}
