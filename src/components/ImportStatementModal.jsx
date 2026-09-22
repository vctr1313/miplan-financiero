import React, { useMemo, useRef, useState } from 'react'
import { useApp } from '../App'
import { addTransactionsBulk } from '../lib/supabase'
import { fmt } from '../lib/finance'
import { readXlsx } from '../lib/xlsx'
import {
  parseCsv, detectColumns, extractMovements, buildCategoryModel,
  suggestCategory, findDuplicate, looksLikeSalary,
} from '../lib/bankImport'

// Bank statement import: file -> column check -> row-by-row review ->
// one bulk insert. Nothing is written until the last step, and every
// guess (columns, type, category, duplicates) is shown and editable.

// Spanish banks still export CSV in Windows-1252 as often as UTF-8; the
// wrong guess turns every "ñ"/"é" into garbage. Try strict UTF-8 first.
const decodeText = (buf) => {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf) }
  catch { return new TextDecoder('windows-1252').decode(buf) }
}

const colLabel = (rows, headerIdx, i) => {
  const head = headerIdx >= 0 ? String(rows[headerIdx]?.[i] ?? '').trim() : ''
  return `${String.fromCharCode(65 + i)}${head ? ` · ${head}` : ''}`
}

export default function ImportStatementModal({ onClose }) {
  const { categories, transactions, refresh } = useApp()
  const [step, setStep] = useState('file')
  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState([])
  const [mapping, setMapping] = useState(null)
  const [items, setItems] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [result, setResult] = useState(null)
  const inputRef = useRef(null)

  const expenseCats = categories.filter(c => c.type !== 'saving')
  const model = useMemo(() => buildCategoryModel(transactions), [transactions])

  const loadFile = async (file) => {
    if (!file) return
    setError('')
    setBusy(true)
    try {
      const buf = await file.arrayBuffer()
      const parsed = /\.xlsx$/i.test(file.name) ? await readXlsx(buf) : parseCsv(decodeText(buf))
      const m = detectColumns(parsed)
      if (!parsed.length) throw new Error('El archivo está vacío')
      setFileName(file.name)
      setRows(parsed)
      setMapping(m)
      setStep('columns')
    } catch (err) {
      setError(err.message || 'No se pudo leer el archivo')
    } finally {
      setBusy(false)
    }
  }

  const width = Math.max(0, ...rows.map(r => r.length))
  const colOptions = Array.from({ length: width }, (_, i) => i)
  const preview = mapping ? extractMovements(rows, mapping) : []
  // Two layouts banks use: one signed amount column, or separate
  // debit/credit columns.
  const splitMoney = !!mapping && mapping.amount == null && (mapping._split || mapping.debit != null || mapping.credit != null)
  const mappingReady = mapping && mapping.date != null && mapping.description != null &&
    (splitMoney ? (mapping.debit != null || mapping.credit != null) : mapping.amount != null)

  const toReview = () => {
    const movs = extractMovements(rows, mapping)
    if (!movs.length) { setError('No he encontrado movimientos con esas columnas'); return }
    setError('')
    setItems(movs.map(m => {
      const dup = findDuplicate(m, transactions)
      const isIncome = m.sign > 0
      return {
        ...m,
        include: !dup,
        duplicate: dup,
        kind: isIncome ? (looksLikeSalary(m.description) ? 'salary' : 'income') : 'expense',
        categoryId: isIncome ? '' : (suggestCategory(m.description, model) || ''),
        suggested: !isIncome && !!suggestCategory(m.description, model),
      }
    }))
    setStep('review')
  }

  const update = (key, patch) => setItems(list => list.map(i => (i.key === key ? { ...i, ...patch } : i)))
  const chosen = items.filter(i => i.include)
  const missingCategory = chosen.filter(i => i.kind === 'expense' && !i.categoryId).length
  const totalOut = chosen.filter(i => i.kind === 'expense').reduce((s, i) => s + i.amount, 0)
  const totalIn = chosen.filter(i => i.kind !== 'expense').reduce((s, i) => s + i.amount, 0)

  const doImport = async () => {
    if (!chosen.length || missingCategory) return
    setBusy(true)
    setError('')
    try {
      await addTransactionsBulk(chosen.map(i => ({
        type: i.kind === 'expense' ? 'expense' : 'income',
        amount: i.amount,
        date: i.date,
        description: i.description.slice(0, 200),
        category_id: i.kind === 'expense' ? i.categoryId : null,
        is_salary: i.kind === 'salary',
        notes: `Importado de ${fileName}`,
      })))
      await refresh()
      setResult({ count: chosen.length })
      setStep('done')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && !busy && onClose()}>
      <div className="modal import" style={{ maxWidth: step === 'review' ? 760 : 560 }}>
        <div className="import-steps" aria-hidden="true">
          {['file', 'columns', 'review'].map((s, i) => (
            <span key={s} className={step === s ? 'on' : ['columns', 'review', 'done'].indexOf(step) >= i ? 'past' : ''} />
          ))}
        </div>
        <h3 className="modal-title">Importar extracto del banco</h3>

        {step === 'file' && (
          <>
            <button
              type="button"
              className={`dropzone ${dragOver ? 'over' : ''}`}
              onClick={() => inputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); loadFile(e.dataTransfer.files?.[0]) }}
              disabled={busy}
            >
              <i className={`fa ${busy ? 'fa-spinner fa-spin' : 'fa-file-arrow-up'}`} />
              <strong>{busy ? 'Leyendo…' : 'Elige o arrastra el archivo'}</strong>
              <span>CSV o Excel (.xlsx) descargado de tu banco</span>
            </button>
            <input ref={inputRef} type="file" accept=".csv,.xlsx,.txt,text/csv" hidden onChange={e => loadFile(e.target.files?.[0])} />
            <p className="form-hint" style={{ marginTop: 12 }}>
              En la web o app de tu banco suele estar en Cuentas → Movimientos → Descargar / Exportar.
              Nada se guarda hasta que revises los movimientos en el último paso.
            </p>
          </>
        )}

        {step === 'columns' && mapping && (
          <>
            <p className="text-sm text-muted mb-3">
              <i className="fa fa-file-lines" /> {fileName} · he detectado estas columnas; corrígelas si alguna no es.
            </p>
            <div className="tabs" style={{ marginBottom: 12 }}>
              <button type="button" className={`tab ${!splitMoney ? 'active' : ''}`}
                onClick={() => setMapping(m => ({ ...m, debit: null, credit: null, _split: false }))}>
                Una columna de importe
              </button>
              <button type="button" className={`tab ${splitMoney ? 'active' : ''}`}
                onClick={() => setMapping(m => ({ ...m, amount: null, debit: m.debit ?? null, credit: m.credit ?? null, _split: true }))}>
                Cargo y abono separados
              </button>
            </div>
            <div className="form-row">
              {[
                ['date', 'Fecha'],
                ['description', 'Concepto'],
                ...(!splitMoney
                  ? [['amount', 'Importe (+/−)']]
                  : [['debit', 'Cargo (gasto)'], ['credit', 'Abono (ingreso)']]),
              ].map(([field, label]) => (
                <div className="form-group" key={field}>
                  <label>{label}</label>
                  <select
                    className="form-control"
                    value={mapping[field] ?? ''}
                    onChange={e => setMapping(m => ({ ...m, [field]: e.target.value === '' ? null : Number(e.target.value) }))}
                  >
                    <option value="">—</option>
                    {colOptions.map(i => <option key={i} value={i}>{colLabel(rows, mapping.headerIdx, i)}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <div className="import-preview">
              <div className="import-preview-head">Vista previa · {preview.length} movimientos</div>
              {preview.slice(0, 5).map(m => (
                <div key={m.key} className="import-preview-row">
                  <span>{m.date.split('-').reverse().join('/')}</span>
                  <span className="grow">{m.description}</span>
                  <strong style={{ color: m.sign < 0 ? 'var(--text)' : 'var(--e6)' }}>{m.sign < 0 ? '-' : '+'}{fmt(m.amount)}</strong>
                </div>
              ))}
              {!preview.length && <div className="text-sm text-muted" style={{ padding: 12 }}>Con estas columnas no salen movimientos.</div>}
            </div>
          </>
        )}

        {step === 'review' && (
          <>
            <div className="import-summary">
              <span><strong>{chosen.length}</strong> de {items.length} seleccionados</span>
              <span>Gastos <strong>{fmt(totalOut)}</strong></span>
              <span>Ingresos <strong style={{ color: 'var(--e6)' }}>{fmt(totalIn)}</strong></span>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setItems(l => l.map(i => ({ ...i, include: !chosen.length })))}>
                {chosen.length ? 'Ninguno' : 'Todos'}
              </button>
            </div>
            <div className="import-list">
              {items.map(i => (
                <div key={i.key} className={`import-row ${i.include ? '' : 'off'}`}>
                  <input type="checkbox" checked={i.include} onChange={e => update(i.key, { include: e.target.checked })} aria-label="Incluir" />
                  <div className="import-main">
                    <div className="import-desc" title={i.description}>{i.description}</div>
                    <div className="import-meta">
                      {i.date.split('-').reverse().join('/')}
                      {i.duplicate && <span className="import-tag dup"><i className="fa fa-clone" /> Ya lo tienes</span>}
                      {i.suggested && i.kind === 'expense' && <span className="import-tag"><i className="fa fa-wand-magic-sparkles" /> Sugerida</span>}
                    </div>
                  </div>
                  <select className="form-control import-kind" value={i.kind} onChange={e => update(i.key, { kind: e.target.value })} aria-label="Tipo">
                    <option value="expense">Gasto</option>
                    <option value="income">Ingreso</option>
                    <option value="salary">Nómina</option>
                  </select>
                  {i.kind === 'expense' ? (
                    <select
                      className={`form-control import-cat ${i.include && !i.categoryId ? 'missing' : ''}`}
                      value={i.categoryId}
                      onChange={e => update(i.key, { categoryId: e.target.value, suggested: false })}
                      aria-label="Categoría"
                    >
                      <option value="">Categoría…</option>
                      {expenseCats.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                    </select>
                  ) : <span className="import-cat placeholder">{i.kind === 'salary' ? 'Abre un ciclo nuevo' : '—'}</span>}
                  <strong className="import-amount" style={{ color: i.kind === 'expense' ? 'var(--text)' : 'var(--e6)' }}>
                    {i.kind === 'expense' ? '-' : '+'}{fmt(i.amount)}
                  </strong>
                </div>
              ))}
            </div>
            {missingCategory > 0 && (
              <div className="alert alert-warning mt-2" style={{ marginBottom: 0 }}>
                <i className="fa fa-triangle-exclamation" />
                <div>Falta la categoría en {missingCategory} gasto{missingCategory !== 1 ? 's' : ''}.</div>
              </div>
            )}
          </>
        )}

        {step === 'done' && result && (
          <div className="import-done">
            <div className="import-done-check"><i className="fa fa-check" /></div>
            <h4>{result.count} movimiento{result.count !== 1 ? 's' : ''} importado{result.count !== 1 ? 's' : ''}</h4>
            <p className="text-sm text-muted">Ya cuentan en tus presupuestos, botes y reportes.</p>
          </div>
        )}

        {error && <div className="alert alert-danger mt-2" style={{ marginBottom: 0 }}>{error}</div>}

        <div className="modal-footer">
          {step === 'done' ? (
            <button className="btn btn-primary" onClick={onClose}>Hecho</button>
          ) : (
            <>
              <button className="btn btn-ghost" onClick={() => (step === 'file' ? onClose() : setStep(step === 'review' ? 'columns' : 'file'))} disabled={busy}>
                {step === 'file' ? 'Cancelar' : 'Atrás'}
              </button>
              {step === 'columns' && (
                <button className="btn btn-primary" onClick={toReview} disabled={!mappingReady || !preview.length}>
                  Revisar movimientos <i className="fa fa-arrow-right" />
                </button>
              )}
              {step === 'review' && (
                <button className={`btn btn-primary ${busy ? 'is-busy' : ''}`} onClick={doImport} disabled={busy || !chosen.length || missingCategory > 0}>
                  <i className="fa fa-file-import" /> {busy ? 'Importando…' : `Importar ${chosen.length}`}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
