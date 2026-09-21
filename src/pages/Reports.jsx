import React, { useState, useMemo, useCallback } from 'react'
import { useApp } from '../App'
import { fmt, fmtShort, catBudget, calcSavingsRate } from '../lib/finance'
import { Chart as ChartJS, BarElement, LineElement, PointElement, ArcElement, LinearScale, CategoryScale, Tooltip, Legend, Filler } from 'chart.js'
import { Bar, Doughnut, Line } from 'react-chartjs-2'
ChartJS.register(BarElement, LineElement, PointElement, ArcElement, LinearScale, CategoryScale, Tooltip, Legend, Filler)

export default function Reports() {
  const { profile, categories, transactions, pctHistory } = useApp()
  const [tab, setTab] = useState('monthly')
  const [curM, setCurM] = useState(new Date().getMonth())
  const [curY, setCurY] = useState(new Date().getFullYear())
  const salary = profile?.salary || 0

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
  const gridColor = isDark ? '#2c2c2e' : '#eeeef2'
  const tickColor = isDark ? '#98989d' : '#8e8e93'

  // ── FIX: get transactions for a SPECIFIC calendar month, not accumulated ──
  const getMonthTx = useCallback((m, y) => transactions.filter(t => {
    const d = new Date(t.date)
    return d.getMonth() === m && d.getFullYear() === y
  }), [transactions])

  // ── FIX: only count salary income that ACTUALLY happened in that month ──
  // (previously this was bugged to always add the current salary regardless of month)
  const last6Months = useMemo(() => {
    const arr = []
    for (let i = 5; i >= 0; i--) {
      let m = curM - i, y = curY
      if (m < 0) { m += 12; y-- }
      arr.push({ m, y, label: new Date(y, m, 1).toLocaleString('es-ES', { month: 'short' }) })
    }
    return arr
  }, [curM, curY])

  const monthlyData = useMemo(() => last6Months.map(({ m, y }) => {
    const txs = getMonthTx(m, y)
    // Only count REAL income transactions for that month — no synthetic salary injection
    const income = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
    const expenses = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
    return { income, expenses, balance: income - expenses }
  }), [last6Months, getMonthTx])

  const totalIncome6m = monthlyData.reduce((s, d) => s + d.income, 0)
  const totalExpenses6m = monthlyData.reduce((s, d) => s + d.expenses, 0)
  const avgSaving = (totalIncome6m - totalExpenses6m) / 6
  const lastMonthData = monthlyData[monthlyData.length - 1]
  const savingsRate = lastMonthData ? calcSavingsRate(lastMonthData.income, lastMonthData.expenses) : 0

  return (
    <div>
      <div className="page-header">
        <div className="flex items-center justify-between" style={{ flexWrap: 'wrap', gap: 10 }}>
          <div><h2>Reportes</h2><p>Análisis profesional de tus finanzas (datos reales por mes, sin proyecciones automáticas)</p></div>
          <div className="flex gap-2">
            <button className="btn btn-success" onClick={() => exportPDF({ monthlyData, last6Months, categories, salary, curM, curY, transactions, pctHistory })}>
              <i className="fa fa-file-pdf" /> PDF
            </button>
            <button className="btn btn-ghost" onClick={() => exportXLSX({ monthlyData, last6Months, categories, salary, curM, curY, transactions, pctHistory })}>
              <i className="fa fa-file-excel" /> Excel
            </button>
          </div>
        </div>
      </div>

      <div className="grid-4 mb-4">
        <div className="stat-card green">
          <div className="label">Ahorro medio/mes</div>
          <div className="value text-green" style={{ fontSize: 19 }}>{fmt(avgSaving)}</div>
          <div className="sub">Últimos 6 meses (datos reales)</div>
        </div>
        <div className="stat-card indigo">
          <div className="label">Tasa de ahorro (último mes)</div>
          <div className="value text-indigo" style={{ fontSize: 19 }}>{savingsRate.toFixed(1)}%</div>
          <div className="sub">{savingsRate >= 20 ? '✅ Bien (≥20%)' : savingsRate >= 10 ? '🟡 Mejorable' : '🔴 Baja (<10%)'}</div>
        </div>
        <div className="stat-card amber">
          <div className="label">Gasto medio/mes</div>
          <div className="value text-amber" style={{ fontSize: 19 }}>{fmt(totalExpenses6m / 6)}</div>
          <div className="sub">Últimos 6 meses</div>
        </div>
        <div className="stat-card red">
          <div className="label">Ingresos reales totales</div>
          <div className="value" style={{ fontSize: 19 }}>{fmt(totalIncome6m)}</div>
          <div className="sub">Suma de movimientos reales</div>
        </div>
      </div>

      <div className="tabs">
        <button className={`tab ${tab === 'monthly' ? 'active' : ''}`} onClick={() => setTab('monthly')}>📅 Mensual</button>
        <button className={`tab ${tab === 'categories' ? 'active' : ''}`} onClick={() => setTab('categories')}>🏷️ Categorías</button>
        <button className={`tab ${tab === 'savings' ? 'active' : ''}`} onClick={() => setTab('savings')}>💰 Ahorro</button>
        <button className={`tab ${tab === 'annual' ? 'active' : ''}`} onClick={() => setTab('annual')}>📆 Anual</button>
      </div>

      {tab === 'monthly' && <MonthlyTab last6Months={last6Months} monthlyData={monthlyData} gridColor={gridColor} tickColor={tickColor} />}
      {tab === 'categories' && <CategoriesTab categories={categories} transactions={transactions} salary={salary} pctHistory={pctHistory} curM={curM} curY={curY} setCurM={setCurM} gridColor={gridColor} tickColor={tickColor} isDark={isDark} />}
      {tab === 'savings' && <SavingsTab monthlyData={monthlyData} last6Months={last6Months} categories={categories} salary={salary} gridColor={gridColor} tickColor={tickColor} />}
      {tab === 'annual' && <AnnualTab transactions={transactions} curY={curY} setCurY={setCurY} categories={categories} gridColor={gridColor} tickColor={tickColor} isDark={isDark} />}
    </div>
  )
}

