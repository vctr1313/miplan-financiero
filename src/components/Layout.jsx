import React, { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useApp } from '../App'
import { signOut } from '../lib/supabase'
import { fmt } from '../lib/finance'
import { isDarkActive, applyTheme, useSystemThemeSync, haptic } from '../lib/ui'
import BalanceReviewModal from './BalanceReviewModal'
import '../styles/global.css'

const NAV = [
  { path: '/',            icon: 'fa-chart-pie',    label: 'Resumen',      section: 'Principal' },
  { path: '/transactions',icon: 'fa-list',          label: 'Movimientos',  section: null },
  { path: '/budget',      icon: 'fa-sliders',       label: 'Presupuesto',  section: null },
  { path: '/shared',      icon: 'fa-user-group',    label: 'Compartidos',  section: null, partnerOnly: true },
  { path: '/savings',     icon: 'fa-piggy-bank',    label: 'Botes',        section: 'Ahorro' },
  { path: '/goals',       icon: 'fa-bullseye',      label: 'Metas',        section: null },
  { path: '/house',       icon: 'fa-house',         label: 'Mi Casa',      section: null },
  { path: '/history',     icon: 'fa-clock-rotate-left', label: 'Historial de ciclos', section: 'Análisis' },
  { path: '/reports',     icon: 'fa-chart-line',    label: 'Reportes',     section: null },
  { path: '/chat',        icon: 'fa-robot',         label: 'Consejero IA', section: null },
  { path: '/settings',    icon: 'fa-gear',          label: 'Ajustes',      section: 'Config.' },
]
const BOTTOM_NAV = ['/', '/transactions', '/budget', '/savings', '/house']

