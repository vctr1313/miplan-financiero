import React, { useMemo, useState } from 'react'
import { useApp } from '../App'
import { fmt, fmtShort, calcCycleStats, calcSavingsRate } from '../lib/finance'

export default function CycleHistory() {
  const { profile, categories, transactions, fixedExpenses, cycles } = useApp()
  const salary = profile?.salary || 0
  const [compareA, setCompareA] = useState(null)
  const [compareB, setCompareB] = useState(null)

  const cycleStats = useMemo(() => {
    return [...cycles].reverse().map(cycle => {
      const stats = calcCycleStats({ transactions, cycle, categories, salary, fixedExpenses })
      return { cycle, stats }
    })
  }, [cycles, transactions, categories, salary, fixedExpenses])

  if (cycles.length === 0) {
    return (
      <div>
        <div className="page-header"><h2>Historial de ciclos</h2><p>Comparativa de tus ciclos de cobro pasados</p></div>
        <div className="alert alert-info">
          <i className="fa fa-circle-info" /> Aún no tienes ciclos registrados. Añade tu primera nómina para empezar a ver tu historial.
        </div>
      </div>
    )
  }

  const a = compareA != null ? cycleStats[compareA] : cycleStats[0]
  const b = compareB != null ? cycleStats[compareB] : cycleStats[1]

  return (
    <div>
      <div className="page-header">
        <h2>Historial de ciclos</h2>
        <p>{cycles.length} ciclo{cycles.length !== 1 ? 's' : ''} registrado{cycles.length !== 1 ? 's' : ''} desde tu primera nómina</p>
      </div>

      {b && (
        <div className="card mb-4">
          <div className="section-header">
            <h3>Comparar dos ciclos</h3>
          </div>
          <div className="form-row mb-3">
            <div className="form-group">
              <label>Ciclo A</label>
              <select className="form-control" value={compareA ?? 0} onChange={e => setCompareA(parseInt(e.target.value))}>
                {cycleStats.map((cs, i) => (
                  <option key={i} value={i}>{cycleLabel(cs.cycle)}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Ciclo B</label>
              <select className="form-control" value={compareB ?? 1} onChange={e => setCompareB(parseInt(e.target.value))}>
                {cycleStats.map((cs, i) => (
                  <option key={i} value={i}>{cycleLabel(cs.cycle)}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid-4">
            <CompareStat label="Ingresos" valA={a.stats.income} valB={b.stats.income} format={fmt} higherIsBetter />
            <CompareStat label="Gastos" valA={a.stats.expenses} valB={b.stats.expenses} format={fmt} higherIsBetter={false} />
            <CompareStat label="Balance" valA={a.stats.balance} valB={b.stats.balance} format={fmt} higherIsBetter />
            <CompareStat
              label="Tasa ahorro"
              valA={calcSavingsRate(a.stats.income, a.stats.expenses)}
              valB={calcSavingsRate(b.stats.income, b.stats.expenses)}
              format={v => v.toFixed(1) + '%'}
              higherIsBetter
            />
          </div>
        </div>
      )}

      <div className="card">
        <div className="section-header"><h3>Todos los ciclos</h3></div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thStyle}>Periodo</th>
              <th style={thStyle}>Quién cobró</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Ingresos</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Gastos</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Balance</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Tasa ahorro</th>
            </tr>
          </thead>
          <tbody>
            {cycleStats.map((cs, i) => {
              const rate = calcSavingsRate(cs.stats.income, cs.stats.expenses)
              return (
                <tr key={i} style={{ borderBottom: '1px solid var(--g100)' }}>
                  <td style={tdStyle}>{cycleLabel(cs.cycle)}</td>
                  <td style={tdStyle}>{cs.cycle.userName || '—'}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--e5)' }}>{fmt(cs.stats.income)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--r5)' }}>{fmt(cs.stats.expenses)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, color: cs.stats.balance >= 0 ? 'var(--e5)' : 'var(--r5)' }}>{fmt(cs.stats.balance)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    <span className={`badge ${rate >= 20 ? 'badge-green' : rate >= 10 ? 'badge-amber' : 'badge-red'}`}>{rate.toFixed(1)}%</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function CompareStat({ label, valA, valB, format, higherIsBetter }) {
  const delta = valB - valA
  const isBetter = higherIsBetter ? delta > 0 : delta < 0
  const isWorse = higherIsBetter ? delta < 0 : delta > 0
  return (
    <div className="stat-card">
      <div className="label">{label}</div>
      <div className="flex items-center gap-2" style={{ marginTop: 4 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--muted)' }}>{format(valA)}</div>
        <i className="fa fa-arrow-right" style={{ fontSize: 10, color: 'var(--g300)' }} />
        <div style={{ fontSize: 17, fontWeight: 700 }}>{format(valB)}</div>
      </div>
      {delta !== 0 && (
        <div className="sub" style={{ color: isBetter ? 'var(--e5)' : isWorse ? 'var(--r5)' : 'var(--muted)' }}>
          {delta > 0 ? '↑' : '↓'} {format(Math.abs(delta))}
        </div>
      )}
    </div>
  )
}

function cycleLabel(cycle) {
  const start = cycle.start.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
  const end = cycle.end.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })
  return `${start} → ${end}`
}

const thStyle = { textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', padding: '8px 10px', borderBottom: '1px solid var(--border)' }
const tdStyle = { padding: '9px 10px', fontSize: 12.5 }
