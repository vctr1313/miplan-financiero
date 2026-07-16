import React, { useState, useEffect } from 'react'
import { useApp } from '../App'
import { updateHouseGoal } from '../lib/supabase'
import { fmt, fmtShort, calcHouseProgress, simulateMortgage, getPartnerContribution } from '../lib/finance'
import { Chart as ChartJS, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend, Filler } from 'chart.js'
import { Line } from 'react-chartjs-2'
ChartJS.register(LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend, Filler)

export default function House() {
  const { profile, categories, houseGoal, partnerSummary, refresh } = useApp()
  const isLinked = !!profile?.partner_id
  const salary = profile?.salary || 0
  const [pairMode, setPairMode] = useState(houseGoal?.pair_mode || 'solo')
  const [target, setTarget] = useState(houseGoal?.target || 200000)
  const [dpPct, setDpPct] = useState(houseGoal?.dp_pct || 30)
  const [mySaved, setMySaved] = useState(houseGoal?.my_saved || 0)
  const [investSaved, setInvestSaved] = useState(houseGoal?.invest_saved || 0)
  const [pSalary, setPSalary] = useState(houseGoal?.p_salary || 0)
  const [pPct, setPPct] = useState(houseGoal?.p_pct || 20)
  const [pSaved, setPSaved] = useState(houseGoal?.p_saved || 0)
  const [saved, setSaved] = useState(false)

  // Mortgage simulator state
  const [mortPairMode, setMortPairMode] = useState(houseGoal?.mort_pair_mode || 'solo')
  const [simPrice, setSimPrice] = useState('')
  const [simDown, setSimDown] = useState('')
  const [simRate, setSimRate] = useState('3.5')
  const [simYears, setSimYears] = useState('30')
  const [simPSalary, setSimPSalary] = useState('')

  useEffect(() => {
    if (houseGoal) {
      setPairMode(houseGoal.pair_mode || 'solo')
      setTarget(houseGoal.target || 200000)
      setDpPct(houseGoal.dp_pct || 30)
      setMySaved(houseGoal.my_saved || 0)
      setInvestSaved(houseGoal.invest_saved || 0)
      setPSalary(houseGoal.p_salary || 0)
      setPPct(houseGoal.p_pct || 20)
      setPSaved(houseGoal.p_saved || 0)
      setMortPairMode(houseGoal.mort_pair_mode || 'solo')
    }
  }, [houseGoal])

  const mySavingPerCycle = salary * categories.filter(c => c.type === 'saving').reduce((s, c) => s + c.user_pct, 0) / 100
  // When a partner is linked, real numbers from their account (via
  // getPartnerSummary) drive the calculation instead of the manually
  // typed pSalary/pPct/pSaved -- see getPartnerContribution in
  // lib/finance.js for the fallback logic when not linked.
  const partnerContribution = getPartnerContribution({
    houseGoal: { pair_mode: pairMode, p_salary: pSalary, p_pct: pPct, p_saved: pSaved },
    partnerSummary: isLinked ? partnerSummary : null,
  })
  const houseCalc = calcHouseProgress({
    goal: { target, dp_pct: dpPct, my_saved: mySaved, pair_mode: pairMode, p_saved: pSaved },
    mySavingPerCycle,
    partnerSavingPerCycle: partnerContribution.savingPerCycle,
    partnerSaved: partnerContribution.isLive ? partnerContribution.saved : null,
  })

  const handleSaveGoal = async () => {
    await updateHouseGoal({
      id: houseGoal?.id,
      household_id: profile.household_id,
      target: parseFloat(target) || 0,
      dp_pct: parseFloat(dpPct) || 30,
      my_saved: parseFloat(mySaved) || 0,
      invest_saved: parseFloat(investSaved) || 0,
      pair_mode: pairMode,
      mort_pair_mode: mortPairMode,
      // When linked, the partner's real numbers drive everything (see
      // getPartnerContribution) -- these manual fields are left as-is
      // in the DB rather than overwritten with stale/unused form state.
      ...(pairMode === 'pair' && !isLinked
        ? { p_salary: parseFloat(pSalary) || 0, p_pct: parseFloat(pPct) || 20, p_saved: parseFloat(pSaved) || 0 }
        : pairMode === 'solo'
        ? { p_salary: 0, p_pct: 20, p_saved: 0 }
        : {}),
    })
    await refresh()
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  // Mortgage calc
  const price = parseFloat(simPrice) || 0
  const down = parseFloat(simDown) || 0
  const rate = parseFloat(simRate) || 3.5
  const years = parseFloat(simYears) || 30
  const partnerSal = mortPairMode === 'pair' ? (parseFloat(simPSalary) || 0) : 0
  const mortgage = price && years
    ? simulateMortgage({ price, downPayment: down, ratePercent: rate, years, myNetIncome: salary, partnerNetIncome: partnerSal, isPair: mortPairMode === 'pair' })
    : null

  // Projection chart data
  const labels = []
  const savLine = []
  const invLine = []
  let accSav = houseCalc.totalSaved || 0
  let accInv = houseCalc.totalSaved || 0
  const r = 0.07 / 12
  for (let m = 0; m <= 120; m++) {
    labels.push(m === 0 ? 'Hoy' : m % 12 === 0 ? `${m / 12}a` : '')
    savLine.push(Math.round(accSav))
    invLine.push(Math.round(accInv))
    accSav += houseCalc.totalMonthly || 0
    accInv = (accInv + (houseCalc.totalMonthly || 0)) * (1 + r)
  }
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
  const gridColor = isDark ? '#2a2840' : '#f3f4f6'
  const tickColor = isDark ? '#8884a8' : '#9ca3af'

  const chartData = {
    labels,
    datasets: [
      { label: 'Ahorro puro', data: savLine, borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,.1)', fill: true, tension: .35, borderWidth: 2, pointRadius: 0 },
      { label: 'Con inversión (7%/año)', data: invLine, borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,.07)', fill: true, tension: .35, borderWidth: 2, pointRadius: 0 },
      { label: 'Objetivo entrada', data: Array(121).fill(houseCalc.entryTarget || 0), borderColor: '#f59e0b', borderDash: [5, 5], borderWidth: 1.5, fill: false, pointRadius: 0 },
    ]
  }

  return (
    <div>
      <div className="page-header">
        <h2>🏠 Meta: Mi primera casa</h2>
        <p>Objetivo de ahorro a largo plazo, solo/a o en pareja</p>
      </div>

      <div className="flex gap-0 mb-3" style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', width: 'fit-content' }}>
        <button
          className={`tab ${pairMode === 'solo' ? 'active' : ''}`}
          style={{ padding: '6px 16px', background: pairMode === 'solo' ? 'var(--i6)' : 'var(--card)', color: pairMode === 'solo' ? '#fff' : 'var(--muted)', border: 'none' }}
          onClick={() => setPairMode('solo')}
        >
          <i className="fa fa-user" /> Solo/a
        </button>
        <button
          className={`tab ${pairMode === 'pair' ? 'active' : ''}`}
          style={{ padding: '6px 16px', background: pairMode === 'pair' ? 'var(--i6)' : 'var(--card)', color: pairMode === 'pair' ? '#fff' : 'var(--muted)', border: 'none' }}
          onClick={() => setPairMode('pair')}
        >
          <i className="fa fa-user-group" /> En pareja
        </button>
      </div>

      <div className="house-card mb-4">
        <h3>Tu progreso hacia la casa</h3>
        <div className="flex items-center gap-3 mt-2" style={{ flexWrap: 'wrap' }}>
          <div>
            <div className="house-goal-amount">{fmtShort(houseCalc.totalSaved || 0)}</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.52)' }}>de {fmtShort(houseCalc.entryTarget || 0)} para la entrada</div>
            <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{Math.round(houseCalc.pct || 0)}% del objetivo</div>
          </div>
          <div style={{ flex: 1, minWidth: 130 }}>
            <div className="house-progress-bar"><div className="house-progress-fill" style={{ width: (houseCalc.pct || 0) + '%' }} /></div>
            <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.4)', marginTop: 5 }}>
              {houseCalc.yearsLeft != null
                ? `≈ ${houseCalc.yearsLeft > 0 ? houseCalc.yearsLeft + ' año' + (houseCalc.yearsLeft > 1 ? 's' : '') : ''} ${houseCalc.mos > 0 ? houseCalc.mos + ' mes' + (houseCalc.mos > 1 ? 'es' : '') : ''}`
                : (houseCalc.totalSaved >= houseCalc.entryTarget && houseCalc.entryTarget > 0 ? '🎉 ¡Objetivo alcanzado!' : 'Configura el objetivo')}
            </div>
          </div>
        </div>
        <div className="house-meta">
          <div><span>Ahorro tú/mes</span><strong>{fmt(mySavingPerCycle)}</strong></div>
          {pairMode === 'pair' && <div><span>Pareja/mes</span><strong>{fmt(partnerContribution.savingPerCycle)}</strong></div>}
          <div><span>Total mensual</span><strong>{fmt(houseCalc.totalMonthly || 0)}</strong></div>
          <div><span>Años restantes</span><strong>{houseCalc.yearsLeft != null ? `${houseCalc.yearsLeft}a ${houseCalc.mos}m` : '—'}</strong></div>
        </div>
      </div>

      <div className="grid-2 mb-4">
        <div className="card">
          <div className="section-header"><h3>Configurar objetivo</h3></div>
          <div className="form-group">
            <label>Precio objetivo (€)</label>
            <input className="form-control" type="number" min="0" value={target} onChange={e => setTarget(e.target.value)} placeholder="250000" />
          </div>
          <div className="form-group">
            <label>% de entrada</label>
            <input className="form-control" type="number" min="0" max="100" value={dpPct} onChange={e => setDpPct(e.target.value)} placeholder="30" />
            <div className="form-hint">20% precio + 10-15% gastos ≈ 30-35%</div>
          </div>
          <div className="form-group">
            <label>Ahorro acumulado — tú (€)</label>
            <input className="form-control" type="number" min="0" value={mySaved} onChange={e => setMySaved(e.target.value)} placeholder="0" />
            <div className="form-hint">Total ahorrado para la casa (paga extra → Ahorro casa)</div>
          </div>
          <div className="form-group">
            <label>Total invertido (€)</label>
            <input className="form-control" type="number" min="0" value={investSaved} onChange={e => setInvestSaved(e.target.value)} placeholder="0" />
            <div className="form-hint">Total en inversión (paga extra → Inversión). Edita aquí si necesitas corregirlo.</div>
          </div>

          {pairMode === 'pair' && isLinked && (
            <>
              <hr className="divider" />
              <div className="alert alert-success" style={{ marginBottom: 0 }}>
                <i className="fa fa-link" />
                <div>
                  Sincronizado con la cuenta de tu pareja{partnerSummary?.partner_name ? ` (${partnerSummary.partner_name})` : ''}.
                  <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span>Sueldo: <strong>{fmt(partnerSummary?.partner_salary || 0)}</strong></span>
                    <span>Ahorro casa/mes: <strong>{fmt(partnerContribution.savingPerCycle)}</strong></span>
                    <span>Ahorro acumulado: <strong>{fmt(partnerContribution.saved)}</strong></span>
                  </div>
                </div>
              </div>
            </>
          )}

          {pairMode === 'pair' && !isLinked && (
            <>
              <hr className="divider" />
              <div className="form-hint" style={{ marginBottom: 8 }}>
                Vincula la cuenta de tu pareja en Ajustes para usar sus datos reales en vez de escribirlos a mano.
              </div>
              <div className="form-group">
                <label>Sueldo neto pareja (€/mes)</label>
                <input className="form-control" type="number" min="0" value={pSalary} onChange={e => setPSalary(e.target.value)} placeholder="1800" />
              </div>
              <div className="form-group">
                <label>% sueldo pareja para ahorro casa</label>
                <input className="form-control" type="number" min="0" max="100" value={pPct} onChange={e => setPPct(e.target.value)} placeholder="20" />
              </div>
              <div className="form-group">
                <label>Ahorro acumulado — pareja (€)</label>
                <input className="form-control" type="number" min="0" value={pSaved} onChange={e => setPSaved(e.target.value)} placeholder="0" />
              </div>
            </>
          )}

          <button className="btn btn-primary w-full mt-2" onClick={handleSaveGoal}>
            <i className="fa fa-floppy-disk" /> {saved ? '✅ Guardado' : 'Guardar objetivo'}
          </button>
        </div>

        <div className="card">
          <div className="section-header"><h3>Proyección de ahorro</h3></div>
          <div style={{ position: 'relative', height: 290 }}>
            <Line data={chartData} options={{
              responsive: true, maintainAspectRatio: false,
              scales: {
                y: { ticks: { callback: v => fmtShort(v), color: tickColor }, grid: { color: gridColor } },
                x: { ticks: { maxTicksLimit: 12, maxRotation: 0, color: tickColor }, grid: { color: gridColor } }
              },
              plugins: { legend: { display: true, position: 'bottom', labels: { font: { size: 11 }, boxWidth: 10, padding: 12, color: tickColor } } }
            }} />
          </div>
        </div>
      </div>

      {/* MORTGAGE SIMULATOR */}
      <div className="card mb-4">
        <div className="section-header">
          <h3>Simulador de hipoteca</h3>
          <div className="flex gap-0" style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            <button style={{ padding: '6px 16px', fontSize: 12, background: mortPairMode === 'solo' ? 'var(--i6)' : 'var(--card)', color: mortPairMode === 'solo' ? '#fff' : 'var(--muted)', border: 'none' }} onClick={() => setMortPairMode('solo')}>
              <i className="fa fa-user" /> Solo/a
            </button>
            <button style={{ padding: '6px 16px', fontSize: 12, background: mortPairMode === 'pair' ? 'var(--i6)' : 'var(--card)', color: mortPairMode === 'pair' ? '#fff' : 'var(--muted)', border: 'none' }} onClick={() => setMortPairMode('pair')}>
              <i className="fa fa-user-group" /> En pareja
            </button>
          </div>
        </div>

        <div className="alert alert-info mb-3">
          <i className="fa fa-circle-info" />
          <div>
            {mortPairMode === 'pair'
              ? <>Con dos sueldos el banco acepta cuotas más altas. La regla sigue siendo el <strong>35% de los ingresos netos combinados</strong>. Simula también con un solo sueldo: ¿podríais pagar si uno pierde el trabajo?</>
              : <>La cuota no debe superar el <strong>35% de los ingresos netos</strong> (ideal: 30%).</>}
          </div>
        </div>

        <div className="form-row mb-3">
          <div className="form-group">
            <label>Precio (€)</label>
            <input className="form-control" type="number" value={simPrice} onChange={e => setSimPrice(e.target.value)} placeholder="250000" />
          </div>
          <div className="form-group">
            <label>Entrada (€)</label>
            <input className="form-control" type="number" value={simDown} onChange={e => setSimDown(e.target.value)} placeholder="75000" />
          </div>
          <div className="form-group">
            <label>Interés (%)</label>
            <input className="form-control" type="number" step="0.1" value={simRate} onChange={e => setSimRate(e.target.value)} placeholder="3.5" />
          </div>
          <div className="form-group">
            <label>Plazo (años)</label>
            <input className="form-control" type="number" value={simYears} onChange={e => setSimYears(e.target.value)} placeholder="30" />
          </div>
        </div>

        {mortPairMode === 'pair' && (
          <div className="form-group mb-3">
            <label>Sueldo neto pareja (€/mes) <span className="text-xs text-muted">— para esfuerzo conjunto</span></label>
            <input className="form-control" type="number" value={simPSalary} onChange={e => setSimPSalary(e.target.value)} placeholder="1800" style={{ maxWidth: 240 }} />
          </div>
        )}

        {mortgage && (
          <>
            <div className="grid-4 mb-3">
              <div className="stat-card indigo">
                <div className="label">Cuota mensual</div>
                <div className="value" style={{ fontSize: 17 }}>{fmt(mortgage.monthly)}</div>
                <div className="sub">{mortgage.effortPct != null ? `${mortgage.effortPct.toFixed(1)}% del neto ${mortgage.effortPct <= 35 ? '✅' : '⚠️'}` : '—'}</div>
              </div>
              <div className="stat-card red">
                <div className="label">Préstamo</div>
                <div className="value" style={{ fontSize: 17 }}>{fmt(mortgage.loan)}</div>
                <div className="sub">{price > 0 ? Math.round(mortgage.loan / price * 100) + '% del precio' : ''}</div>
              </div>
              <div className="stat-card">
                <div className="label">Total intereses</div>
                <div className="value text-red" style={{ fontSize: 17 }}>{fmt(mortgage.totalInterest)}</div>
                <div className="sub">En {years} años</div>
              </div>
              <div className="stat-card green">
                <div className="label">Coste total</div>
                <div className="value" style={{ fontSize: 17 }}>{fmt(mortgage.totalPaid)}</div>
                <div className="sub">precio+intereses</div>
              </div>
            </div>
            <MortgageAdvice mortgage={mortgage} mortPairMode={mortPairMode} down={down} price={price} />
          </>
        )}
      </div>
    </div>
  )
}

