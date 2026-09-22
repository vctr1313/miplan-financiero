import React, { useEffect, useRef, useState } from 'react'
import { subscribeDialogs, answerDialog, actToast, flushToasts } from '../lib/dialog'
import { haptic } from '../lib/ui'

// Renders the dialogs and toasts queued through lib/dialog.js. Mounted
// once, at the root of the app.
export default function DialogHost() {
  const [{ dialogs, toasts }, setState] = useState({ dialogs: [], toasts: [] })
  useEffect(() => subscribeDialogs(setState), [])

  // Leaving the app (switching away on the phone, closing the tab)
  // commits anything still waiting behind a "Deshacer".
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') flushToasts() }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', flushToasts)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', flushToasts)
    }
  }, [])

  const dialog = dialogs[0]
  return (
    <>
      {dialog && <AlertDialog key={dialog.id} dialog={dialog} />}
      <div className="toast-stack" aria-live="polite">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.tone}`} role="status">
            {t.icon && <i className={`fa ${t.icon} toast-icon`} />}
            <span className="toast-text">{t.text}</span>
            {t.actionText && (
              <button type="button" className="toast-action" onClick={() => { haptic('light'); actToast(t.id) }}>
                {t.actionText}
              </button>
            )}
            <span className="toast-timer" style={{ animationDuration: `${t.duration}ms` }} />
          </div>
        ))}
      </div>
    </>
  )
}

function AlertDialog({ dialog }) {
  const primary = useRef(null)
  const isConfirm = dialog.kind === 'confirm'
  const cancel = () => answerDialog(dialog.id, isConfirm ? false : undefined)
  const ok = () => answerDialog(dialog.id, isConfirm ? true : undefined)

  useEffect(() => {
    if (dialog.destructive) haptic('warning')
    // Focusing a button never opens the on-screen keyboard, so this is
    // safe on phones too; it makes Enter/Escape work on desktop.
    primary.current?.focus()
    const onKey = (e) => { if (e.key === 'Escape') cancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="alert-overlay" onClick={e => e.target === e.currentTarget && cancel()}>
      <div className="alert-box" role="alertdialog" aria-modal="true" aria-labelledby={`dlg-${dialog.id}`}>
        {dialog.icon && (
          <div className={`alert-box-icon ${dialog.destructive ? 'danger' : ''}`}><i className={`fa ${dialog.icon}`} /></div>
        )}
        <h3 id={`dlg-${dialog.id}`} className="alert-box-title">{dialog.title}</h3>
        {dialog.message && <p className="alert-box-msg">{dialog.message}</p>}
        <div className={`alert-box-actions ${isConfirm ? 'two' : ''}`}>
          {isConfirm && <button type="button" onClick={cancel}>{dialog.cancelText}</button>}
          <button type="button" ref={primary} onClick={ok} className={`primary ${dialog.destructive ? 'danger' : ''}`}>
            {isConfirm ? dialog.confirmText : dialog.okText}
          </button>
        </div>
      </div>
    </div>
  )
}
