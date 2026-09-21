import React, { useState, useMemo } from 'react'
import { parseISO, isAfter, isBefore } from 'date-fns'
import { useApp } from '../App'
import Donut from '../components/Donut'
import EmptyState from '../components/EmptyState'
import SpendingHeatmap from '../components/SpendingHeatmap'
import { fmt, fmtShort, catBudget, calcSavingsRate, cap, toLocalISODate } from '../lib/finance'
import { Chart as ChartJS, BarElement, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend, Filler } from 'chart.js'
import { Bar, Line } from 'react-chartjs-2'
ChartJS.register(BarElement, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend, Filler)

const MONTH_FMT = { day: 'numeric', month: 'short' }

// A reporting period: one salary cycle or one calendar month.
// Everything in this page is computed per period, so the same charts
// can follow the app's own cycles (the default -- it's how budgets and
// pots work) or plain months. By calendar month, a month that happens
// to contain two nóminas (the 1st and the 30th) showed double income.
function buildPeriods({ mode, cycles, cycleIdx, curM, curY }) {
  if (mode === 'cycle') {
    const from = Math.max(0, cycleIdx - 5)
    return cycles.slice(from, cycleIdx + 1).map(cy => {
      const end = new Date(cy.end)
      end.setHours(23, 59, 59, 999)
      return {
        key: `c${cy.index}`,
        start: cy.start, end,
        short: cy.start.toLocaleDateString('es-ES', MONTH_FMT),
        label: `${cy.start.toLocaleDateString('es-ES', MONTH_FMT)} – ${cy.end.toLocaleDateString('es-ES', MONTH_FMT)}`,
        open: cy.index === cycles.length - 1,
      }
    })
  }
  const out = []
  for (let i = 5; i >= 0; i--) {
    let m = curM - i, y = curY
    if (m < 0) { m += 12; y-- }
    out.push({
      key: `m${y}-${m}`,
      start: new Date(y, m, 1),
      end: new Date(y, m + 1, 0, 23, 59, 59, 999),
      short: new Date(y, m, 1).toLocaleString('es-ES', { month: 'short' }),
      label: cap(new Date(y, m, 1).toLocaleString('es-ES', { month: 'long', year: 'numeric' })),
    })
  }
  return out
}

const inPeriod = (t, p) => {
  const d = parseISO(t.date)
  return !isBefore(d, p.start) && !isAfter(d, p.end)
}

