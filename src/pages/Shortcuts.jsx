import React, { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useApp } from '../App'
import {
  getShortcutToken, createShortcutToken, revokeShortcutToken,
  getMerchantRules, saveMerchantRule, deleteMerchantRule, updateTransaction,
} from '../lib/supabase'
import { fmt } from '../lib/finance'
import { merchantKey, expenseCategories } from '../lib/shortcuts'
import { confirmDialog, toast } from '../lib/dialog'
import { haptic } from '../lib/ui'

// Ajustes → Atajos de iPhone: the personal token the shortcuts use,
// step-by-step recipes to build each shortcut, expenses that came in
// without a category, and the shop rules learnt along the way.

const copy = async (text, what = 'Copiado') => {
  try {
    await navigator.clipboard.writeText(text)
    haptic('success')
    toast({ text: what, icon: 'fa-copy' })
  } catch {
    toast({ text: 'No se ha podido copiar', tone: 'danger' })
  }
}

function CopyField({ label, value, secret }) {
  return (
    <div className="sc-field">
      <span className="sc-field-label">{label}</span>
      <code className="sc-field-value">{secret ? value.replace(/^(Bearer mp_).+(.{4})$/, '$1••••$2') : value}</code>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => copy(value, `${label} copiado`)} aria-label={`Copiar ${label}`}>
        <i className="fa fa-copy" />
      </button>
    </div>
  )
}

// A Shortcuts action name, as it appears in the app's search.
const A = ({ children }) => <strong className="sc-action">{children}</strong>
const K = ({ children }) => <code className="sc-key">{children}</code>

function Guide({ icon, title, sub, children, open }) {
  return (
    <details className="sc-guide" open={open}>
      <summary>
        <span className="sc-guide-icon"><i className={`fa ${icon}`} /></span>
        <span className="sc-guide-text"><strong>{title}</strong><small>{sub}</small></span>
        <i className="fa fa-chevron-down sc-chev" />
      </summary>
      <ol className="sc-steps">{children}</ol>
    </details>
  )
}

