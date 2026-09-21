import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../App'
import { deleteTransaction } from '../lib/supabase'
import { fmt, fmtShort, getCurrentCycle, calcCycleStats, calcHouseProgress, catBudget, fixedPct, getPartnerContribution, calcPotBalance, toLocalISODate } from '../lib/finance'
import { checkBudgetAlerts } from '../lib/notifications'
import AddTransactionModal from '../components/AddTransactionModal'
import RecurringExpensesBanner from '../components/RecurringExpensesBanner'
import AnimatedNumber from '../components/AnimatedNumber'
import CyclePace from '../components/CyclePace'
import CycleRecap from '../components/CycleRecap'
import { pendingRecap, markRecapSeen } from '../lib/recap'
import ActivityRings from '../components/ActivityRings'
import EmptyState from '../components/EmptyState'
import TxRow from '../components/TxRow'

export default function Dashboard() {
  const { profile, categories, transactions, fixedExpenses, houseGoal, cycles, pctHistory, partnerSummary, refresh, removeTransactionLocally, loading } = useApp()
  const navigate = useNavigate()
  const [showAddModal, setShowAddModal] = useState(false)
  // One-time "how did the last cycle go" sheet after a new nómina.
  const [recap, setRecap] = useState(null)
  useEffect(() => {
    if (!loading) setRecap(pendingRecap(cycles))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, cycles.length])
  const closeRecap = () => { if (recap) markRecapSeen(recap.cycle); setRecap(null) }

  const salary = profile?.salary || 0
  const cycle = getCurrentCycle(cycles)
  const stats = calcCycleStats({ transactions, cycle, categories, salary, fixedExpenses })

  // What the pace dial measures against: everything budgeted to be
  // SPENT this cycle (saving categories are set aside, not spent).
  const spendableBudget = categories
    .filter(c => c.type !== 'saving')
    .reduce((sum, c) => sum + catBudget(c, salary), 0)

  // Three streams of the cycle for the activity rings.
  const sumBy = (type, fn) => categories.filter(c => c.type === type).reduce((sum, c) => sum + fn(c), 0)
  const cycleStartISO = cycle ? toLocalISODate(cycle.start) : null
  const rings = [
    { label: 'Día a día', color: '#ff2d55',
      value: sumBy('normal', c => stats.spendByCat[c.id] || 0), max: sumBy('normal', c => catBudget(c, salary)) },
    { label: 'Botes', color: '#ff9500',
      value: sumBy('pot', c => stats.spendByCat[c.id] || 0), max: sumBy('pot', c => catBudget(c, salary)) },
    { label: 'Fijos', color: '#32ade6',
      value: fixedExpenses
        .filter(f => cycleStartISO && f.last_charged_date && f.last_charged_date >= cycleStartISO)
        .reduce((sum, f) => sum + f.amount, 0),
      max: fixedExpenses.reduce((sum, f) => sum + f.amount, 0) },
  ]

  const mySavingPerCycle = salary * categories.filter(c => c.type === 'saving').reduce((s, c) => s + c.user_pct, 0) / 100
  // Mirror House.jsx's calculation exactly (via the shared
  // getPartnerContribution helper): when pair_mode is active, the
  // partner's monthly contribution must be included too, or this view
  // silently undercounts total monthly savings and shows a longer
  // time-to-goal than the actual combined rate -- the same
  // inconsistency this helper was introduced to prevent.
  const { savingPerCycle: partnerSavingPerCycle, saved: partnerSaved, isLive } =
    getPartnerContribution({ houseGoal, partnerSummary })
  const houseCalc = calcHouseProgress({ goal: houseGoal, mySavingPerCycle, partnerSavingPerCycle, partnerSaved: isLive ? partnerSaved : null })

  // Previous cycle comparison
  const prevCycle = cycles.length >= 2 ? cycles[cycles.length - 2] : null
  const prevStats = prevCycle ? calcCycleStats({ transactions, cycle: prevCycle, categories, salary, fixedExpenses }) : null
  const expenseDelta = prevStats ? stats.netExpenses - prevStats.netExpenses : null
  const expenseDeltaPct = prevStats && prevStats.netExpenses > 0 ? (expenseDelta / prevStats.netExpenses * 100) : null

  const recentTx = [...transactions]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 6)

  const reimburseMap = {}
  const txById = {}
  transactions.forEach(t => {
    txById[t.id] = t
    if (t.type === 'transfer' && t.linked_expense_id) {
      reimburseMap[t.linked_expense_id] = (reimburseMap[t.linked_expense_id] || 0) + t.amount
    }
  })

  useEffect(() => {
    if (!cycle || !salary) return
    checkBudgetAlerts({
      categories,
      spendByCat: stats.spendByCat,
      catBudgetFn: catBudget,
      salary,
      cycleStartISO: toLocalISODate(cycle.start)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycle?.start, stats.expenses])

  const handleDelete = async (id) => {
    if (!window.confirm('¿Eliminar este movimiento?')) return
    // Optimistic: the row goes immediately; put it back if the server
    // refuses.
    const restore = removeTransactionLocally(id)
    try {
      await deleteTransaction(id)
    } catch (err) {
      restore()
      alert('No se pudo eliminar: ' + err.message)
    }
    refresh()
  }

  const alerts = []
  categories.forEach(c => {
    if (c.type === 'saving') return
    const budget = catBudget(c, salary)
    const spent = stats.spendByCat[c.id] || 0
    if (spent > budget && budget > 0) {
      alerts.push(
        <div key={c.id} className="alert alert-danger">
          <i className="fa fa-triangle-exclamation" />
          Pasada del presupuesto en <strong>{c.name}</strong>: {fmt(spent)} de {fmt(budget)}.
        </div>
      )
    }
  })
  if (!salary) {
    alerts.push(
      <div key="no-salary" className="alert alert-warning">
        <i className="fa fa-triangle-exclamation" />
        Configura tu sueldo en <strong>Ajustes</strong>.
      </div>
    )
  }
  const fxPct = fixedPct(fixedExpenses, salary)
  if (fxPct > 40) alerts.push(
    <div key="fixed-high" className="alert alert-danger">
      <i className="fa fa-triangle-exclamation" /> Gastos fijos: {fxPct.toFixed(1)}% del sueldo. Margen muy ajustado.
    </div>
  )
  else if (fxPct > 28) alerts.push(
    <div key="fixed-mid" className="alert alert-warning">
      <i className="fa fa-triangle-exclamation" /> Gastos fijos: {fxPct.toFixed(1)}% del sueldo. Vigila el margen.
    </div>
  )

  return (
    <div>
      <div className="page-header">
        <div className="flex items-center justify-between" style={{ flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h2>{cycle ? 'Ciclo actual' : 'Sin nómina registrada'}</h2>
            <p>
              {cycle
                ? `Del ${cycle.start.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })} al ${cycle.end.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}`
                : 'Basado en tu última nómina'}
            </p>
          </div>
          <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
            <i className="fa fa-plus" /> Añadir movimiento
          </button>
        </div>
      </div>

      {cycle ? (
        <div className="alert alert-info mb-3" style={{ display: 'inline-flex' }}>
          <i className="fa fa-rotate" /> Nómina del {cycle.start.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })} · {fmtShort(cycle.salary)}
          {cycle.userName && <span style={{ marginLeft: 6, opacity: .7 }}>({cycle.userName})</span>}
        </div>
      ) : (
        <div className="alert alert-info mb-3" style={{ alignItems: 'flex-start' }}>
          <i className="fa fa-circle-info" style={{ marginTop: 2 }} />
          <div>
            Añade tu primera nómina pulsando <strong>"Añadir movimiento" → Ingreso → Sueldo mensual</strong>.
            Desde ese momento empezarán a contar los ciclos y los botes de ahorro.
          </div>
        </div>
      )}

      <RecurringExpensesBanner />

      <div className="card mb-4">
        <div className="hero-split">
          <CyclePace cycle={cycle} spent={stats.netExpenses} budget={spendableBudget} />
          <ActivityRings rings={rings} />
        </div>
      </div>

      <div className="grid-4 mb-4">
        <div className="stat-card green">
          <div className="label"><i className="fa fa-arrow-down" style={{ color: 'var(--e5)' }} /> Ingresos</div>
          <div className="value text-green"><AnimatedNumber value={stats.income} format={fmt} /></div>
          <div className="sub">Este ciclo</div>
        </div>
        <div className="stat-card red">
          <div className="label"><i className="fa fa-arrow-up" style={{ color: 'var(--r5)' }} /> Gastos</div>
          <div className="value text-red"><AnimatedNumber value={stats.netExpenses} format={fmt} /></div>
          <div className="sub">
            Este ciclo{stats.reimbursements > 0 && <span style={{ marginLeft: 4, color: 'var(--e5)' }}>(-{fmt(stats.reimbursements)} devuelto)</span>}
            {expenseDeltaPct !== null && (
              <span style={{ marginLeft: 6, color: expenseDelta > 0 ? 'var(--r5)' : 'var(--e5)', fontWeight: 600 }}>
                {expenseDelta > 0 ? '↑' : '↓'} {Math.abs(expenseDeltaPct).toFixed(0)}% vs ciclo anterior
              </span>
            )}
          </div>
        </div>
        <div className="stat-card indigo">
          <div className="label"><i className="fa fa-scale-balanced" style={{ color: 'var(--i5)' }} /> Balance</div>
          <div className="value" style={{ color: stats.balance >= 0 ? 'var(--e5)' : 'var(--r5)' }}><AnimatedNumber value={stats.balance} format={fmt} /></div>
          <div className="sub">Ingreso − Gasto</div>
        </div>
        <div className="stat-card amber">
          <div className="label"><i className="fa fa-wallet" style={{ color: 'var(--a5)' }} /> Disponible</div>
          <div className="value text-amber"><AnimatedNumber value={stats.available} format={fmt} /></div>
          <div className="sub">Tras fijos ({fmtShort(stats.fxTotal)}) y ahorro ({fmtShort(stats.savingAmt)})</div>
        </div>
      </div>

      <div className="grid-2 mb-4">
        <div className="card">
          <div className="section-header">
            <h3>Presupuesto del ciclo</h3>
            <button className="btn btn-sm btn-outline" onClick={() => navigate('/budget')}>Ver detalle</button>
          </div>
          {categories.filter(c => c.type !== 'saving').map(c => {
            const budget = catBudget(c, salary)
            const isPot = c.type === 'pot'
            const spent = stats.spendByCat[c.id] || 0
            const potBal = isPot ? calcPotBalance({ category: c, salary, cycles, transactions, pctHistory }) : null
            const potNeg = isPot && potBal < 0
            // For pots: bar total = potBal + spent = capacity at start of this cycle
            // (potBal already deducted spent, so adding it back gives the pre-cycle total).
            // This makes paga-extra deposits raise the bar ceiling, keeping it green.
            const barTotal = isPot && potBal !== null ? Math.max(0, potBal + spent) : budget
            const pct = barTotal > 0 ? Math.min(100, spent / barTotal * 100) : (potNeg ? 100 : 0)
            const over = isPot ? potNeg : (spent > budget && budget > 0)
            return (
              <div key={c.id} className="flex items-center gap-2" style={{ padding: '9px 0', borderBottom: '.5px solid var(--sep)' }}>
                <div style={{ width: 33, height: 33, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, background: c.color + '22', color: c.color, flexShrink: 0 }}>{c.icon}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 500 }}>{c.name}</div>
                  <div className="progress-bar"><div className="progress-fill" style={{ width: pct + '%', background: over ? 'var(--r5)' : c.color }} /></div>
                  {isPot ? (
                    <div style={{ fontSize: 11, color: potNeg ? 'var(--r5)' : 'var(--muted)' }}>
                      {potNeg ? '⚠️ ' : '🪣 '}{fmt(spent)} gastado · {potNeg ? fmt(Math.abs(potBal)) + ' deuda' : fmt(potBal) + ' disponible'}
                    </div>
                  ) : (
                    <div style={{ fontSize: 11, color: over ? 'var(--r5)' : 'var(--muted)' }}>{over ? '⚠️ ' : ''}{fmt(spent)} / {fmt(budget)}</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <div className="card">
          <div className="section-header">
            <h3>Últimos movimientos</h3>
            <button className="btn btn-sm btn-outline" onClick={() => navigate('/transactions')}>Ver todos</button>
          </div>
          {recentTx.length === 0 ? (
            <EmptyState art="receipt" title="Aún no hay movimientos" text="Añade tu primer gasto o tu nómina y empezará a llenarse." />
          ) : recentTx.map(t => <TxRow key={t.id} tx={t} onDelete={() => handleDelete(t.id)} showUser reimburseMap={reimburseMap} txById={txById} />)}
        </div>
      </div>

      <div className="house-card mb-4" onClick={() => navigate('/house')} style={{ cursor: 'pointer' }}>
        <h3>🏠 Meta: Mi Primera Casa</h3>
        <div className="flex items-center gap-3 mt-2" style={{ flexWrap: 'wrap' }}>
          <div>
            <div className="house-goal-amount"><AnimatedNumber value={houseCalc.totalSaved || 0} format={fmtShort} /></div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.52)' }}>de {fmtShort(houseCalc.entryTarget || 0)} para la entrada</div>
          </div>
          <div style={{ flex: 1, minWidth: 120 }}>
            <div className="house-progress-bar"><div className="house-progress-fill" style={{ width: (houseCalc.pct || 0) + '%' }} /></div>
            <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.4)', marginTop: 3 }}>
              {houseCalc.yearsLeft != null
                ? `≈${houseCalc.yearsLeft > 0 ? houseCalc.yearsLeft + 'a ' : ''}${houseCalc.mos > 0 ? houseCalc.mos + 'm' : ''}`
                : (houseCalc.entryTarget > 0 && houseCalc.totalSaved >= houseCalc.entryTarget ? '🎉 Objetivo alcanzado' : 'Configura el objetivo')}
            </div>
          </div>
        </div>
      </div>

      {alerts}

      {showAddModal && <AddTransactionModal onClose={() => setShowAddModal(false)} />}
      {recap && !showAddModal && <CycleRecap cycle={recap.cycle} prevCycle={recap.prevCycle} onClose={closeRecap} celebrate />}
    </div>
  )
}