export default function Reports() {
  const { profile, categories, transactions, pctHistory, cycles } = useApp()
  const [tab, setTab] = useState('monthly')
  const [mode, setMode] = useState(() => (cycles.length ? 'cycle' : 'month'))
  const [curM, setCurM] = useState(new Date().getMonth())
  const [curY, setCurY] = useState(new Date().getFullYear())
  const [cycleIdx, setCycleIdx] = useState(Math.max(0, cycles.length - 1))
  const salary = profile?.salary || 0
  const unit = mode === 'cycle' ? 'ciclo' : 'mes'
  const unitPlural = mode === 'cycle' ? 'ciclos' : 'meses'

  const periods = useMemo(
    () => buildPeriods({ mode, cycles, cycleIdx, curM, curY }),
    [mode, cycles, cycleIdx, curM, curY]
  )
  const current = periods[periods.length - 1]

  const periodData = useMemo(() => periods.map(p => {
    const txs = transactions.filter(t => inPeriod(t, p))
    // Only REAL income recorded in the period -- no synthetic salary.
    const income = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
    const expenses = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
    return { income, expenses, balance: income - expenses }
  }), [periods, transactions])

  const n = Math.max(1, periodData.length)
  const totalIncome = periodData.reduce((s, d) => s + d.income, 0)
  const totalExpenses = periodData.reduce((s, d) => s + d.expenses, 0)
  const last = periodData[periodData.length - 1]
  const savingsRate = last ? calcSavingsRate(last.income, last.expenses) : 0

  const now = new Date()
  const canPrev = mode === 'cycle' ? cycleIdx > 0 : true
  const canNext = mode === 'cycle'
    ? cycleIdx < cycles.length - 1
    : !(curY === now.getFullYear() && curM === now.getMonth())
  const prev = () => {
    if (mode === 'cycle') setCycleIdx(i => Math.max(0, i - 1))
    else if (curM === 0) { setCurM(11); setCurY(y => y - 1) } else setCurM(curM - 1)
  }
  const next = () => {
    if (mode === 'cycle') setCycleIdx(i => Math.min(cycles.length - 1, i + 1))
    else if (curM === 11) { setCurM(0); setCurY(y => y + 1) } else setCurM(curM + 1)
  }

  const exportArgs = { periods, periodData, current, unit, categories, salary, transactions, pctHistory }

  return (
    <div>
      <div className="page-header">
        <div className="flex items-center justify-between" style={{ flexWrap: 'wrap', gap: 10 }}>
          <div><h2>Reportes</h2><p>Datos reales por {mode === 'cycle' ? 'ciclo de nómina' : 'mes natural'}, sin proyecciones</p></div>
          <div className="flex gap-2">
            <button className="btn btn-success" onClick={() => current && exportPDF(exportArgs)} disabled={!current}>
              <i className="fa fa-file-pdf" /> PDF
            </button>
            <button className="btn btn-ghost" onClick={() => current && exportCSV(exportArgs)} disabled={!current}>
              <i className="fa fa-file-excel" /> Excel
            </button>
          </div>
        </div>
      </div>

      {tab !== 'annual' && (
        <div className="period-bar mb-3">
          <div className="tabs period-mode" style={{ marginBottom: 0 }}>
            <button className={`tab ${mode === 'cycle' ? 'active' : ''}`} onClick={() => setMode('cycle')} disabled={!cycles.length}>Por ciclo</button>
            <button className={`tab ${mode === 'month' ? 'active' : ''}`} onClick={() => setMode('month')}>Por mes</button>
          </div>
          {current && (
            <div className="period-nav">
              <button className="btn btn-ghost btn-icon" onClick={prev} disabled={!canPrev} aria-label="Anterior"><i className="fa fa-chevron-left" /></button>
              <span>{current.label}{current.open ? ' · en curso' : ''}</span>
              <button className="btn btn-ghost btn-icon" onClick={next} disabled={!canNext} aria-label="Siguiente"><i className="fa fa-chevron-right" /></button>
            </div>
          )}
        </div>
      )}

      <div className="grid-4 mb-4">
        <div className="stat-card green">
          <div className="label">Ahorro medio / {unit}</div>
          <div className="value text-green" style={{ fontSize: 19 }}>{fmt((totalIncome - totalExpenses) / n)}</div>
          <div className="sub">Últimos {periodData.length} {unitPlural}</div>
        </div>
        <div className="stat-card indigo">
          <div className="label">Tasa de ahorro (último {unit})</div>
          <div className="value text-indigo" style={{ fontSize: 19 }}>{savingsRate.toFixed(1)}%</div>
          <div className="sub">{savingsRate >= 20 ? 'Bien (≥20%)' : savingsRate >= 10 ? 'Mejorable' : 'Baja (<10%)'}</div>
        </div>
        <div className="stat-card amber">
          <div className="label">Gasto medio / {unit}</div>
          <div className="value text-amber" style={{ fontSize: 19 }}>{fmt(totalExpenses / n)}</div>
          <div className="sub">Últimos {periodData.length} {unitPlural}</div>
        </div>
        <div className="stat-card red">
          <div className="label">Ingresos totales</div>
          <div className="value" style={{ fontSize: 19 }}>{fmt(totalIncome)}</div>
          <div className="sub">Suma de movimientos reales</div>
        </div>
      </div>

      <div className="tabs">
        <button className={`tab ${tab === 'monthly' ? 'active' : ''}`} onClick={() => setTab('monthly')}><i className="fa fa-calendar-days" /> Evolución</button>
        <button className={`tab ${tab === 'categories' ? 'active' : ''}`} onClick={() => setTab('categories')}><i className="fa fa-tags" /> Categorías</button>
        <button className={`tab ${tab === 'savings' ? 'active' : ''}`} onClick={() => setTab('savings')}><i className="fa fa-piggy-bank" /> Ahorro</button>
        <button className={`tab ${tab === 'annual' ? 'active' : ''}`} onClick={() => setTab('annual')}><i className="fa fa-calendar" /> Anual</button>
      </div>

      {tab === 'monthly' && <MonthlyTab periods={periods} periodData={periodData} unit={unit} />}
      {tab === 'categories' && current && <CategoriesTab categories={categories} transactions={transactions} salary={salary} pctHistory={pctHistory} period={current} unit={unit} />}
      {tab === 'savings' && <SavingsTab periodData={periodData} periods={periods} categories={categories} salary={salary} unit={unit} />}
      {tab === 'annual' && <AnnualTab transactions={transactions} curY={curY} setCurY={setCurY} categories={categories} />}
    </div>
  )
}

