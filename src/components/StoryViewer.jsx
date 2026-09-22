import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import AnimatedNumber from './AnimatedNumber'
import { fmt } from '../lib/finance'
import { haptic } from '../lib/ui'
import { burstConfetti } from '../lib/confetti'

const DURATION = 5500
const pct = (x) => `${Math.round(x * 100)} %`
const longDate = (iso) => new Date(iso).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })

// Full-screen stories (Instagram / Spotify Wrapped style) for slides
// from lib/story.js. Tap the right side for next, left for back, hold
// to pause; they also advance on their own. Arrow keys and Esc work.
export default function StoryViewer({ slides, onClose }) {
  const [i, setI] = useState(0)
  const [paused, setPaused] = useState(false)
  const holdStart = useRef(0)
  const slide = slides[i]

  const next = useCallback(() => {
    haptic('light')
    setI(n => { if (n >= slides.length - 1) { onClose(); return n } return n + 1 })
  }, [slides.length, onClose])
  const prev = () => { haptic('light'); setI(n => Math.max(0, n - 1)) }

  useEffect(() => {
    if (paused) return
    const t = setTimeout(next, DURATION)
    return () => clearTimeout(t)
  }, [i, paused, next])

  useEffect(() => {
    if (slide?.kind === 'saved' && slide.amount > 0) burstConfetti({ count: 80 })
  }, [slide])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight' || e.key === ' ') next()
      else if (e.key === 'ArrowLeft') prev()
    }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prevOverflow }
  }, [next, onClose])

  // A short tap navigates; holding just pauses.
  const down = () => { holdStart.current = Date.now(); setPaused(true) }
  const up = (e) => {
    setPaused(false)
    if (Date.now() - holdStart.current > 250) return
    const x = e.clientX / window.innerWidth
    if (x < 0.3) prev(); else next()
  }

  return createPortal(
    <div className={`story story-${slide.kind}`} role="dialog" aria-modal="true" aria-label="Historia"
      onPointerDown={down} onPointerUp={up} onPointerCancel={() => setPaused(false)}>
      <div className="story-bars" aria-hidden="true">
        {slides.map((_, n) => (
          <span key={n}><i className={n < i ? 'done' : n === i ? `run ${paused ? 'paused' : ''}` : ''}
            style={n === i ? { animationDuration: `${DURATION}ms` } : undefined} /></span>
        ))}
      </div>
      <button type="button" className="story-close" aria-label="Cerrar"
        onPointerDown={e => e.stopPropagation()} onPointerUp={e => e.stopPropagation()} onClick={onClose}>
        <i className="fa fa-xmark" />
      </button>
      <div className="story-body" key={i} aria-live="polite">
        <Slide s={slide} />
      </div>
      <div className="story-hint" aria-hidden="true">{i + 1} / {slides.length}</div>
    </div>,
    document.body
  )
}

function Slide({ s }) {
  switch (s.kind) {
    case 'intro':
      return (<>
        <div className="story-emoji">✨</div>
        <h2>{s.title}</h2>
        <p>{s.sub}</p>
        <p className="story-small">Toca para avanzar · mantén pulsado para pausar</p>
      </>)
    case 'empty':
      return (<>
        <div className="story-emoji">🌱</div>
        <h2>Nada que contar… todavía</h2>
        <p>No hay gastos en este periodo. Cuando los haya, aquí verás su historia.</p>
      </>)
    case 'total':
      return (<>
        <p className="story-kicker">En total gastaste</p>
        <div className="story-big"><AnimatedNumber value={s.amount} format={fmt} /></div>
        <p>en {s.count} {s.count === 1 ? 'movimiento' : 'movimientos'}</p>
        {s.prevDelta != null && (
          <p className="story-pill">{s.prevDelta > 0 ? '↑' : '↓'} {pct(Math.abs(s.prevDelta))} que el periodo anterior</p>
        )}
      </>)
    case 'top':
      return (<>
        <p className="story-kicker">Donde más se fue</p>
        <div className="story-emoji big">{s.emoji}</div>
        <h2>{s.name}</h2>
        <div className="story-mid"><AnimatedNumber value={s.amount} format={fmt} /></div>
        <p>{pct(s.share)} de todo lo que gastaste</p>
      </>)
    case 'biggest':
      return (<>
        <p className="story-kicker">Tu mayor gasto</p>
        <div className="story-emoji">{s.emoji}</div>
        <div className="story-mid"><AnimatedNumber value={s.amount} format={fmt} /></div>
        <h2>{s.description}</h2>
        <p>{longDate(s.date)}</p>
      </>)
    case 'busiest':
      return (<>
        <p className="story-kicker">El día más movido</p>
        <div className="story-emoji">📅</div>
        <h2 style={{ textTransform: 'capitalize' }}>{longDate(s.date)}</h2>
        <div className="story-mid"><AnimatedNumber value={s.amount} format={fmt} /></div>
        <p>en un solo día</p>
      </>)
    case 'calm':
      return (<>
        <p className="story-kicker">Días sin gastar nada</p>
        <div className="story-big"><AnimatedNumber value={s.noSpendDays} /></div>
        <p>de {s.days} días. {s.noSpendDays / s.days >= 0.4 ? '¡Nada mal!' : 'Cada uno cuenta.'}</p>
      </>)
    case 'saved':
      return s.amount >= 0 ? (<>
        <p className="story-kicker">Te quedó sin gastar</p>
        <div className="story-big"><AnimatedNumber value={s.amount} format={fmt} /></div>
        <p className="story-pill">{pct(s.rate)} de lo que entró</p>
      </>) : (<>
        <p className="story-kicker">Gastaste más de lo que entró</p>
        <div className="story-big"><AnimatedNumber value={-s.amount} format={fmt} /></div>
        <p>de diferencia. El próximo, a por ello.</p>
      </>)
    case 'outro':
    default:
      return (<>
        <div className="story-emoji">🚀</div>
        <h2>¡A por el siguiente!</h2>
        <p>Toca para cerrar</p>
      </>)
  }
}