function MortgageAdvice({ mortgage, mortPairMode, down, price }) {
  const { effortPct, effortSoloPct, riskLevel } = mortgage
  const adviceMap = {
    excellent: { cls: 'alert-success', icon: 'fa-check', text: (e) => `Excelente. Cuota del ${e.toFixed(1)}% del neto. Bajo el 30% ideal. Tienes margen cómodo.` },
    acceptable: { cls: 'alert-warning', icon: 'fa-triangle-exclamation', text: (e) => `Aceptable. Cuota del ${e.toFixed(1)}%. Dentro del límite del 35%, pero sin mucho colchón. Ten fondo de emergencia.` },
    high: { cls: 'alert-danger', icon: 'fa-triangle-exclamation', text: (e) => `Esfuerzo alto. ${e.toFixed(1)}% supera el 35% recomendado. Considera mayor entrada o plazo más largo.` },
    dangerous: { cls: 'alert-danger', icon: 'fa-xmark', text: (e) => `Nivel de riesgo alto. ${e.toFixed(1)}% del neto. Cualquier imprevisto comprometería el pago. Busca una opción más asequible.` },
  }
  const advice = effortPct != null ? adviceMap[riskLevel] : null

  return (
    <>
      {advice && (
        <div className={`alert ${advice.cls}`}>
          <i className={`fa ${advice.icon}`} />
          <div><strong>{advice.text(effortPct).split('.')[0]}.</strong>{advice.text(effortPct).split('.').slice(1).join('.')}</div>
        </div>
      )}
      {mortPairMode === 'pair' && effortSoloPct != null && (
        <div className={`alert ${effortSoloPct <= 35 ? 'alert-success' : effortSoloPct <= 50 ? 'alert-warning' : 'alert-danger'}`}>
          <i className="fa fa-user" />
          <div>
            <strong>Si uno pierde el trabajo:</strong> la cuota sería el {effortSoloPct.toFixed(1)}% del sueldo restante.{' '}
            {effortSoloPct <= 35 ? '✅ Asumible solo/a.' : effortSoloPct <= 50 ? '⚠️ Tensión alta — fondo de emergencia 6+ meses imprescindible.' : '❌ Muy difícil solo/a. Valorad seguro de vida/desempleo ligado a la hipoteca.'}
          </div>
        </div>
      )}
      {mortPairMode === 'pair' && price > 0 && down / price < 0.2 && (
        <div className="alert alert-warning">
          <i className="fa fa-circle-info" /> Entrada &lt;20%: el banco puede exigir seguro hipotecario adicional, encareciendo el coste total.
        </div>
      )}
    </>
  )
}