function MonthlyTab({ periods, periodData, unit }) {
  const monthlyData = periodData
  const labels = periods.map(x => x.short)
  const incomeChart = {
    labels,
    datasets: [
      { label: 'Ingresos', data: monthlyData.map(d => d.income), backgroundColor: '#34c759', borderColor: '#34c759', borderWidth: 0 },
      { label: 'Gastos', data: monthlyData.map(d => d.expenses), backgroundColor: '#ff3b30', borderColor: '#ff3b30', borderWidth: 0 },
    ]
  }
  const balanceChart = {
    labels,
    datasets: [{
      label: 'Balance', data: monthlyData.map(d => d.balance),
      backgroundColor: monthlyData.map(d => d.balance >= 0 ? '#34c759' : '#ff3b30'),
      borderColor: monthlyData.map(d => d.balance >= 0 ? '#34c759' : '#ff3b30'),
      borderWidth: 0
    }]
  }
  const chartOpts = {
    responsive: true, maintainAspectRatio: false,
    scales: { y: { ticks: { callback: v => fmtShort(v) } } },
    plugins: { legend: { display: true, position: 'bottom', labels: { font: { size: 11 }, boxWidth: 10, padding: 12 } } }
  }

  const best = monthlyData.reduce((a, b) => b.balance > a.balance ? b : a, monthlyData[0])
  const worst = monthlyData.reduce((a, b) => b.balance < a.balance ? b : a, monthlyData[0])
  const bestIdx = monthlyData.indexOf(best)
  const worstIdx = monthlyData.indexOf(worst)

  return (
    <>
      <div className="grid-2 mb-4">
        <div className="card"><div className="section-header"><h3>Ingresos vs Gastos</h3></div>
          <div style={{ position: 'relative', height: 290 }}><Bar data={incomeChart} options={chartOpts} /></div>
        </div>
        <div className="card"><div className="section-header"><h3>Balance por {unit}</h3></div>
          <div style={{ position: 'relative', height: 290 }}><Bar data={balanceChart} options={{ ...chartOpts, plugins: { legend: { display: false } } }} /></div>
        </div>
      </div>
      <div className="card">
        <div className="section-header"><h3>Resumen del periodo</h3></div>
        <div className="grid-3 mb-3" style={{ gap: 10 }}>
          <div className="stat-card green"><div className="label">Total ingresos</div><div className="value text-green" style={{ fontSize: 17 }}>{fmt(monthlyData.reduce((s, d) => s + d.income, 0))}</div></div>
          <div className="stat-card red"><div className="label">Total gastos</div><div className="value text-red" style={{ fontSize: 17 }}>{fmt(monthlyData.reduce((s, d) => s + d.expenses, 0))}</div></div>
          <div className="stat-card indigo"><div className="label">Balance acumulado</div><div className="value" style={{ fontSize: 17 }}>{fmt(monthlyData.reduce((s, d) => s + d.balance, 0))}</div></div>
        </div>
        <p className="text-sm text-muted">
          <i className="fa fa-arrow-trend-up" style={{ color: 'var(--e5)' }} /> Mejor {unit}: <strong>{periods[bestIdx]?.label}</strong> (balance {fmt(best?.balance || 0)})
          &nbsp;·&nbsp;
          <i className="fa fa-arrow-trend-down" style={{ color: 'var(--r5)' }} /> Peor {unit}: <strong>{periods[worstIdx]?.label}</strong> (balance {fmt(worst?.balance || 0)})
        </p>
      </div>
    </>
  )
}

