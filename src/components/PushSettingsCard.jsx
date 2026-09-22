import React, { useEffect, useState } from 'react'
import { pushSupport, notificationPermission, currentPushSubscription, enablePush, disablePush, sendTestPush } from '../lib/push'

// Settings card for the daily push alerts. The switch is per device:
// each phone/computer subscribes on its own.
export default function PushSettingsCard() {
  const support = pushSupport()
  const [on, setOn] = useState(null) // null while checking
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null) // { tone, text }

  useEffect(() => {
    let alive = true
    currentPushSubscription()
      .then(sub => alive && setOn(!!sub && notificationPermission() === 'granted'))
      .catch(() => alive && setOn(false))
    return () => { alive = false }
  }, [])

  const run = async (fn, okText) => {
    setBusy(true)
    setMsg(null)
    try {
      await fn()
      if (okText) setMsg({ tone: 'success', text: okText })
    } catch (err) {
      setMsg({ tone: 'danger', text: err.message })
    } finally {
      setBusy(false)
    }
  }

  const toggle = () => on
    ? run(async () => { await disablePush(); setOn(false) })
    : run(async () => { await enablePush(); setOn(true) }, 'Listo. Te llegará un aviso a las 20:00 cuando haya algo que contar.')

  return (
    <div className="card mb-4">
      <div className="section-header">
        <h3><i className="fa fa-bell" style={{ color: 'var(--a5)', marginRight: 8 }} />Avisos en este dispositivo</h3>
      </div>
      <ul className="push-list">
        <li><i className="fa fa-gauge-high" /> Una categoría llega al 80 % o se pasa del presupuesto</li>
        <li><i className="fa fa-piggy-bank" /> Un bote se queda en negativo</li>
        <li><i className="fa fa-flag-checkered" /> Resumen del ciclo al cobrar la nómina</li>
      </ul>
      <p className="text-xs text-muted mb-3">
        Cada día a las 20:00, solo si hay algo nuevo, y todo junto en un único aviso. Cada aviso se envía una vez por ciclo.
      </p>

      {support === 'ios-install' ? (
        <div className="alert alert-info" style={{ marginBottom: 0 }}>
          <i className="fa fa-circle-info" /> En iPhone, primero instala la app: en Safari pulsa <strong>Compartir → Añadir a pantalla de inicio</strong>, ábrela desde el icono y activa los avisos aquí.
        </div>
      ) : support === 'unsupported' ? (
        <div className="alert alert-info" style={{ marginBottom: 0 }}>
          <i className="fa fa-circle-info" /> Este navegador no admite notificaciones push.
        </div>
      ) : (
        <>
          <div className="sb-row share-toggle push-toggle" onClick={() => !busy && on !== null && toggle()}
            role="switch" aria-checked={!!on} aria-disabled={busy || on === null}>
            <span className="sb-label">{on ? 'Avisos activados' : 'Activar avisos'}</span>
            <div className={`switch ${on ? 'on' : ''}`}><div className="switch-knob" /></div>
          </div>
          {on && (
            <button className="btn btn-ghost btn-sm mt-3" disabled={busy}
              onClick={() => run(sendTestPush, 'Aviso de prueba enviado. Debería llegarte en unos segundos.')}>
              <i className="fa fa-paper-plane" /> Enviar aviso de prueba
            </button>
          )}
        </>
      )}
      {msg && <div className={`alert alert-${msg.tone} mt-3`} style={{ marginBottom: 0 }}>{msg.text}</div>}
    </div>
  )
}
