import React, { useState } from 'react'
import { useApp } from '../App'
import { updateProfile, addFixedExpense, deleteFixedExpense, linkPartner, unlinkPartner } from '../lib/supabase'
import { fmt, fixedTotal, fixedPct } from '../lib/finance'
import { requestNotificationPermission, getNotificationPermission } from '../lib/notifications'

export default function Settings() {
  const { profile, setProfile, categories, fixedExpenses, partnerSummary, refresh } = useApp()
  const [salary, setSalary] = useState(profile?.salary || '')
  const [name, setName] = useState(profile?.name || '')
  const [birthYear, setBirthYear] = useState(profile?.birth_year || '')
  const [saved, setSaved] = useState(false)

  // Fixed expense form
  const [fxName, setFxName] = useState('')
  const [fxAmount, setFxAmount] = useState('')
  const [fxIcon, setFxIcon] = useState('')
  const [fxCat, setFxCat] = useState('')

  // API key
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('fp_apikey') || '')
  const [showKey, setShowKey] = useState(false)

  // Notifications
  const [notifPermission, setNotifPermission] = useState(() => getNotificationPermission())

  const handleEnableNotifications = async () => {
    const result = await requestNotificationPermission()
    setNotifPermission(result)
  }

  // Link partner (read-only summary, no shared data)
  const [joinCode, setJoinCode] = useState('')
  const [joinError, setJoinError] = useState('')
  const [joinLoading, setJoinLoading] = useState(false)
  const [showJoinForm, setShowJoinForm] = useState(false)
  const [unlinking, setUnlinking] = useState(false)

  const handleLinkPartner = async (e) => {
    e.preventDefault()
    setJoinError('')
    if (!joinCode.trim()) return
    setJoinLoading(true)
    try {
      await linkPartner(joinCode)
      await refresh()
      setJoinCode('')
      setShowJoinForm(false)
    } catch (err) {
      setJoinError(err.message)
    } finally {
      setJoinLoading(false)
    }
  }

  const handleUnlinkPartner = async () => {
    if (!window.confirm('¿Desvincular a tu pareja? Dejaréis de ver el resumen del otro.')) return
    setUnlinking(true)
    try {
      await unlinkPartner()
      await refresh()
    } finally {
      setUnlinking(false)
    }
  }

  const handleSaveProfile = async () => {
    const updated = await updateProfile(profile.id, {
      salary: parseFloat(salary) || 0,
      name: name.trim(),
      birth_year: parseInt(birthYear) || null
    })
    setProfile(updated)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleApiKeyChange = (val) => {
    setApiKey(val)
    if (val.trim()) localStorage.setItem('fp_apikey', val.trim())
    else localStorage.removeItem('fp_apikey')
  }

  const handleAddFixed = async (e) => {
    e.preventDefault()
    if (!fxName.trim() || !fxAmount) return
    await addFixedExpense({
      name: fxName.trim(),
      amount: parseFloat(fxAmount),
      icon: fxIcon.trim() || '📌',
      category_id: fxCat || null
    })
    await refresh()
    setFxName(''); setFxAmount(''); setFxIcon(''); setFxCat('')
  }

  const handleDeleteFixed = async (id) => {
    if (!window.confirm('¿Eliminar?')) return
    await deleteFixedExpense(id)
    refresh()
  }

  const fxTotal = fixedTotal(fixedExpenses)
  const fxPct = fixedPct(fixedExpenses, profile?.salary || 0)

  return (
    <div>
      <div className="page-header"><h2>Ajustes</h2><p>Tu información, pareja vinculada y configuración</p></div>

      <div className="grid-2 mb-4">
        <div className="card">
          <div className="section-header"><h3>Tu información</h3></div>
          <div className="form-group">
            <label>Sueldo neto mensual (€)</label>
            <input className="form-control" type="number" value={salary} onChange={e => setSalary(e.target.value)} placeholder="1800" />
            <div className="form-hint">Privado — solo tu pareja vinculada puede ver tu sueldo, dentro de su resumen.</div>
          </div>
          <div className="form-group">
            <label>Nombre</label>
            <input className="form-control" value={name} onChange={e => setName(e.target.value)} placeholder="María" />
          </div>
          <div className="form-group">
            <label>Año de nacimiento</label>
            <input className="form-control" type="number" value={birthYear} onChange={e => setBirthYear(e.target.value)} placeholder="2000" />
          </div>
          <button className="btn btn-primary w-full" onClick={handleSaveProfile}>
            <i className="fa fa-floppy-disk" /> {saved ? '✅ Guardado' : 'Guardar'}
          </button>
        </div>

        <div className="card">
          <div className="section-header"><h3>👫 Pareja vinculada</h3></div>
          <p className="text-xs text-muted mb-3">
            Vincula tu cuenta con la de tu pareja para ver un resumen de su estado (sueldo, % de presupuesto gastado, total ahorrado). Cada uno sigue gestionando sus propios movimientos y categorías por separado.
          </p>

          {profile?.partner_id ? (
            <>
              <div className="flex items-center justify-between mb-2" style={{ padding: '8px 0' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>{partnerSummary?.partner_name || 'Tu pareja'}</div>
                  <div className="text-xs text-muted">Vinculada · resumen de solo lectura</div>
                </div>
                <span className="text-muted">{partnerSummary?.partner_salary ? fmt(partnerSummary.partner_salary) : '—'}</span>
              </div>
              {partnerSummary && (
                <div className="grid-2 mb-3" style={{ gap: 8 }}>
                  <div className="stat-card" style={{ padding: '9px 12px' }}>
                    <div className="label">% presupuesto gastado</div>
                    <div className="value" style={{ fontSize: 16 }}>
                      {partnerSummary.budget_total > 0 ? Math.round(partnerSummary.cycle_expenses / partnerSummary.budget_total * 100) + '%' : '—'}
                    </div>
                  </div>
                  <div className="stat-card" style={{ padding: '9px 12px' }}>
                    <div className="label">Total ahorrado</div>
                    <div className="value" style={{ fontSize: 16 }}>
                      {fmt((partnerSummary.house_saved || 0) + (partnerSummary.saving_goals_total || 0))}
                    </div>
                  </div>
                </div>
              )}
              <button className="btn btn-ghost btn-sm" onClick={handleUnlinkPartner} disabled={unlinking}>
                <i className="fa fa-link-slash" /> {unlinking ? 'Desvinculando…' : 'Desvincular'}
              </button>
            </>
          ) : (
            <>
              <div className="form-group">
                <label>Tu código de invitación</label>
                <div className="flex gap-2">
                  <input
                    className="form-control" readOnly value={profile?.households?.invite_code || ''}
                    style={{ fontFamily: 'monospace', fontWeight: 600 }}
                  />
                  <button
                    className="btn btn-ghost btn-icon"
                    onClick={() => navigator.clipboard?.writeText(profile?.households?.invite_code || '')}
                  >
                    <i className="fa fa-copy" />
                  </button>
                </div>
              </div>
              <div className="form-hint mb-2">Comparte este código con tu pareja para que lo pegue desde su cuenta.</div>
              <hr className="divider" />
              {!showJoinForm ? (
                <button className="btn btn-ghost btn-sm" onClick={() => setShowJoinForm(true)}>
                  <i className="fa fa-user-group" /> Vincular pareja
                </button>
              ) : (
                <form onSubmit={handleLinkPartner}>
                  <div className="alert alert-info">
                    <i className="fa fa-circle-info" />
                    <div>Esto vincula tu cuenta con la de tu pareja. Cada uno sigue gestionando sus propios datos; solo podréis ver un resumen del otro.</div>
                  </div>
                  <div className="form-group">
                    <label>Código de invitación</label>
                    <input className="form-control" value={joinCode} onChange={e => setJoinCode(e.target.value)} placeholder="ej: a1b2c3d4" style={{ fontFamily: 'monospace' }} />
                  </div>
                  {joinError && <div className="alert alert-danger">{joinError}</div>}
                  <div className="flex gap-2">
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setShowJoinForm(false); setJoinError('') }}>Cancelar</button>
                    <button type="submit" className="btn btn-primary btn-sm" disabled={joinLoading}>
                      <i className="fa fa-check" /> {joinLoading ? 'Vinculando…' : 'Vincular'}
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
        </div>
      </div>

      <div className="card mb-4">
        <div className="section-header"><h3>🤖 API Key de IA</h3></div>
        <p className="text-xs text-muted mb-3">
          Necesaria para respuestas instantáneas del consejero IA. Se guarda solo en este navegador, no en la base de datos.
        </p>
        <div className="form-group">
          <label>API Key de Anthropic</label>
          <div className="flex gap-2">
            <input
              className="form-control" type={showKey ? 'text' : 'password'}
              value={apiKey} onChange={e => handleApiKeyChange(e.target.value)}
              placeholder="sk-ant-api03-…" style={{ fontFamily: 'monospace', fontSize: 12 }}
            />
            <button className="btn btn-ghost btn-icon" onClick={() => setShowKey(s => !s)}>
              <i className={`fa ${showKey ? 'fa-eye-slash' : 'fa-eye'}`} />
            </button>
          </div>
          <div className="text-xs mt-1" style={{ color: apiKey?.startsWith('sk-ant') ? 'var(--e5)' : 'var(--muted)' }}>
            {apiKey?.startsWith('sk-ant') ? '✓ API key configurada' : 'Sin API key — modo gratuito (copiar/pegar)'}
          </div>
        </div>
        <div className="alert alert-info" style={{ marginBottom: 0 }}>
          <i className="fa fa-circle-info" />
          <div>
            Consigue tu clave en{' '}
            <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--i6)', fontWeight: 500 }}>
              console.anthropic.com/settings/keys
            </a>
          </div>
        </div>
      </div>

      <div className="card mb-4">
        <div className="section-header"><h3>🔔 Notificaciones</h3></div>
        <p className="text-xs text-muted mb-3">
          Recibe un aviso cuando superes el 80% o el 100% del presupuesto en alguna categoría. Funciona mientras la app esté abierta o instalada en tu móvil.
        </p>
        {notifPermission === 'granted' ? (
          <div className="alert alert-success" style={{ marginBottom: 0 }}>
            <i className="fa fa-check" /> Notificaciones activadas
          </div>
        ) : notifPermission === 'denied' ? (
          <div className="alert alert-warning" style={{ marginBottom: 0 }}>
            <i className="fa fa-triangle-exclamation" /> Bloqueadas por el navegador. Actívalas manualmente en los ajustes del sitio.
          </div>
        ) : notifPermission === 'unsupported' ? (
          <div className="alert alert-info" style={{ marginBottom: 0 }}>
            <i className="fa fa-circle-info" /> Tu navegador no soporta notificaciones.
          </div>
        ) : (
          <button className="btn btn-primary" onClick={handleEnableNotifications}>
            <i className="fa fa-bell" /> Activar notificaciones
          </button>
        )}
      </div>

      <div className="grid-2 mb-4">
        <div className="card">
          <div className="section-header"><h3>Añadir gasto fijo</h3></div>
          <form onSubmit={handleAddFixed}>
            <div className="form-group">
              <label>Nombre</label>
              <input className="form-control" value={fxName} onChange={e => setFxName(e.target.value)} placeholder="Ej: Seguro coche, Spotify…" />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Importe mensual (€)</label>
                <input className="form-control" type="number" step="0.01" value={fxAmount} onChange={e => setFxAmount(e.target.value)} placeholder="0.00" />
              </div>
              <div className="form-group">
                <label>Emoji</label>
                <input className="form-control" value={fxIcon} onChange={e => setFxIcon(e.target.value)} maxLength={2} placeholder="🚗" style={{ fontSize: 17 }} />
              </div>
            </div>
            <div className="form-group">
              <label>Categoría</label>
              <select className="form-control" value={fxCat} onChange={e => setFxCat(e.target.value)}>
                <option value="">Sin categoría</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
              </select>
            </div>
            <button type="submit" className="btn btn-primary w-full"><i className="fa fa-plus" /> Añadir</button>
          </form>
        </div>

        <div className="card">
          <div className="section-header"><h3>Resumen de gastos fijos</h3></div>
          <div className="grid-3 mb-3" style={{ gap: 9 }}>
            <div className="stat-card red"><div className="label">Total/mes</div><div className="value text-red" style={{ fontSize: 19 }}>{fmt(fxTotal)}</div></div>
            <div className="stat-card amber"><div className="label">% sueldo</div><div className="value" style={{ fontSize: 19, color: fxPct > 40 ? 'var(--r5)' : fxPct > 25 ? 'var(--a5)' : 'var(--e5)' }}>{fxPct.toFixed(1)}%</div></div>
            <div className="stat-card indigo"><div className="label">Margen libre</div><div className="value" style={{ fontSize: 19 }}>{profile?.salary ? fmt(profile.salary - fxTotal) : '—'}</div></div>
          </div>
          {fixedExpenses.length === 0 ? (
            <div className="text-sm text-muted text-center" style={{ padding: 14 }}>Sin gastos fijos aún.</div>
          ) : fixedExpenses.map(f => (
            <div key={f.id} className="flex items-center gap-2" style={{ padding: '8px 0', borderBottom: '1px solid var(--g100)' }}>
              <span style={{ fontSize: 17 }}>{f.icon}</span>
              <span style={{ flex: 1, fontSize: 13 }}>{f.name}</span>
              <span className="text-xs text-muted">{f.categories?.name}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--r5)' }}>{fmt(f.amount)}/mes</span>
              <button onClick={() => handleDeleteFixed(f.id)} style={{ background: 'none', border: 'none', color: 'var(--g300)', cursor: 'pointer' }}>
                <i className="fa fa-xmark" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="section-header"><h3>% recomendados <span className="badge badge-indigo">Solo lectura</span></h3></div>
        <p className="text-xs text-muted mb-2">Referencia (regla 50/30/20 adaptada). Para cambiar tu distribución ve a Presupuesto.</p>
        {DEFAULT_REFERENCE.map(c => (
          <div key={c.id} className="flex items-center gap-2" style={{ padding: '7px 0', borderBottom: '1px solid var(--g100)' }}>
            <span>{c.icon}</span>
            <span style={{ flex: 1, fontSize: 13 }}>{c.name}</span>
            <span className={`badge ${c.type === 'saving' ? 'badge-green' : c.type === 'pot' ? 'badge-amber' : 'badge-gray'}`}>{c.defPct}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

const DEFAULT_REFERENCE = [
  { id: 'transport', name: 'Transporte', icon: '⛽', defPct: 8, type: 'normal' },
  { id: 'subscriptions', name: 'Suscripciones', icon: '📱', defPct: 4, type: 'normal' },
  { id: 'gym', name: 'Gimnasio', icon: '💪', defPct: 3, type: 'normal' },
  { id: 'food', name: 'Comida diaria', icon: '🛒', defPct: 12, type: 'normal' },
  { id: 'leisure', name: 'Ocio', icon: '🎉', defPct: 8, type: 'normal' },
  { id: 'clothes', name: 'Ropa', icon: '👗', defPct: 5, type: 'pot' },
  { id: 'gifts', name: 'Regalos', icon: '🎁', defPct: 4, type: 'pot' },
  { id: 'travel', name: 'Viajes', icon: '✈️', defPct: 6, type: 'pot' },
  { id: 'emergency', name: 'Imprevistos', icon: '🛡️', defPct: 5, type: 'pot' },
  { id: 'savings', name: 'Ahorro casa', icon: '🏠', defPct: 10, type: 'saving' },
  { id: 'investment', name: 'Inversión', icon: '📈', defPct: 10, type: 'saving' },
]