function CategoriesTab({ categories, transactions, salary, pctHistory, period, unit }) {
  // Judge the period against the % that was actually in force when it
  // ended, not today's, so lowering a budget later doesn't retroactively
  // paint an already-fine period as over budget. For the period still
  // in progress this resolves to today's value (see getPctAtDate).
  const atDate = period.end > new Date() ? new Date() : period.end
  const txs = transactions.filter(t => t.type === 'expense' && inPeriod(t, period))
  const catData = categories.map(c => ({
    ...c,
    spent: txs.filter(t => t.category_id === c.id).reduce((s, t) => s + t.amount, 0),
    budget: catBudget(c, salary, pctHistory, atDate)
  })).filter(c => c.spent > 0 || c.budget > 0).sort((a, b) => b.spent - a.spent)

  const donutItems = catData.filter(c => c.spent > 0).map(c => ({
    id: c.id, label: c.name, icon: c.icon, color: c.color, value: c.spent, item: c,
  }))

  return (
    <>
      <div className="card mb-4">
        <div className="section-header"><h3>Gasto por día</h3></div>
        <SpendingHeatmap transactions={transactions} start={period.start} end={period.end} />
      </div>
      <div className="grid-2 mb-4">
        <div className="card"><div className="section-header"><h3>Distribución de gastos</h3></div>
          {donutItems.length
            ? <Donut items={donutItems} centerLabel="Gastado" />
            : <EmptyState art="receipt" title={`Sin gastos este ${unit}`} />}
        </div>
        <div className="card"><div className="section-header"><h3>Desglose vs presupuesto</h3></div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={{ textAlign: 'left', fontSize: 11, padding: 8 }}>Categoría</th><th style={{ textAlign: 'right', fontSize: 11, padding: 8 }}>Gastado</th><th style={{ textAlign: 'right', fontSize: 11, padding: 8 }}>Presup.</th><th style={{ textAlign: 'right', fontSize: 11, padding: 8 }}>Desv.</th></tr></thead>
            <tbody>
              {catData.map(c => {
                const dev = c.spent - c.budget
                return (
                  <tr key={c.id} style={{ borderBottom: '.5px solid var(--sep)' }}>
                    <td style={{ padding: 8, fontSize: 12.5 }}>{c.icon} {c.name}</td>
                    <td style={{ padding: 8, fontSize: 12.5, textAlign: 'right', fontWeight: 500 }}>{fmt(c.spent)}</td>
                    <td style={{ padding: 8, fontSize: 12.5, textAlign: 'right', color: 'var(--muted)' }}>{fmt(c.budget)}</td>
                    <td style={{ padding: 8, fontSize: 12.5, textAlign: 'right', color: dev > 0 ? 'var(--r5)' : dev < 0 ? 'var(--e5)' : 'var(--muted)' }}>{dev > 0 ? '+' : ''}{fmt(dev)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
      <div className="card">
        <div className="section-header"><h3>Semáforo de categorías</h3><span className="text-xs text-muted"><span className="dot-legend" style={{ background: 'var(--e5)' }} /> Bajo · <span className="dot-legend" style={{ background: 'var(--a5)' }} /> +80% · <span className="dot-legend" style={{ background: 'var(--r5)' }} /> Superado</span></div>
        {categories.filter(c => c.type !== 'saving').map(c => {
          const spent = txs.filter(t => t.category_id === c.id).reduce((s, t) => s + t.amount, 0)
          const budget = catBudget(c, salary, pctHistory, atDate)
          const pct = budget > 0 ? spent / budget * 100 : 0
          const color = pct >= 100 ? 'var(--r5)' : pct >= 80 ? 'var(--a5)' : 'var(--e5)'
          return (
            <div key={c.id} className="flex items-center gap-2" style={{ padding: '8px 0', borderBottom: '.5px solid var(--sep)' }}>
              <span className="dot-legend" style={{ background: color, width: 10, height: 10 }} />
              <span style={{ minWidth: 28, fontSize: 14 }}>{c.icon}</span>
              <span style={{ flex: 1, fontSize: 13 }}>{c.name}</span>
              <div style={{ flex: 2, maxWidth: 160 }}><div className="progress-bar"><div className="progress-fill" style={{ width: Math.min(100, pct) + '%', background: color }} /></div></div>
              <span style={{ fontSize: 12, color, fontWeight: 600, minWidth: 48, textAlign: 'right' }}>{pct.toFixed(0)}%</span>
              <span className="text-xs text-muted">{fmt(spent)}/{fmt(budget)}</span>
            </div>
          )
        })}
      </div>
    </>
  )
}

function SavingsTab({ periodData, periods, categories, salary, unit }) {
  const monthlyData = periodData
  const labels = periods.map(x => x.short)
  const savedLine = monthlyData.map(d => Math.max(0, d.balance))
  const plannedPct = categories.filter(c => c.type === 'saving').reduce((s, c) => s + c.user_pct, 0)
  const plannedLine = Array(periods.length).fill(salary * plannedPct / 100)
  const savRates = monthlyData.map(d => calcSavingsRate(d.income, d.expenses))

  const savChart = {
    labels, datasets: [
      { label: 'Ahorro real', data: savedLine, borderColor: '#007aff', backgroundColor: 'rgba(0,122,255,.1)', fill: true, tension: .4, borderWidth: 2, pointRadius: 4, pointBackgroundColor: '#007aff' },
      { label: 'Planificado', data: plannedLine, borderColor: '#ff9500', borderDash: [5, 5], borderWidth: 0, fill: false, pointRadius: 0 },
    ]
  }
  const rateChart = {
    labels, datasets: [{
      label: 'Tasa ahorro %', data: savRates,
      backgroundColor: savRates.map(v => v >= 20 ? '#34c759' : v >= 10 ? '#ff9500' : '#ff3b30'),
      borderColor: savRates.map(v => v >= 20 ? '#34c759' : v >= 10 ? '#ff9500' : '#ff3b30'), borderWidth: 0
    }]
  }

  return (
    <div className="grid-2 mb-4">
      <div className="card"><div className="section-header"><h3>Evolución del ahorro</h3></div>
        <div style={{ position: 'relative', height: 290 }}>
          <Line data={savChart} options={{ responsive: true, maintainAspectRatio: false, scales: { y: { ticks: { callback: v => fmtShort(v) } } }, plugins: { legend: { display: true, position: 'bottom', labels: { font: { size: 11 }, boxWidth: 10, padding: 12 } } } }} />
        </div>
      </div>
      <div className="card"><div className="section-header"><h3>Tasa de ahorro por {unit} (%)</h3></div>
        <div style={{ position: 'relative', height: 290 }}>
          <Bar data={rateChart} options={{ responsive: true, maintainAspectRatio: false, scales: { y: { ticks: { callback: v => v + '%' }, suggestedMax: 40 } }, plugins: { legend: { display: false } } }} />
        </div>
      </div>
    </div>
  )
}

function AnnualTab({ transactions, curY, setCurY, categories }) {
  const months = Array.from({ length: 12 }, (_, m) => ({
    m, label: new Date(curY, m, 1).toLocaleString('es-ES', { month: 'long' })
  }))
  const monthData = months.map(({ m }) => {
    const txs = transactions.filter(t => {
      const d = new Date(t.date)
      return d.getMonth() === m && d.getFullYear() === curY
    })
    const income = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
    const expenses = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
    return { income, expenses, balance: income - expenses, saved: Math.max(0, income - expenses) }
  })
  const totals = monthData.reduce((acc, d) => ({
    income: acc.income + d.income, expenses: acc.expenses + d.expenses, saved: acc.saved + d.saved
  }), { income: 0, expenses: 0, saved: 0 })

  const annChart = {
    labels: months.map(m => m.label.slice(0, 3)),
    datasets: [
      { label: 'Ingresos', data: monthData.map(d => d.income), backgroundColor: '#34c759', borderColor: '#34c759', borderWidth: 0 },
      { label: 'Gastos', data: monthData.map(d => d.expenses), backgroundColor: '#ff3b30', borderColor: '#ff3b30', borderWidth: 0 },
    ]
  }

  const yearCatTotals = {}
  categories.forEach(c => yearCatTotals[c.id] = 0)
  transactions.filter(t => t.type === 'expense' && new Date(t.date).getFullYear() === curY).forEach(t => {
    if (yearCatTotals[t.category_id] !== undefined) yearCatTotals[t.category_id] += t.amount
  })
  const yearCats = categories.filter(c => yearCatTotals[c.id] > 0).sort((a, b) => yearCatTotals[b.id] - yearCatTotals[a.id])
  const annDonut = yearCats.map(c => ({ id: c.id, label: c.name, icon: c.icon, color: c.color, value: yearCatTotals[c.id], item: c }))


  return (
    <>
      <div className="flex items-center gap-2 mb-3">
        <button className="btn btn-ghost btn-icon" onClick={() => setCurY(y => y - 1)}><i className="fa fa-chevron-left" /></button>
        <h3 style={{ fontSize: 15, fontWeight: 600 }}>{curY}</h3>
        <button className="btn btn-ghost btn-icon" onClick={() => setCurY(y => y + 1)}><i className="fa fa-chevron-right" /></button>
      </div>
      <div className="grid-4 mb-4">
        <div className="stat-card green"><div className="label">Ingresos anuales</div><div className="value text-green" style={{ fontSize: 18 }}>{fmt(totals.income)}</div></div>
        <div className="stat-card red"><div className="label">Gastos anuales</div><div className="value text-red" style={{ fontSize: 18 }}>{fmt(totals.expenses)}</div></div>
        <div className="stat-card indigo"><div className="label">Balance anual</div><div className="value" style={{ fontSize: 18, color: totals.income - totals.expenses >= 0 ? 'var(--e5)' : 'var(--r5)' }}>{fmt(totals.income - totals.expenses)}</div></div>
        <div className="stat-card amber"><div className="label">Total ahorrado</div><div className="value text-amber" style={{ fontSize: 18 }}>{fmt(totals.saved)}</div></div>
      </div>
      <div className="grid-2 mb-4">
        <div className="card"><div className="section-header"><h3>Flujo anual</h3></div>
          <div style={{ position: 'relative', height: 290 }}><Bar data={annChart} options={{ responsive: true, maintainAspectRatio: false, scales: { y: { ticks: { callback: v => fmtShort(v) } } }, plugins: { legend: { display: true, position: 'bottom', labels: { font: { size: 11 }, boxWidth: 10, padding: 12 } } } }} /></div>
        </div>
        <div className="card"><div className="section-header"><h3>Gastos por categoría (año)</h3></div>
          {annDonut.length ? <Donut items={annDonut} centerLabel={`Gastado en ${curY}`} /> : <EmptyState art="receipt" title="Sin gastos este año" />}
        </div>
      </div>
      <div className="card">
        <div className="section-header"><h3>Tabla detallada</h3></div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={{ textAlign: 'left', fontSize: 11, padding: 8 }}>Mes</th><th style={{ textAlign: 'right', fontSize: 11, padding: 8 }}>Ingresos</th><th style={{ textAlign: 'right', fontSize: 11, padding: 8 }}>Gastos</th><th style={{ textAlign: 'right', fontSize: 11, padding: 8 }}>Balance</th><th style={{ textAlign: 'right', fontSize: 11, padding: 8 }}>Ahorro</th></tr></thead>
          <tbody>
            {months.map(({ m, label }) => {
              const d = monthData[m]
              return (
                <tr key={m} style={{ borderBottom: '.5px solid var(--sep)' }}>
                  <td style={{ padding: 8, fontSize: 12.5 }}>{label.charAt(0).toUpperCase() + label.slice(1)}</td>
                  <td style={{ padding: 8, fontSize: 12.5, textAlign: 'right', color: 'var(--e5)' }}>{fmt(d.income)}</td>
                  <td style={{ padding: 8, fontSize: 12.5, textAlign: 'right', color: 'var(--r5)' }}>{fmt(d.expenses)}</td>
                  <td style={{ padding: 8, fontSize: 12.5, textAlign: 'right', fontWeight: 500, color: d.balance >= 0 ? 'var(--e5)' : 'var(--r5)' }}>{fmt(d.balance)}</td>
                  <td style={{ padding: 8, fontSize: 12.5, textAlign: 'right' }}>{d.saved > 0 ? fmt(d.saved) : '-'}</td>
                </tr>
              )
            })}
            <tr style={{ fontWeight: 600, background: 'var(--g100)' }}>
              <td style={{ padding: 8, fontSize: 12.5 }}>Total {curY}</td>
              <td style={{ padding: 8, fontSize: 12.5, textAlign: 'right', color: 'var(--e5)' }}>{fmt(totals.income)}</td>
              <td style={{ padding: 8, fontSize: 12.5, textAlign: 'right', color: 'var(--r5)' }}>{fmt(totals.expenses)}</td>
              <td style={{ padding: 8, fontSize: 12.5, textAlign: 'right' }}>{fmt(totals.income - totals.expenses)}</td>
              <td style={{ padding: 8, fontSize: 12.5, textAlign: 'right' }}>{fmt(totals.saved)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  )
}

// ── EXPORT FUNCTIONS ──────────────────────────────────────────
function periodCategoryRows({ current, categories, salary, transactions, pctHistory }) {
  const atDate = current.end > new Date() ? new Date() : current.end
  const txs = transactions.filter(t => t.type === 'expense' && inPeriod(t, current))
  return categories.map(c => {
    const spent = txs.filter(t => t.category_id === c.id).reduce((s, t) => s + t.amount, 0)
    const budget = catBudget(c, salary, pctHistory, atDate)
    return { c, spent, budget }
  }).filter(r => r.spent > 0 || r.budget > 0)
}

// Category names are user input and go into a document.write()'d page.
const escapeHtml = (v) => String(v).replace(/[&<>"']/g, ch => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
))

function exportPDF({ periods, periodData, current, unit, ...rest }) {
  const catRows = periodCategoryRows({ current, ...rest }).map(({ c, spent, budget }) =>
    `<tr><td>${escapeHtml(c.icon)} ${escapeHtml(c.name)}</td><td style="text-align:right">${fmt(spent)}</td><td style="text-align:right">${fmt(budget)}</td><td style="text-align:right;color:${spent > budget ? '#ff3b30' : '#34c759'}">${fmt(spent - budget)}</td></tr>`
  ).join('')
  const periodRows = periods.map((p, i) => {
    const d = periodData[i]
    return `<tr><td>${escapeHtml(p.label)}</td><td style="text-align:right;color:#34c759">${fmt(d.income)}</td><td style="text-align:right;color:#ff3b30">${fmt(d.expenses)}</td><td style="text-align:right;color:${d.balance >= 0 ? '#34c759' : '#ff3b30'}">${fmt(d.balance)}</td></tr>`
  }).join('')
  const totalIncome = periodData.reduce((s, d) => s + d.income, 0)
  const totalExpenses = periodData.reduce((s, d) => s + d.expenses, 0)
  const title = escapeHtml(current.label)
  const head = unit === 'ciclo' ? 'Ciclo' : 'Mes'

  const win = window.open('', '_blank')
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Reporte — ${title}</title>
  <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#1d1d1f;padding:40px;font-size:13px;line-height:1.5}
  h1{font-size:26px;font-weight:700;margin-bottom:4px;letter-spacing:-.02em}p.sub{color:#6e6e73;margin-bottom:28px}
  .kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:28px}
  .kpi{background:#f5f5f7;border-radius:14px;padding:14px}
  .kpi .l{font-size:11px;font-weight:500;color:#6e6e73;margin-bottom:4px}.kpi .v{font-size:22px;font-weight:700}
  h2{font-size:15px;font-weight:600;margin:24px 0 10px}
  table{width:100%;border-collapse:collapse;margin-bottom:20px}th{text-align:left;font-size:11px;font-weight:600;color:#6e6e73;padding:8px 10px;border-bottom:1px solid #e5e5ea}
  td{padding:8px 10px;border-bottom:1px solid #f0f0f5;font-size:12.5px}
  @media print{button{display:none}}</style></head><body>
  <div style="display:flex;justify-content:space-between;margin-bottom:20px">
    <div><h1>Reporte financiero</h1><p class="sub">${title} · ${new Date().toLocaleDateString('es-ES')}</p></div>
    <button onclick="window.print()" style="padding:8px 16px;background:#0071e3;color:#fff;border:none;border-radius:10px;cursor:pointer;font-weight:600">Imprimir / PDF</button>
  </div>
  <div class="kpi-grid">
    <div class="kpi"><div class="l">Ingresos</div><div class="v" style="color:#34c759">${fmt(totalIncome)}</div></div>
    <div class="kpi"><div class="l">Gastos</div><div class="v" style="color:#ff3b30">${fmt(totalExpenses)}</div></div>
    <div class="kpi"><div class="l">Balance</div><div class="v" style="color:${totalIncome - totalExpenses >= 0 ? '#34c759' : '#ff3b30'}">${fmt(totalIncome - totalExpenses)}</div></div>
    <div class="kpi"><div class="l">Tasa ahorro</div><div class="v" style="color:#007aff">${totalIncome > 0 ? ((totalIncome - totalExpenses) / totalIncome * 100).toFixed(1) : 0}%</div></div>
  </div>
  <h2>Evolución por ${unit}</h2>
  <table><thead><tr><th>${head}</th><th style="text-align:right">Ingresos</th><th style="text-align:right">Gastos</th><th style="text-align:right">Balance</th></tr></thead><tbody>${periodRows}</tbody></table>
  <h2>Gastos por categoría — ${title}</h2>
  <table><thead><tr><th>Categoría</th><th style="text-align:right">Gastado</th><th style="text-align:right">Presupuesto</th><th style="text-align:right">Desviación</th></tr></thead><tbody>${catRows}</tbody></table>
  </body></html>`)
  win.document.close()
}

// Semicolon-separated with comma decimals: what Spanish-locale Excel
// opens straight into columns (a comma-separated file with '.'
// decimals lands in a single column there).
function exportCSV({ periods, periodData, current, unit, ...rest }) {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const num = (v) => v.toFixed(2).replace('.', ',')
  const lines = [
    [q(`REPORTE FINANCIERO — ${current.label}`)],
    [],
    [q(`EVOLUCIÓN POR ${unit.toUpperCase()}`)],
    [q(unit === 'ciclo' ? 'Ciclo' : 'Mes'), q('Ingresos'), q('Gastos'), q('Balance')],
    ...periods.map((p, i) => [q(p.label), num(periodData[i].income), num(periodData[i].expenses), num(periodData[i].balance)]),
    [],
    [q('GASTOS POR CATEGORÍA')],
    [q('Categoría'), q('Gastado'), q('Presupuesto'), q('Desviación')],
    ...periodCategoryRows({ current, ...rest }).map(({ c, spent, budget }) => [q(c.name), num(spent), num(budget), num(spent - budget)]),
  ]
  const csv = '\uFEFF' + lines.map(r => r.join(';')).join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `reporte-${toLocalISODate(new Date())}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
