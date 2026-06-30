import React, { useState, useEffect } from 'react'
import { useApp } from '../App'
import { updateProfile, addFixedExpense, deleteFixedExpense, getHouseholdMembers, joinHousehold } from '../lib/supabase'
import { fmt, fixedTotal, fixedPct } from '../lib/finance'
import { requestNotificationPermission, getNotificationPermission } from '../lib/notifications'

export default function Settings() {
  const { profile, setProfile, categories, fixedExpenses, refresh } = useApp()
  const [salary, setSalary] = useState(profile?.salary || '')
  const [name, setName] = useState(profile?.name || '')
  const [birthYear, setBirthYear] = useState(profile?.birth_year || '')
  const [saved, setSaved] = useState(false)
  const [members, setMembers] = useState([])

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

  // Join another household
  const [joinCode, setJoinCode] = useState('')
  const [joinError, setJoinError] = useState('')
  const [joinLoading, setJoinLoading] = useState(false)
  const [showJoinForm, setShowJoinForm] = useState(false)

  const handleJoinHousehold = async (e) => {
    e.preventDefault()
    setJoinError('')
    if (!joinCode.trim()) return
    setJoinLoading(true)
    try {
      await joinHousehold(joinCode)
      await refresh()
      setJoinCode('')
      setShowJoinForm(false)
    } catch (err) {
      setJoinError(err.message)
    } finally {
      setJoinLoading(false)
    }
  }

  useEffect(() => {
    if (profile?.household_id) {
      getHouseholdMembers(profile.household_id).then(setMembers).catch(() => {})
    }
  }, [profile?.household_id])

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
      <div className="page-header"><h2>Ajustes</h2><p>Tu información, hogar compartido y configuración</p></div>

      <div className="grid-2 mb-4">
        <div className="card">
          <div className="section-header"><h3>Tu información</h3></div>
          <div className="form-group">
            <label>Sueldo neto mensual (€)</label>
            <input className="form-control" type="number" value={salary} onChange={e => setSalary(e.target.value)} placeholder="1800" />
            <div className="form-hint">Visible solo para ti y los miembros de tu hogar.</div>
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
          <div className="section-header"><h3>👫 Hogar compartido</h3></div>
          <p className="text-xs text-muted mb-3">
            Comparte este código con tu pareja para que se una a tu hogar y veáis los datos juntos.
          </p>
          <div className="form-group">
            <label>Código de invitación</label>
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
          <div className="form-hint mb-2">Tu pareja debe ir a "Unirme a hogar" en el login y pegar este código.</div>
          {members.length > 0 && (
            <>
              <hr className="divider" />
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--g700)', marginBottom: 8 }}>Miembros del hogar ({members.length})</div>
              {members.map(m => (
                <div key={m.id} className="flex items-center justify-between" style={{ padding: '6px 0', fontSize: 13 }}>
                  <span>{m.name || 'Sin nombre'} {m.id === profile.id && <span className="badge badge-indigo">Tú</span>}</span>
                  <span className="text-muted">{m.salary ? fmt(m.salary) : '—'}</span>
                </div>
              ))}
            </>
          )}
          <hr className="divider" />
          {!showJoinForm ? (
            <button className="btn btn-ghost btn-sm" onClick={() => setShowJoinForm(true)}>
              <i className="fa fa-user-group" /> Unirme a otro hogar
            </button>
          ) : (
            <form onSubmit={handleJoinHousehold}>
              <div className="alert alert-warning">
                <i className="fa fa-triangle-exclamation" />
                <div>Esto mueve tus movimientos a ese hogar y dejas el actual. No afecta a los datos de tus compañeros de hogar actuales.</div>
              </div>
              <div className="form-group">
                <label>Código de invitación</label>
                <input className="form-control" value={joinCode} onChange={e => setJoinCode(e.target.value)} placeholder="ej: a1b2c3d4" style={{ fontFamily: 'monospace' }} />
              </div>
              {joinError && <div className="alert alert-danger">{joinError}</div>}
              <div className="flex gap-2">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setShowJoinForm(false); setJoinError('') }}>Cancelar</button>
                <button type="submit" className="btn btn-primary btn-sm" disabled={joinLoading}>
                  <i className="fa fa-check" /> {joinLoading ? 'Uniéndome…' : 'Unirme'}
                </button>
              </div>
            </form>
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
            <a href="#" onClick={(e) => { e.preventDefault(); window.open('https://console.anthropic.com/settings/keys', '_blank', 'noopener') }} style={{ color: 'var(--i6)', fontWeight: 500 }}>
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
