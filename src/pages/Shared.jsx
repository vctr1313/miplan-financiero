import React, { useState } from 'react'
import { useApp } from '../App'
import { settleSharedBalance, addTransaction } from '../lib/supabase'
import { fmt, toLocalISODate } from '../lib/finance'
import { sharedBalance, balanceHeadline } from '../lib/shared'
import AnimatedNumber from '../components/AnimatedNumber'
import EmptyState from '../components/EmptyState'
import AddTransactionModal from '../components/AddTransactionModal'
import { burstConfetti } from '../lib/confetti'

const dateFmt = { day: 'numeric', month: 'short' }

export default function Shared() {
  const { profile, partnerSummary, shared, categories, refresh } = useApp()
  const me = profile?.id
  const partnerName = partnerSummary?.partner_name || 'tu pareja'
  const { open, owedToMe, owedByMe, net } = sharedBalance(shared.expenses, me)
  const [showSettle, setShowSettle] = useState(false)
  const [showAdd, setShowAdd] = useState(false)

  if (!profile?.partner_id) {
    return (
      <div>
        <div className="page-header"><h2>Compartidos</h2><p>Gastos que pagáis entre los dos</p></div>
        <div className="card">
          <EmptyState art="target" title="Vincula a tu pareja primero"
            text="Desde Ajustes → Pareja vinculada. Después podréis marcar gastos como compartidos y ver quién debe a quién." />
        </div>
      </div>
    )
  }

  const tone = Math.abs(net) < 0.005 ? 'even' : net > 0 ? 'owed' : 'owe'

  return (
    <div>
      <div className="page-header">
        <div className="flex items-center justify-between" style={{ flexWrap: 'wrap', gap: 10 }}>
          <div><h2>Compartidos</h2><p>Lo que pagáis entre {partnerName} y tú</p></div>
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
            <i className="fa fa-plus" /> Gasto compartido
          </button>
        </div>
      </div>

      <div className={`card mb-4 balance-hero ${tone}`}>
        <div className="balance-kicker">{balanceHeadline(net, partnerName)}</div>
        <div className="balance-amount">
          {tone === 'even' ? '0 €' : <AnimatedNumber value={Math.abs(net)} format={fmt} />}
        </div>
        <div className="balance-parts">
          <span>Te deben <strong>{fmt(owedToMe)}</strong></span>
          <span>Debes <strong>{fmt(owedByMe)}</strong></span>
          <span>{open.length} gasto{open.length !== 1 ? 's' : ''} sin saldar</span>
        </div>
        {open.length > 0 && (
          <button className="btn btn-primary mt-3" onClick={() => setShowSettle(true)}>
            <i className="fa fa-handshake" /> Saldar cuentas
          </button>
        )}
      </div>

      <div className="card mb-4">
        <div className="section-header"><h3>Pendientes</h3></div>
        {open.length === 0 ? (
          <EmptyState art="receipt" title="Nada pendiente"
            text={`Al añadir un gasto, activa "Compartido con ${partnerName}" y aparecerá aquí.`} />
        ) : open.map(s => {
          const mine = s.payer_id === me
          return (
            <div key={s.id} className="shared-row">
              <span className={`shared-who ${mine ? 'me' : 'them'}`}>{mine ? 'Tú' : partnerName.charAt(0).toUpperCase()}</span>
              <div className="shared-info">
                <div className="shared-desc">{s.description}</div>
                <div className="shared-meta">
                  {new Date(s.date).toLocaleDateString('es-ES', dateFmt)} · pagó {mine ? 'tú' : partnerName} {fmt(s.total)}
                </div>
              </div>
              <div className={`shared-amt ${mine ? 'pos' : 'neg'}`}>
                {mine ? '+' : '−'}{fmt(s.debtor_share)}
              </div>
            </div>
          )
        })}
      </div>

      {shared.settlements.length > 0 && (
        <div className="card">
          <div className="section-header"><h3>Saldados</h3></div>
          {shared.settlements.map(st => (
            <div key={st.id} className="shared-row settled">
              <span className="shared-who done"><i className="fa fa-check" /></span>
              <div className="shared-info">
                <div className="shared-desc">
                  {st.amount > 0
                    ? `${st.from_id === me ? 'Pagaste' : `${partnerName} te pagó`} ${fmt(st.amount)}`
                    : 'Cuentas cuadradas sin pagos'}
                </div>
                <div className="shared-meta">
                  {new Date(st.created_at).toLocaleDateString('es-ES', { ...dateFmt, year: 'numeric' })} · {st.items} gasto{st.items !== 1 ? 's' : ''}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showSettle && (
        <SettleModal
          net={net} partnerName={partnerName} categories={categories}
          onClose={() => setShowSettle(false)}
          onDone={async () => { setShowSettle(false); await refresh(); burstConfetti({ count: 70 }) }}
        />
      )}
      {showAdd && <AddTransactionModal onClose={() => setShowAdd(false)} startShared />}
    </div>
  )
}

function SettleModal({ net, partnerName, categories, onClose, onDone }) {
  const iPay = net < -0.005
  const amount = Math.abs(net)
  const expenseCats = categories.filter(c => c.type !== 'saving')
  // When I'm the one paying, what I hand over IS my spending on those
  // shared things -- offer to record it so my budget reflects it.
  const [record, setRecord] = useState(iPay)
  const [categoryId, setCategoryId] = useState(expenseCats[0]?.id || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const confirm = async () => {
    setBusy(true)
    setError('')
    try {
      await settleSharedBalance()
      if (iPay && record && amount > 0) {
        await addTransaction({
          type: 'expense', amount: Math.round(amount * 100) / 100, date: toLocalISODate(new Date()),
          description: `Liquidación gastos compartidos con ${partnerName}`,
          category_id: categoryId, notes: 'Gasto compartido', is_salary: false,
        })
      }
      await onDone()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && !busy && onClose()}>
      <div className="modal" style={{ maxWidth: 440 }}>
        <h3 className="modal-title">Saldar cuentas</h3>
        <div className="settle-summary">
          {amount < 0.005
            ? <>Vuestros gastos se compensan: <strong>nadie debe nada</strong>.</>
            : iPay
              ? <>Pagas a {partnerName} <strong>{fmt(amount)}</strong></>
              : <>{partnerName} te paga <strong>{fmt(amount)}</strong></>}
        </div>
        <p className="text-sm text-muted mb-3">
          Todos los gastos compartidos pendientes quedarán como saldados para los dos. Haced el pago (Bizum, efectivo…) por vuestra cuenta.
        </p>
        {iPay && amount > 0 && (
          <div className="share-box on" style={{ marginBottom: 12 }}>
            <label className="flex items-center gap-2" style={{ fontSize: 13.5, cursor: 'pointer', padding: '10px 12px' }}>
              <input type="checkbox" checked={record} onChange={e => setRecord(e.target.checked)} />
              Registrar lo que pago como gasto mío
            </label>
            {record && (
              <div style={{ padding: '0 12px 12px' }}>
                <select className="form-control" value={categoryId} onChange={e => setCategoryId(e.target.value)} aria-label="Categoría">
                  {expenseCats.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                </select>
              </div>
            )}
          </div>
        )}
        {error && <div className="alert alert-danger">{error}</div>}
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancelar</button>
          <button className={`btn btn-primary ${busy ? 'is-busy' : ''}`} onClick={confirm} disabled={busy || (record && iPay && !categoryId)}>
            <i className="fa fa-handshake" /> {busy ? 'Saldando…' : 'Saldar'}
          </button>
        </div>
      </div>
    </div>
  )
}