export default function Shortcuts() {
  const { categories, transactions, refresh } = useApp()
  const { hash } = useLocation()
  const [token, setToken] = useState(undefined) // undefined = loading, null = none
  const [fresh, setFresh] = useState(null) // the token in clear, only right after creating it
  const [rules, setRules] = useState([])
  const [setupError, setSetupError] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = async () => {
    try {
      const [t, r] = await Promise.all([getShortcutToken(), getMerchantRules()])
      setToken(t)
      setRules(r || [])
      setSetupError(null)
    } catch (err) {
      setToken(null)
      setSetupError(/shortcut_tokens|merchant_rules|does not exist|schema cache/i.test(err.message)
        ? 'Falta aplicar supabase_patch_shortcuts.sql en Supabase.'
        : err.message)
    }
  }
  useEffect(() => { load() }, [])

  useEffect(() => {
    if (hash === '#pendientes') setTimeout(() => document.getElementById('pendientes')?.scrollIntoView({ behavior: 'smooth' }), 300)
  }, [hash])

  const base = `${window.location.origin}/api/shortcut`
  const auth = fresh ? `Bearer ${fresh}` : null
  const cats = useMemo(() => expenseCategories(categories), [categories])
  const catName = (id) => categories.find(c => c.id === id)
  const pending = useMemo(
    () => transactions.filter(t => t.type === 'expense' && t.needs_review),
    [transactions]
  )

  const generate = async () => {
    if (token) {
      const ok = await confirmDialog({
        icon: 'fa-key', destructive: true, confirmText: 'Generar otro',
        title: '¿Generar un token nuevo?',
        message: 'El actual deja de funcionar al momento: tendrás que pegar el nuevo en cada atajo.',
      })
      if (!ok) return
    }
    setBusy(true)
    try {
      const t = await createShortcutToken()
      setFresh(t)
      haptic('success')
      await load()
    } catch (err) {
      toast({ text: err.message, tone: 'danger' })
    } finally {
      setBusy(false)
    }
  }

  const revoke = async () => {
    const ok = await confirmDialog({
      icon: 'fa-ban', destructive: true, confirmText: 'Revocar',
      title: '¿Revocar el token?', message: 'Los atajos dejarán de funcionar hasta que generes uno nuevo.',
    })
    if (!ok) return
    await revokeShortcutToken()
    setFresh(null)
    await load()
  }

  return (
    <div>
      <div className="page-header"><h2>Atajos de iPhone</h2><p>Apunta gastos y consulta tu presupuesto sin abrir la app</p></div>

      {setupError && <div className="alert alert-danger mb-4"><i className="fa fa-triangle-exclamation" /> {setupError}</div>}

      {pending.length > 0 && (
        <PendingCard pending={pending} cats={cats} refresh={refresh} onLearnt={load} />
      )}

      <div className="card mb-4">
        <div className="section-header"><h3><i className="fa fa-key" style={{ color: 'var(--a5)', marginRight: 8 }} />Tu token personal</h3></div>
        <p className="text-sm text-muted mb-3">Es la llave que usan tus atajos. Trátalo como una contraseña: quien lo tenga puede apuntar gastos en tu cuenta y ver tus saldos.</p>

        {fresh ? (
          <div className="alert alert-warning mb-3" style={{ display: 'block' }}>
            <strong>Cópialo ahora:</strong> por seguridad no se vuelve a mostrar.
            <div className="sc-token mt-2">
              <code>{fresh}</code>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => copy(fresh, 'Token copiado')}><i className="fa fa-copy" /> Copiar</button>
            </div>
          </div>
        ) : token ? (
          <div className="sc-token-info mb-3">
            <div><span className="text-muted">Token</span> <code>mp_••••{token.token_hint}</code></div>
            <div className="text-xs text-muted">
              Creado el {new Date(token.created_at).toLocaleDateString('es-ES')}
              {' · '}{token.last_used_at ? `último uso ${new Date(token.last_used_at).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}` : 'aún sin usar'}
            </div>
          </div>
        ) : null}

        <div className="flex gap-1" style={{ flexWrap: 'wrap' }}>
          <button className={`btn ${token ? 'btn-ghost' : 'btn-primary'} btn-sm`} onClick={generate} disabled={busy || token === undefined || !!setupError}>
            <i className="fa fa-wand-magic-sparkles" /> {token ? 'Generar uno nuevo' : 'Generar token'}
          </button>
          {token && <button className="btn btn-ghost btn-sm" onClick={revoke}><i className="fa fa-ban" /> Revocar</button>}
        </div>
      </div>

      <div className="card mb-4">
        <div className="section-header"><h3><i className="fa fa-list-check" style={{ color: 'var(--a5)', marginRight: 8 }} />Crea tus atajos</h3></div>
        <p className="text-sm text-muted mb-3">
          Se montan una vez en la app <strong>Atajos</strong> del iPhone. En cada <A>Obtener contenido de URL</A> despliega las opciones y añade la cabecera
          {' '}<K>Authorization</K> con el valor de abajo.
        </p>
        <CopyField label="Cabecera" value={auth || 'Bearer TU_TOKEN'} secret={!!auth} />
        {!auth && <p className="text-xs text-muted mt-1 mb-2">Genera un token arriba para copiar la cabecera completa (el valor es «Bearer», un espacio y el token).</p>}

        <Guide icon="fa-credit-card" title="Apuntar al pagar" sub="Automático con Apple Pay" open>
          <li>En Atajos ve a <strong>Automatización</strong> → <strong>+</strong> → <strong>Transacción</strong>. Elige tus tarjetas, marca <strong>Ejecutar inmediatamente</strong> y crea un <strong>Nuevo atajo en blanco</strong>.</li>
          <li>Añade <A>Obtener contenido de URL</A> con esta URL:<CopyField label="URL" value={`${base}?action=expense`} />
            Método <K>POST</K>, la cabecera <K>Authorization</K> y en <strong>Cuerpo de la solicitud</strong> → <strong>JSON</strong>:
            <ul className="sc-fields">
              <li><K>amount</K> (Texto) → variable <strong>Importe</strong></li>
              <li><K>merchant</K> (Texto) → variable <strong>Comercio</strong></li>
              <li><K>source</K> (Texto) → <K>pay</K></li>
              <li><K>ask</K> (Booleano) → Verdadero</li>
            </ul>
          </li>
          <li>Añade <A>Obtener valor del diccionario</A>: valor de <K>status</K> en <strong>Contenido de URL</strong>.</li>
          <li>Añade <A>Si</A>: <strong>Valor del diccionario</strong> <em>es</em> <K>ask</K>. Así sabrás que es un comercio nuevo.</li>
          <li>Dentro del <strong>Si</strong>:
            <ul className="sc-fields">
              <li><A>Obtener valor del diccionario</A>: <K>categories</K> del primer Contenido de URL</li>
              <li><A>Elegir de la lista</A> con el mensaje «¿Categoría?»</li>
              <li>Duplica la acción del paso 2, borra <K>ask</K> y añade <K>category</K> (Texto) → <strong>Elemento elegido</strong></li>
              <li><A>Obtener valor del diccionario</A>: <K>message</K> de ese último Contenido de URL → <A>Mostrar notificación</A></li>
            </ul>
          </li>
          <li>En <strong>De lo contrario</strong>: <A>Obtener valor del diccionario</A> <K>message</K> del primer Contenido de URL → <A>Mostrar notificación</A>.</li>
          <li className="sc-note">Solo salta con Apple Pay (iPhone o Watch), no con la tarjeta física. La primera vez en cada comercio te pregunta la categoría; luego se acuerda. Si el menú aparece como notificación, tócala para elegir.</li>
        </Guide>

        <Guide icon="fa-bolt" title="Gasto rápido" sub="Toque trasero, botón de Acción o Centro de control">
          <li>Crea un atajo nuevo llamado <strong>Gasto rápido</strong>.</li>
          <li><A>Pedir entrada</A> de tipo <strong>Número</strong>: «¿Cuánto?».</li>
          <li><A>Obtener contenido de URL</A> (método GET, con la cabecera):<CopyField label="URL" value={`${base}?action=categories`} /></li>
          <li><A>Obtener valor del diccionario</A> <K>categories</K> → <A>Elegir de la lista</A> «¿Categoría?».</li>
          <li><A>Pedir entrada</A> de tipo <strong>Texto</strong>: «Nota (opcional)».</li>
          <li><A>Obtener contenido de URL</A> POST, con la cabecera y JSON:<CopyField label="URL" value={`${base}?action=expense`} />
            <ul className="sc-fields">
              <li><K>amount</K> (Número) → la primera <strong>Entrada proporcionada</strong></li>
              <li><K>category</K> (Texto) → <strong>Elemento elegido</strong></li>
              <li><K>note</K> (Texto) → la segunda <strong>Entrada proporcionada</strong></li>
            </ul>
          </li>
          <li><A>Obtener valor del diccionario</A> <K>message</K> → <A>Mostrar notificación</A>.</li>
          <li>Asígnalo: <strong>Ajustes → Accesibilidad → Tocar → Toque posterior → Doble toque</strong>. En iPhone 15 Pro o posterior también en <strong>Ajustes → Botón de Acción</strong>, y en iOS 18 como control del <strong>Centro de control</strong>.</li>
          <li className="sc-note">Para el efectivo y la tarjeta física. Elige «Decidir luego» si no lo tienes claro: queda en Pendientes de revisar.</li>
        </Guide>

        <Guide icon="fa-chart-pie" title="¿Cuánto me queda?" sub="Siri y widget">
          <li>Crea un atajo llamado <strong>Cuánto me queda</strong>.</li>
          <li><A>Obtener contenido de URL</A> (GET, con la cabecera):<CopyField label="URL" value={`${base}?action=summary`} /></li>
          <li><A>Obtener valor del diccionario</A> <K>message</K> → <A>Mostrar resultado</A>.</li>
          <li>Dile <strong>«Oye Siri, cuánto me queda»</strong>. Para una sola categoría, duplica el atajo, añade <K>&category=Ocio</K> al final de la URL y llámalo «Cuánto me queda en ocio».</li>
          <li>Widget: mantén pulsada la pantalla de inicio → <strong>Editar → Añadir widget → Atajos</strong> y elige este atajo. Lo tocas y te responde.</li>
        </Guide>

        <Guide icon="fa-rotate-left" title="Bizum recibido" sub="Te devuelven tu parte de una ronda">
          <li>Crea un atajo llamado <strong>Bizum recibido</strong>.</li>
          <li><A>Obtener contenido de URL</A> (GET, con la cabecera):<CopyField label="URL" value={`${base}?action=recent`} /></li>
          <li><A>Obtener valor del diccionario</A> <K>labels</K> → <A>Elegir de la lista</A> «¿Qué gasto te han devuelto?».</li>
          <li><A>Pedir entrada</A> de tipo <strong>Número</strong>: «¿Cuánto te han devuelto?».</li>
          <li><A>Obtener contenido de URL</A> POST, con la cabecera y JSON:<CopyField label="URL" value={`${base}?action=refund`} />
            <ul className="sc-fields">
              <li><K>amount</K> (Número) → <strong>Entrada proporcionada</strong></li>
              <li><K>expense</K> (Texto) → <strong>Elemento elegido</strong></li>
            </ul>
          </li>
          <li><A>Obtener valor del diccionario</A> <K>message</K> → <A>Mostrar notificación</A>.</li>
          <li className="sc-note">Se apunta como reembolso enlazado al gasto, igual que desde la app: devuelve el dinero a su categoría o bote.</li>
        </Guide>
      </div>

      <RulesCard rules={rules} cats={cats} catName={catName} reload={load} />
    </div>
  )
}

