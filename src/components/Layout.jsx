import React, { useState, useEffect } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useApp } from '../App'
import { signOut } from '../lib/supabase'
import { fmt } from '../lib/finance'
import BalanceReviewModal from './BalanceReviewModal'
import '../styles/global.css'

const NAV = [
  { path: '/',            icon: 'fa-chart-pie',    label: 'Resumen',      section: 'Principal' },
  { path: '/transactions',icon: 'fa-list',          label: 'Movimientos',  section: null },
  { path: '/budget',      icon: 'fa-sliders',       label: 'Presupuesto',  section: null },
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
  const { profile, categories, transactions, loading, syncing } = useApp()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [dark, setDark] = useState(() => document.documentElement.getAttribute('data-theme') === 'dark')

  // One-time prompt (see BalanceReviewModal) for existing users whose
  // pots already have real transaction history -- a brand-new pot
  // with nothing in it yet has nothing to reconcile, so it's excluded
  // rather than prompting pointlessly on day one.
  const potsWithHistory = categories.filter(c => c.type === 'pot' && transactions.some(t => t.category_id === c.id))
  const showBalanceReview = !loading && profile && !profile.balances_reviewed_at && potsWithHistory.length > 0

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
  }, [dark])

  const go = (path) => { navigate(path); setSidebarOpen(false) }

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
        {NAV.map((item, i) => (
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
        <div className="sb-row" onClick={() => setDark(d => !d)}>
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
        <span className="mobile-title">
          Mi Plan <span>Financiero</span>
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