function MonthlyTab({ last6Months, monthlyData, gridColor, tickColor }) {
  const labels = last6Months.map(x => x.label)
  const incomeChart = {
    labels,
    datasets: [
      { label: 'Ingresos', data: monthlyData.map(d => d.income), backgroundColor: 'rgba(52,199,89,.4)', borderColor: '#34c759', borderWidth: 1.5 },
      { label: 'Gastos', data: monthlyData.map(d => d.expenses), backgroundColor: 'rgba(255,59,48,.35)', borderColor: '#ff3b30', borderWidth: 1.5 },
    ]
  }
  const balanceChart = {
    labels,
    datasets: [{
      label: 'Balance', data: monthlyData.map(d => d.balance),
      backgroundColor: monthlyData.map(d => d.balance >= 0 ? 'rgba(52,199,89,.45)' : 'rgba(255,59,48,.4)'),
      borderColor: monthlyData.map(d => d.balance >= 0 ? '#34c759' : '#ff3b30'),
      borderWidth: 1.5
    }]
  }
  const chartOpts = {
    responsive: true, maintainAspectRatio: false,
    scales: { y: { ticks: { callback: v => fmtShort(v), color: tickColor }, grid: { color: gridColor } } },
    plugins: { legend: { display: true, position: 'bottom', labels: { font: { size: 11 }, boxWidth: 10, padding: 12, color: tickColor } } }
  }

  const best = monthlyData.reduce((a, b) => b.balance > a.balance ? b : a, monthlyData[0])
  const worst = monthlyData.reduce((a, b) => b.balance < a.balance ? b : a, monthlyData[0])
  const bestIdx = monthlyData.indexOf(best)
  const worstIdx = monthlyData.indexOf(worst)

  return (
    <>
      <div className="grid-2 mb-4">
        <div className="card"><div className="section-header"><h3>Ingresos vs Gastos — últimos 6 meses</h3></div>
          <div style={{ position: 'relative', height: 290 }}><Bar data={incomeChart} options={chartOpts} /></div>
        </div>
        <div className="card"><div className="section-header"><h3>Balance mensual</h3></div>
          <div style={{ position: 'relative', height: 290 }}><Bar data={balanceChart} options={{ ...chartOpts, plugins: { legend: { display: false } } }} /></div>
        </div>
      </div>
      <div className="card">
        <div className="section-header"><h3>Resumen del periodo</h3></div>
        <div className="grid-3 mb-3" style={{ gap: 10 }}>
          <div className="stat-card green"><div className="label">Total ingresos (6m)</div><div className="value text-green" style={{ fontSize: 17 }}>{fmt(monthlyData.reduce((s, d) => s + d.income, 0))}</div></div>
          <div className="stat-card red"><div className="label">Total gastos (6m)</div><div className="value text-red" style={{ fontSize: 17 }}>{fmt(monthlyData.reduce((s, d) => s + d.expenses, 0))}</div></div>
          <div className="stat-card indigo"><div className="label">Balance acumulado</div><div className="value" style={{ fontSize: 17 }}>{fmt(monthlyData.reduce((s, d) => s + d.balance, 0))}</div></div>
        </div>
        <p className="text-sm text-muted">
          📈 Mejor mes: <strong>{last6Months[bestIdx]?.label}</strong> (balance {fmt(best?.balance || 0)})
          &nbsp;·&nbsp;
          📉 Peor mes: <strong>{last6Months[worstIdx]?.label}</strong> (balance {fmt(worst?.balance || 0)})
        </p>
      </div>
    </>
  )
}