export default function Layout() {
  const { profile, categories, transactions, loading, syncing, refresh } = useApp()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  // The theme is already on <html> before React mounts (inline script
  // in index.html), so this just reads it rather than deciding it.
  const [dark, setDark] = useState(isDarkActive)

  // One-time prompt (see BalanceReviewModal) for existing users whose
  // pots already have real transaction history -- a brand-new pot
  // with nothing in it yet has nothing to reconcile, so it's excluded
  // rather than prompting pointlessly on day one.
  const potsWithHistory = categories.filter(c => c.type === 'pot' && transactions.some(t => t.category_id === c.id))
  const showBalanceReview = !loading && profile && !profile.balances_reviewed_at && potsWithHistory.length > 0

  // Follow the system until the user picks a side explicitly.
  useSystemThemeSync(setDark)

  const toggleTheme = () => { haptic('select'); setDark(applyTheme(dark ? 'light' : 'dark')) }

  // Section changes go through the View Transitions API where it
  // exists, so the old page cross-fades out instead of vanishing.
  // flushSync makes React commit the new route inside the transition
  // callback, which is what the API snapshots as the "after" state.
  const go = (path) => {
    setSidebarOpen(false)
    if (path === pathname) { window.scrollTo({ top: 0, behavior: 'smooth' }); return }
    const commit = () => flushSync(() => navigate(path))
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (document.startViewTransition && !reduced) {
      const root = document.documentElement
      root.classList.add('vt')
      document.startViewTransition(commit).finished.finally(() => root.classList.remove('vt'))
    } else commit()
    window.scrollTo(0, 0)
  }

  // iOS-style compact title: once the page's big title scrolls under
  // the mobile header, the header swaps the app name for that title.
  const [compactTitle, setCompactTitle] = useState(null)
  useEffect(() => {
    setCompactTitle(null)
    const heading = document.querySelector('.main .page-header h2')
    if (!heading || !('IntersectionObserver' in window)) return
    const io = new IntersectionObserver(
      ([entry]) => setCompactTitle(entry.isIntersecting ? null : heading.textContent),
      { rootMargin: '-72px 0px 0px 0px' }
    )
    io.observe(heading)
    return () => io.disconnect()
  }, [pathname, loading])

  // Pull to refresh (touch only). Engages only when the page is already
  // at the very top and nothing is open over it, so it never competes
  // with normal scrolling or with a sheet's own scroll.
  const [pull, setPull] = useState(0)
  const [pulling, setPulling] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const pullRef = useRef(0)
  const refreshRef = useRef(refresh)
  refreshRef.current = refresh
  useEffect(() => {
    if (!window.matchMedia?.('(pointer: coarse)').matches) return
    const THRESHOLD = 72
    let startY = null
    const set = v => { pullRef.current = v; setPull(v) }
    const onStart = (e) => {
      if (window.scrollY > 0 || document.querySelector('.modal-overlay, .sidebar.open')) return
      startY = e.touches[0].clientY
    }
    const onMove = (e) => {
      if (startY == null) return
      const d = e.touches[0].clientY - startY
      if (d <= 0 || window.scrollY > 0) { set(0); setPulling(false); return }
      setPulling(true)
      // Resistance grows the further you pull, like the native control.
      set(Math.min(120, d * 0.55))
    }
    const onEnd = async () => {
      if (startY == null) return
      startY = null
      setPulling(false)
      if (pullRef.current < THRESHOLD) { set(0); return }
      setRefreshing(true)
      set(56)
      haptic('success')
      try { await refreshRef.current?.() } finally { setRefreshing(false); set(0) }
    }
    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: true })
    window.addEventListener('touchend', onEnd)
    window.addEventListener('touchcancel', onEnd)
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', onEnd)
    }
  }, [])

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  const SidebarContent = () => (
    <>
      <div className="sidebar-logo">
        <h1>Mi Plan <span>Financiero</span></h1>
        <p>CONTROL · AHORRO · INVERSIÓN</p>
      </div>

      <nav style={{ flex: '1 0 auto', padding: '8px 0' }}>
        {NAV.filter(item => !item.partnerOnly || profile?.partner_id).map((item, i) => (
          <React.Fragment key={item.path}>
            {item.section && (
              <div className="nav-section">{item.section}</div>
            )}
            <button
              className={`nav-item ${pathname === item.path ? 'active' : ''}`}
              onClick={() => go(item.path)}
            >
              <i className={`fa ${item.icon}`} />
              {item.label}
            </button>
          </React.Fragment>
        ))}
      </nav>

      {/* Dark mode toggle */}
      <div className="sidebar-bottom">
        <div className="sb-row" onClick={toggleTheme}>
          <span className="sb-label">
            <i className="fa fa-moon" />
            Modo oscuro
          </span>
          <div className={`switch ${dark ? 'on' : ''}`} role="switch" aria-checked={dark}>
            <div className="switch-knob" />
          </div>
        </div>

        {/* Sync indicator */}
        <div className="sb-sync">
          <div className={`sync-dot ${syncing ? 'syncing' : ''}`} />
          <span>{syncing ? 'Sincronizando…' : 'Sincronizado'}</span>
        </div>

        {/* Salary */}
        <div className="sb-salary">
          <div className="sb-salary-label">Sueldo neto mensual</div>
          <div className="sb-salary-value" onClick={() => go('/settings')}>
            {profile?.salary ? fmt(profile.salary) : '—'}
            <small> / mes</small>
          </div>
        </div>

        {/* Sign out */}
        <button className="sb-signout" onClick={handleSignOut}>
          <i className="fa fa-right-from-bracket" />
          Cerrar sesión ({profile?.name || 'usuario'})
        </button>
      </div>
    </>
  )

  return (
    <div className="app-layout">
      {/* Mobile header */}
      <header className="mobile-header">
        <button className="hamburger" onClick={() => setSidebarOpen(true)}>
          <i className="fa fa-bars" />
        </button>
        <span className="mobile-title-stack">
          <span className={`mobile-title ${compactTitle ? 'out' : ''}`}>
            Mi Plan <span>Financiero</span>
          </span>
          <span className={`mobile-title compact ${compactTitle ? 'in' : ''}`} aria-hidden={!compactTitle}>
            {compactTitle}
          </span>
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className={`sync-dot ${syncing ? 'syncing' : ''}`} />
        </div>
      </header>

      {/* Mobile overlay */}
      <div
        className={`mobile-overlay ${sidebarOpen ? 'open' : ''}`}
        onClick={() => setSidebarOpen(false)}
      />

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <SidebarContent />
      </aside>

      {/* Pull-to-refresh indicator (touch only) */}
      <div
        className={`ptr ${refreshing ? 'refreshing' : ''} ${pulling ? 'pulling' : ''}`}
        style={{ '--pull': `${pull}px`, '--p': Math.min(1, pull / 72) }}
        aria-hidden={!pull && !refreshing}
      >
        <i className="fa fa-arrow-rotate-right" />
      </div>

      {/* Main content */}
      <main className="main">
        <Outlet />
      </main>

      {/* Bottom nav (mobile only) */}
      <nav className="bottom-nav">
        {BOTTOM_NAV.map(path => {
          const item = NAV.find(n => n.path === path)
          if (!item) return null
          return (
            <button
              key={path}
              className={`bottom-nav-item ${pathname === path ? 'active' : ''}`}
              onClick={() => go(path)}
            >
              <i className={`fa ${item.icon}`} />
              {item.label}
            </button>
          )
        })}
      </nav>

      {showBalanceReview && <BalanceReviewModal pots={potsWithHistory} onClose={() => {}} />}
    </div>
  )
}