function PendingCard({ pending, cats, refresh, onLearnt }) {
  const [choice, setChoice] = useState({})
  const [learn, setLearn] = useState({})
  const [saving, setSaving] = useState(null)

  const save = async (t) => {
    const categoryId = choice[t.id]
    if (!categoryId) return
    setSaving(t.id)
    try {
      await updateTransaction(t.id, { category_id: categoryId, needs_review: false })
      const key = merchantKey(t.description)
      if (learn[t.id] !== false && key && t.source === 'shortcut-pay') {
        await saveMerchantRule({ merchantKey: key, merchantLabel: t.description, categoryId })
        onLearnt()
      }
      haptic('success')
      await refresh(['transactions'])
    } catch (err) {
      toast({ text: err.message, tone: 'danger' })
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="card mb-4" id="pendientes">
      <div className="section-header">
        <h3><i className="fa fa-inbox" style={{ color: 'var(--a5)', marginRight: 8 }} />Pendientes de revisar</h3>
        <span className="badge badge-amber">{pending.length}</span>
      </div>
      <p className="text-sm text-muted mb-3">Gastos que entraron desde un atajo sin categoría. Cuentan en el total del ciclo, pero no en ninguna categoría hasta que se la pongas.</p>
      {pending.map(t => (
        <div key={t.id} className="sc-pending">
          <div className="sc-pending-head">
            <div>
              <strong>{t.description}</strong>
              <div className="text-xs text-muted">{new Date(t.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}{t.notes ? ` · ${t.notes}` : ''}</div>
            </div>
            <strong>{fmt(t.amount)}</strong>
          </div>
          <div className="sc-pending-actions">
            <select className="form-control" value={choice[t.id] || ''} onChange={e => setChoice(c => ({ ...c, [t.id]: e.target.value }))} aria-label={`Categoría para ${t.description}`}>
              <option value="">Elige categoría…</option>
              {cats.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
            </select>
            <button className="btn btn-primary btn-sm" disabled={!choice[t.id] || saving === t.id} onClick={() => save(t)}>
              {saving === t.id ? <i className="fa fa-spinner fa-spin" /> : 'Guardar'}
            </button>
          </div>
          {t.source === 'shortcut-pay' && merchantKey(t.description) && (
            <label className="sc-learn">
              <input type="checkbox" checked={learn[t.id] !== false} onChange={e => setLearn(l => ({ ...l, [t.id]: e.target.checked }))} />
              Usar siempre esta categoría en {t.description}
            </label>
          )}
        </div>
      ))}
    </div>
  )
}

function RulesCard({ rules, cats, catName, reload }) {
  const change = async (r, categoryId) => {
    try {
      await saveMerchantRule({ merchantKey: r.merchant_key, merchantLabel: r.merchant_label, categoryId })
      haptic('select')
      reload()
    } catch (err) {
      toast({ text: err.message, tone: 'danger' })
    }
  }
  const remove = async (r) => {
    const ok = await confirmDialog({
      icon: 'fa-trash', destructive: true, confirmText: 'Olvidar',
      title: `¿Olvidar ${r.merchant_label}?`, message: 'La próxima vez que pagues ahí te volverá a preguntar la categoría.',
    })
    if (!ok) return
    await deleteMerchantRule(r.merchant_key)
    reload()
  }

  return (
    <div className="card mb-4">
      <div className="section-header"><h3><i className="fa fa-store" style={{ color: 'var(--a5)', marginRight: 8 }} />Comercios aprendidos</h3></div>
      {rules.length === 0 ? (
        <p className="text-sm text-muted">Aún ninguno. Cuando elijas la categoría de un comercio nuevo desde el atajo, aparecerá aquí.</p>
      ) : rules.map(r => (
        <div key={r.merchant_key} className="sc-rule">
          <span className="sc-rule-name">{r.merchant_label}</span>
          <select className="form-control" value={r.category_id} onChange={e => change(r, e.target.value)} aria-label={`Categoría de ${r.merchant_label}`}>
            {!catName(r.category_id) && <option value={r.category_id}>(categoría borrada)</option>}
            {cats.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
          </select>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => remove(r)} aria-label={`Olvidar ${r.merchant_label}`}><i className="fa fa-trash" /></button>
        </div>
      ))}
    </div>
  )
}
