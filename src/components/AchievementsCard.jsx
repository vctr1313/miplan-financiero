import React, { useEffect, useMemo, useState } from 'react'
import { ACHIEVEMENTS, earnedNow, loadEarned, mergeEarned, saveEarned } from '../lib/achievements'
import { burstConfetti } from '../lib/confetti'
import { toast } from '../lib/dialog'
import { haptic } from '../lib/ui'

// Home card: the current on-pace streak and the achievement badges.
// A badge earned since last time gets confetti and a toast -- except
// the very first time this runs on a device, when everything the user
// already qualifies for is recorded quietly instead of set off at once.
export default function AchievementsCard({ streak, data }) {
  const [earned, setEarned] = useState(loadEarned)
  const [open, setOpen] = useState(false)
  const nowIds = useMemo(() => earnedNow(data), [data])

  useEffect(() => {
    const stored = loadEarned()
    const firstRun = Object.keys(stored).length === 0
    const { merged, fresh } = mergeEarned(stored, nowIds)
    if (!fresh.length) return
    saveEarned(merged)
    setEarned(merged)
    if (firstRun) return
    const first = ACHIEVEMENTS.find(a => a.id === fresh[0])
    haptic('success')
    burstConfetti({ count: 90 })
    toast({ text: `Logro desbloqueado: ${first.icon} ${first.title}`, icon: 'fa-trophy', duration: 4500 })
  }, [nowIds])

  const count = ACHIEVEMENTS.filter(a => earned[a.id]).length
  return (
    <>
      <button type="button" className="card mb-4 ach-card" onClick={() => setOpen(true)}>
        <div className="ach-streak">
          <span className={`ach-flame ${streak.current > 0 ? 'lit' : ''}`}>🔥</span>
          <div>
            <div className="ach-streak-num">{streak.current} {streak.current === 1 ? 'día' : 'días'}</div>
            <div className="ach-streak-sub">
              {streak.current > 0 ? 'seguidos al ritmo de tu presupuesto' : 'Gasta al ritmo del presupuesto para empezar una racha'}
              {streak.best > streak.current && ` · récord del ciclo: ${streak.best}`}
            </div>
          </div>
        </div>
        <div className="ach-badges" aria-label={`${count} de ${ACHIEVEMENTS.length} logros`}>
          {ACHIEVEMENTS.map(a => (
            <span key={a.id} className={`ach-badge ${earned[a.id] ? 'on' : ''}`} title={a.title}>{a.icon}</span>
          ))}
          <span className="ach-count">{count}/{ACHIEVEMENTS.length}</span>
        </div>
      </button>

      {open && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setOpen(false)}>
          <div className="modal" style={{ maxWidth: 440 }}>
            <h3 className="modal-title">Logros</h3>
            <p className="text-sm text-muted mb-3">{count} de {ACHIEVEMENTS.length} conseguidos. Se guardan en este dispositivo.</p>
            <div className="ach-list">
              {ACHIEVEMENTS.map(a => (
                <div key={a.id} className={`ach-row ${earned[a.id] ? 'on' : ''}`}>
                  <span className="ach-row-icon">{a.icon}</span>
                  <div className="ach-row-text">
                    <strong>{a.title}</strong>
                    <span>{a.text}</span>
                  </div>
                  {earned[a.id]
                    ? <span className="ach-date">{new Date(earned[a.id]).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}</span>
                    : <i className="fa fa-lock ach-lock" />}
                </div>
              ))}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-primary" onClick={() => setOpen(false)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