function CategoriesTab({ categories, transactions, salary, pctHistory, curM, curY, setCurM, gridColor, tickColor, isDark }) {
  // Judge the selected month against the % that was actually active
  // when it ended, not today's live %, so lowering a budget later
  // doesn't retroactively paint an already-fine month as over budget.
  // For the current, still-ongoing month this resolves to today's
  // live value anyway (see getPctAtDate in lib/finance.js).
  const atDate = new Date(curY, curM + 1, 0, 23, 59, 59, 999)
  const txs = transactions.filter(t => {
    const d = new Date(t.date)
    return d.getMonth() === curM && d.getFullYear() === curY && t.type === 'expense'
  })
  const catData = categories.map(c => ({
    ...c,
    spent: txs.filter(t => t.category_id === c.id).reduce((s, t) => s + t.amount, 0),
    budget: catBudget(c, salary, pctHistory, atDate)
  })).filter(c => c.spent > 0 || c.budget > 0).sort((a, b) => b.spent - a.spent)

  const pieData = {
    labels: catData.filter(c => c.spent > 0).map(c => c.name),
    datasets: [{ data: catData.filter(c => c.spent > 0).map(c => c.spent), backgroundColor: catData.filter(c => c.spent > 0).map(c => c.color), borderWidth: 2, borderColor: isDark ? '#1c1c1e' : '#fff' }]
  }

  const monthLabel = new Date(curY, curM, 1).toLocaleString('es-ES', { month: 'long', year: 'numeric' })
  const goToPrevMonth = () => setCurM(m => m === 0 ? 11 : m - 1)
  const goToNextMonth = () => setCurM(m => m === 11 ? 0 : m + 1)

  return (
    <>
      <div className="flex items-center gap-2 mb-3">
        <button className="btn btn-ghost btn-icon" onClick={goToPrevMonth}><i className="fa fa-chevron-left" /></button>
        <h3 style={{ fontSize: 15, fontWeight: 600, textTransform: 'capitalize', minWidth: 160, textAlign: 'center' }}>{monthLabel}</h3>
        <button className="btn btn-ghost btn-icon" onClick={goToNextMonth}><i className="fa fa-chevron-right" /></button>
      </div>
      <div className="grid-2 mb-4">
        <div className="card"><div className="section-header"><h3>Distribución de gastos</h3></div>
          <div style={{ position: 'relative', height: 290 }}>
            <Doughnut data={pieData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true, position: 'bottom', labels: { font: { size: 11 }, boxWidth: 10, padding: 9, color: tickColor } } } }} />
          </div>
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
        <div className="section-header"><h3>Semáforo de categorías</h3><span className="text-xs text-muted">🟢 Bajo presupuesto · 🟡 +80% · 🔴 Superado</span></div>
        {categories.filter(c => c.type !== 'saving').map(c => {
          const spent = txs.filter(t => t.category_id === c.id).reduce((s, t) => s + t.amount, 0)
          const budget = catBudget(c, salary, pctHistory, atDate)
          const pct = budget > 0 ? spent / budget * 100 : 0
          const color = pct >= 100 ? 'var(--r5)' : pct >= 80 ? 'var(--a5)' : 'var(--e5)'
          const emoji = pct >= 100 ? '🔴' : pct >= 80 ? '🟡' : '🟢'
          return (
            <div key={c.id} className="flex items-center gap-2" style={{ padding: '8px 0', borderBottom: '.5px solid var(--sep)' }}>
              <span style={{ fontSize: 16 }}>{emoji}</span>
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

function SavingsTab({ monthlyData, last6Months, categories, salary, gridColor, tickColor }) {
  const labels = last6Months.map(x => x.label)
  const savedLine = monthlyData.map(d => Math.max(0, d.balance))
  const plannedPct = categories.filter(c => c.type === 'saving').reduce((s, c) => s + c.user_pct, 0)
  const plannedLine = Array(6).fill(salary * plannedPct / 100)
  const savRates = monthlyData.map(d => calcSavingsRate(d.income, d.expenses))

  const savChart = {
    labels, datasets: [
      { label: 'Ahorro real', data: savedLine, borderColor: '#007aff', backgroundColor: 'rgba(0,122,255,.1)', fill: true, tension: .4, borderWidth: 2, pointRadius: 4, pointBackgroundColor: '#007aff' },
      { label: 'Planificado', data: plannedLine, borderColor: '#ff9500', borderDash: [5, 5], borderWidth: 1.5, fill: false, pointRadius: 0 },
    ]
  }
  const rateChart = {
    labels, datasets: [{
      label: 'Tasa ahorro %', data: savRates,
      backgroundColor: savRates.map(v => v >= 20 ? 'rgba(52,199,89,.5)' : v >= 10 ? 'rgba(245,158,11,.5)' : 'rgba(255,59,48,.4)'),
      borderColor: savRates.map(v => v >= 20 ? '#34c759' : v >= 10 ? '#ff9500' : '#ff3b30'), borderWidth: 1.5
    }]
  }

  return (
    <div className="grid-2 mb-4">
      <div className="card"><div className="section-header"><h3>Evolución del ahorro</h3></div>
        <div style={{ position: 'relative', height: 290 }}>
          <Line data={savChart} options={{ responsive: true, maintainAspectRatio: false, scales: { y: { ticks: { callback: v => fmtShort(v), color: tickColor }, grid: { color: gridColor } } }, plugins: { legend: { display: true, position: 'bottom', labels: { font: { size: 11 }, boxWidth: 10, padding: 12, color: tickColor } } } }} />
        </div>
      </div>
      <div className="card"><div className="section-header"><h3>Tasa de ahorro mensual (%)</h3></div>
        <div style={{ position: 'relative', height: 290 }}>
          <Bar data={rateChart} options={{ responsive: true, maintainAspectRatio: false, scales: { y: { ticks: { callback: v => v + '%', color: tickColor }, grid: { color: gridColor }, suggestedMax: 40 } }, plugins: { legend: { display: false } } }} />
        </div>
      </div>
    </div>
  )
}

function AnnualTab({ transactions, curY, setCurY, categories, gridColor, tickColor, isDark }) {
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
      { label: 'Ingresos', data: monthData.map(d => d.income), backgroundColor: 'rgba(52,199,89,.4)', borderColor: '#34c759', borderWidth: 1.5 },
      { label: 'Gastos', data: monthData.map(d => d.expenses), backgroundColor: 'rgba(255,59,48,.35)', borderColor: '#ff3b30', borderWidth: 1.5 },
    ]
  }

  const yearCatTotals = {}
  categories.forEach(c => yearCatTotals[c.id] = 0)
  transactions.filter(t => t.type === 'expense' && new Date(t.date).getFullYear() === curY).forEach(t => {
    if (yearCatTotals[t.category_id] !== undefined) yearCatTotals[t.category_id] += t.amount
  })
  const yearCats = categories.filter(c => yearCatTotals[c.id] > 0).sort((a, b) => yearCatTotals[b.id] - yearCatTotals[a.id])
  const annPie = {
    labels: yearCats.map(c => c.icon + ' ' + c.name),
    datasets: [{ data: yearCats.map(c => yearCatTotals[c.id]), backgroundColor: yearCats.map(c => c.color), borderWidth: 2, borderColor: isDark ? '#1c1c1e' : '#fff' }]
  }

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
          <div style={{ position: 'relative', height: 290 }}><Bar data={annChart} options={{ responsive: true, maintainAspectRatio: false, scales: { y: { ticks: { callback: v => fmtShort(v), color: tickColor }, grid: { color: gridColor } } }, plugins: { legend: { display: true, position: 'bottom', labels: { font: { size: 11 }, boxWidth: 10, padding: 12, color: tickColor } } } }} /></div>
        </div>
        <div className="card"><div className="section-header"><h3>Gastos por categoría (año)</h3></div>
          <div style={{ position: 'relative', height: 290 }}><Doughnut data={annPie} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true, position: 'bottom', labels: { font: { size: 11 }, boxWidth: 10, padding: 9, color: tickColor } } } }} /></div>
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
function exportPDF({ monthlyData, last6Months, categories, salary, curM, curY, transactions, pctHistory }) {
  const atDate = new Date(curY, curM + 1, 0, 23, 59, 59, 999)
  const txs = transactions.filter(t => {
    const d = new Date(t.date)
    return d.getMonth() === curM && d.getFullYear() === curY && t.type === 'expense'
  })
  const catRows = categories.map(c => {
    const spent = txs.filter(t => t.category_id === c.id).reduce((s, t) => s + t.amount, 0)
    const budget = catBudget(c, salary, pctHistory, atDate)
    if (spent === 0 && budget === 0) return null
    return `<tr><td>${c.icon} ${c.name}</td><td style="text-align:right">${fmt(spent)}</td><td style="text-align:right">${fmt(budget)}</td><td style="text-align:right;color:${spent > budget ? '#ff3b30' : '#34c759'}">${fmt(spent - budget)}</td></tr>`
  }).filter(Boolean).join('')

  const monthRows = last6Months.map((m, i) => {
    const d = monthlyData[i]
    return `<tr><td>${m.label}</td><td style="text-align:right;color:#34c759">${fmt(d.income)}</td><td style="text-align:right;color:#ff3b30">${fmt(d.expenses)}</td><td style="text-align:right;color:${d.balance >= 0 ? '#34c759' : '#ff3b30'}">${fmt(d.balance)}</td></tr>`
  }).join('')

  const totalIncome = monthlyData.reduce((s, d) => s + d.income, 0)
  const totalExpenses = monthlyData.reduce((s, d) => s + d.expenses, 0)
  const monthLabel = new Date(curY, curM, 1).toLocaleString('es-ES', { month: 'long', year: 'numeric' })

  const win = window.open('', '_blank')
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Reporte — ${monthLabel}</title>
  <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;color:#1f2937;padding:40px;font-size:13px;line-height:1.5}
  h1{font-size:26px;font-weight:700;color:#1d1d1f;margin-bottom:4px}p.sub{color:#6b7280;margin-bottom:28px}
  .kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:28px}
  .kpi{background:#f5f5f7;border:1px solid #e5e7eb;border-radius:10px;padding:14px;border-left:4px solid #007aff}
  .kpi .l{font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;margin-bottom:4px}.kpi .v{font-size:22px;font-weight:700}
  h2{font-size:15px;font-weight:600;color:#1d1d1f;margin:24px 0 10px;padding-bottom:4px;border-bottom:2px solid #d6e8ff}
  table{width:100%;border-collapse:collapse;margin-bottom:20px}th{text-align:left;font-size:10.5px;font-weight:600;color:#6b7280;padding:8px 10px;border-bottom:2px solid #e5e7eb}
  td{padding:8px 10px;border-bottom:1px solid #eeeef2;font-size:12.5px}
  @media print{button{display:none}}</style></head><body>
  <div style="display:flex;justify-content:space-between;margin-bottom:20px">
    <div><h1>Reporte Financiero</h1><p class="sub">${monthLabel} · ${new Date().toLocaleDateString('es-ES')}</p></div>
    <button onclick="window.print()" style="padding:8px 16px;background:#0071e3;color:#fff;border:none;border-radius:8px;cursor:pointer">🖨️ Imprimir / PDF</button>
  </div>
  <div class="kpi-grid">
    <div class="kpi"><div class="l">Ingresos (6m)</div><div class="v" style="color:#34c759">${fmt(totalIncome)}</div></div>
    <div class="kpi"><div class="l">Gastos (6m)</div><div class="v" style="color:#ff3b30">${fmt(totalExpenses)}</div></div>
    <div class="kpi"><div class="l">Balance</div><div class="v" style="color:${totalIncome - totalExpenses >= 0 ? '#34c759' : '#ff3b30'}">${fmt(totalIncome - totalExpenses)}</div></div>
    <div class="kpi"><div class="l">Tasa ahorro</div><div class="v" style="color:#007aff">${totalIncome > 0 ? ((totalIncome - totalExpenses) / totalIncome * 100).toFixed(1) : 0}%</div></div>
  </div>
  <h2>Evolución mensual</h2>
  <table><thead><tr><th>Mes</th><th style="text-align:right">Ingresos</th><th style="text-align:right">Gastos</th><th style="text-align:right">Balance</th></tr></thead><tbody>${monthRows}</tbody></table>
  <h2>Gastos por categoría — ${monthLabel}</h2>
  <table><thead><tr><th>Categoría</th><th style="text-align:right">Gastado</th><th style="text-align:right">Presupuesto</th><th style="text-align:right">Desviación</th></tr></thead><tbody>${catRows}</tbody></table>
  </body></html>`)
  win.document.close()
}

function exportXLSX({ monthlyData, last6Months, categories, salary, curM, curY, transactions, pctHistory }) {
  const atDate = new Date(curY, curM + 1, 0, 23, 59, 59, 999)
  let csv = '\uFEFF'
  const monthLabel = new Date(curY, curM, 1).toLocaleString('es-ES', { month: 'long', year: 'numeric' })
  csv += `REPORTE FINANCIERO — ${monthLabel.toUpperCase()}\n\n`
  csv += 'EVOLUCIÓN MENSUAL\nMes,Ingresos,Gastos,Balance\n'
  last6Months.forEach((m, i) => {
    const d = monthlyData[i]
    csv += `${m.label},${d.income.toFixed(2)},${d.expenses.toFixed(2)},${d.balance.toFixed(2)}\n`
  })
  csv += '\nGASTOS POR CATEGORÍA\nCategoría,Gastado,Presupuesto,Desviación\n'
  const txs = transactions.filter(t => {
    const d = new Date(t.date)
    return d.getMonth() === curM && d.getFullYear() === curY && t.type === 'expense'
  })
  categories.forEach(c => {
    const spent = txs.filter(t => t.category_id === c.id).reduce((s, t) => s + t.amount, 0)
    const budget = catBudget(c, salary, pctHistory, atDate)
    if (spent > 0 || budget > 0) csv += `${c.name},${spent.toFixed(2)},${budget.toFixed(2)},${(spent - budget).toFixed(2)}\n`
  })
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `reporte-${new Date().toISOString().split('T')[0]}.csv`
  a.click()
}
