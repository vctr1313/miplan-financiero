import React, { useState, useEffect } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useApp } from '../App'
import { signOut } from '../lib/supabase'
import { fmt } from '../lib/finance'
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
  const { profile, syncing } = useApp()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [dark, setDark] = useState(() => document.documentElement.getAttribute('data-theme') === 'dark')

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
        <div
          onClick={() => setDark(d => !d)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '11px 15px', cursor: 'pointer'
          }}
        >
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>
            <i className="fa fa-moon" style={{ marginRight: 6 }} />
            Modo oscuro
          </span>
          <div style={{
            width: 34, height: 18, borderRadius: 9,
            background: dark ? 'var(--i5)' : 'rgba(255,255,255,0.14)',
            position: 'relative', transition: 'background .2s'
          }}>
            <div style={{
              position: 'absolute', width: 12, height: 12, background: '#fff',
              borderRadius: '50%', top: 3, left: dark ? 19 : 3, transition: 'left .2s'
            }} />
          </div>
        </div>

        {/* Sync indicator */}
        <div style={{ padding: '6px 15px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <div className={`sync-dot ${syncing ? 'syncing' : ''}`} />
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>
            {syncing ? 'Sincronizando…' : 'Sincronizado'}
          </span>
        </div>

        {/* Salary */}
        <div style={{ padding: '10px 15px 14px', background: 'rgba(0,0,0,0.18)' }}>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginBottom: 3 }}>
            Sueldo neto mensual
          </div>
          <div
            onClick={() => go('/settings')}
            style={{ color: 'var(--a4)', fontSize: 16, fontWeight: 700, cursor: 'pointer' }}
          >
            {profile?.salary ? fmt(profile.salary) : '—'}
            <small style={{ fontSize: 10, fontWeight: 400, color: 'rgba(255,255,255,0.3)' }}> / mes</small>
          </div>
        </div>

        {/* Sign out */}
        <button
          onClick={handleSignOut}
          style={{
            width: '100%', padding: '10px 15px', background: 'none', border: 'none',
            color: 'rgba(255,255,255,0.35)', fontSize: 12, textAlign: 'left',
            borderTop: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 8
          }}
        >
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
        <span style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>
          Mi Plan <span style={{ color: 'var(--a4)' }}>Financiero</span>
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
    </div>
  )
}
