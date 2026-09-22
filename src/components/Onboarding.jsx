import React, { useState } from 'react'
import { useApp } from '../App'
import { updateProfile } from '../lib/supabase'
import { salaryFlow } from '../lib/insights'
import { fmt } from '../lib/finance'
import { haptic, autoFocusOnPointer } from '../lib/ui'
import { burstConfetti } from '../lib/confetti'

const KEY = 'fp_onboarded'
export const isOnboarded = () => { try { return !!localStorage.getItem(KEY) } catch { return true } }
const markOnboarded = () => { try { localStorage.setItem(KEY, '1') } catch { /* private mode */ } }

// First-run walkthrough for a brand-new account (no movements yet):
// hello -> salary -> how it splits -> record the first nómina.
// `onFinish(next)` closes it; next is 'income' (open the add sheet on
// Ingreso), 'budget' (go to Presupuesto) or null.
export default function Onboarding({ onFinish }) {
  const { profile, setProfile, categories, fixedExpenses } = useApp()
  const [step, setStep] = useState(0)
  const [salary, setSalary] = useState(profile?.salary ? String(profile.salary) : '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const finish = (next = null) => { markOnboarded(); onFinish(next) }
  const go = (n) => { haptic('light'); setStep(n) }

  const saveSalary = async () => {
    const value = parseFloat(String(salary).replace(',', '.'))
    if (!(value > 0)) { setError('Escribe tu sueldo neto mensual'); return }
    setSaving(true); setError('')
    try {
      const updated = await updateProfile(profile.id, { salary: value })
      setProfile(updated)
      go(2)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const flow = salaryFlow({ salary: parseFloat(salary) || profile?.salary || 0, categories, fixedExpenses })
  const firstName = (profile?.name || '').split(' ')[0]

  const steps = [
    <div key="hello" className="ob-step">
      <div className="ob-hero">💰</div>
      <h2>Hola{firstName ? `, ${firstName}` : ''}</h2>
      <p>Mi Plan reparte cada nómina en lo que de verdad importa y te dice, día a día, si vas bien.</p>
      <ul className="ob-points">
        <li><i className="fa fa-sliders" /> Un presupuesto por categorías, en € o en %</li>
        <li><i className="fa fa-piggy-bank" /> Botes que acumulan lo que no gastas</li>
        <li><i className="fa fa-gauge-high" /> El ritmo del mes, de un vistazo</li>
      </ul>
      <button type="button" className="btn btn-primary w-full" onClick={() => go(1)}>Empezar</button>
      <button type="button" className="btn btn-ghost w-full mt-2" onClick={() => finish()}>Ahora no</button>
    </div>,

    <div key="salary" className="ob-step">
      <div className="ob-hero">💼</div>
      <h2>¿Cuánto cobras al mes?</h2>
      <p>Tu sueldo neto. Con él se calcula cuánto toca a cada categoría. Solo tu pareja vinculada podrá verlo, dentro de su resumen.</p>
      <div className="ob-amount">
        <input className="form-control" inputMode="decimal" value={salary} onChange={e => setSalary(e.target.value)}
          placeholder="1800" autoFocus={autoFocusOnPointer()} aria-label="Sueldo neto mensual"
          onKeyDown={e => e.key === 'Enter' && saveSalary()} />
        <span>€ / mes</span>
      </div>
      {error && <div className="alert alert-danger">{error}</div>}
      <button type="button" className={`btn btn-primary w-full ${saving ? 'is-busy' : ''}`} onClick={saveSalary} disabled={saving}>Continuar</button>
      <button type="button" className="btn btn-ghost w-full mt-2" onClick={() => go(0)}>Atrás</button>
    </div>,

    <div key="split" className="ob-step">
      <div className="ob-hero">🧭</div>
      <h2>Así se reparte tu nómina</h2>
      <p>Hemos empezado con un reparto recomendado. Puedes cambiarlo cuando quieras, en euros o en porcentaje.</p>
      {flow && (
        <>
          <div className="ob-bar">
            {flow.groups.map(g => <span key={g.id} style={{ flex: g.value, background: g.color }} title={g.label} />)}
          </div>
          <div className="ob-legend">
            {flow.groups.map(g => (
              <div key={g.id}><i style={{ background: g.color }} /> {g.label}<strong>{fmt(g.value)}</strong></div>
            ))}
          </div>
        </>
      )}
      <button type="button" className="btn btn-primary w-full" onClick={() => go(3)}>Me parece bien</button>
      <button type="button" className="btn btn-ghost w-full mt-2" onClick={() => finish('budget')}>Revisar el presupuesto</button>
    </div>,

    <div key="payday" className="ob-step">
      <div className="ob-hero">🗓️</div>
      <h2>Tu nómina abre cada ciclo</h2>
      <p>El mes empieza el día que cobras, no el día 1. Registra tu última nómina y todo empezará a contar desde ahí.</p>
      <button type="button" className="btn btn-primary w-full" onClick={() => { burstConfetti({ count: 60 }); finish('income') }}>
        <i className="fa fa-plus" /> Registrar mi nómina
      </button>
      <button type="button" className="btn btn-ghost w-full mt-2" onClick={() => finish()}>Más tarde</button>
    </div>,
  ]

  return (
    <div className="ob-overlay" role="dialog" aria-modal="true" aria-label="Bienvenida">
      <div className="ob-card">
        <div className="ob-dots" aria-hidden="true">
          {steps.map((_, i) => <span key={i} className={i === step ? 'on' : i < step ? 'done' : ''} />)}
        </div>
        {steps[step]}
      </div>
    </div>
  )
}
