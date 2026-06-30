import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { signIn, signUp, signInWithGoogle, joinHousehold } from '../lib/supabase'
import { useApp } from '../App'
import '../styles/global.css'

export default function Login() {
  const navigate = useNavigate()
  const { session, loading: appLoading } = useApp()
  const [mode, setMode] = useState('signin') // signin | signup | join
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [signedUpOk, setSignedUpOk] = useState(false)

  // ── OAUTH REDIRECT FIX ────────────────────────────────────────
  // After Google sign-in, Supabase appends #access_token=... to the URL
  // and processes it client-side, which fires onAuthStateChange in
  // AppProvider. But Login.jsx itself never read that session before,
  // so it just sat on the login form forever even though auth had
  // actually succeeded. This effect watches the shared session state
  // and navigates away as soon as it appears.
  useEffect(() => {
    if (session) navigate('/', { replace: true })
  }, [session, navigate])

  // While Supabase is still parsing the OAuth callback hash on first
  // load, show a brief loading state instead of flashing the login
  // form (which would look like "it kicked me back to login").
  if (appLoading) {
    return (
      <div style={pageStyle}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 32, animation: 'spin 1s linear infinite', display: 'inline-block' }}>⚙️</div>
          <p style={{ color: 'var(--muted, #6b7280)', marginTop: 12, fontSize: 14 }}>Completando inicio de sesión…</p>
        </div>
      </div>
    )
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      if (mode === 'signin') {
        const { error } = await signIn(email, password)
        if (error) throw error
        navigate('/')
      } else if (mode === 'signup') {
        const { error } = await signUp(email, password, name)
        if (error) throw error
        setSignedUpOk(true)
      } else if (mode === 'join') {
        const { error } = await signIn(email, password)
        if (error) throw error
        await joinHousehold(inviteCode)
        navigate('/')
      }
    } catch (err) {
      setError(translateError(err.message))
    } finally {
      setLoading(false)
    }
  }

  const handleGoogle = async () => {
    setError('')
    const { error } = await signInWithGoogle()
    if (error) setError(translateError(error.message))
  }

  if (signedUpOk) {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📧</div>
          <h2 style={{ fontSize: 19, fontWeight: 700, marginBottom: 8 }}>¡Revisa tu correo!</h2>
          <p style={{ fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 16 }}>
            Te hemos enviado un enlace de confirmación a <strong>{email}</strong>.
            Haz clic en él para activar tu cuenta y luego vuelve aquí para iniciar sesión.
          </p>
          <button className="btn btn-primary w-full" onClick={() => { setSignedUpOk(false); setMode('signin') }}>
            Ir a iniciar sesión
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#312e81' }}>
            Mi Plan <span style={{ color: '#f59e0b' }}>Financiero</span>
          </h1>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4, letterSpacing: '.05em' }}>
            CONTROL · AHORRO · INVERSIÓN
          </p>
        </div>

        <div className="tabs" style={{ marginBottom: 18 }}>
          <button className={`tab ${mode === 'signin' ? 'active' : ''}`} onClick={() => setMode('signin')}>
            Iniciar sesión
          </button>
          <button className={`tab ${mode === 'signup' ? 'active' : ''}`} onClick={() => setMode('signup')}>
            Crear cuenta
          </button>
          <button className={`tab ${mode === 'join' ? 'active' : ''}`} onClick={() => setMode('join')}>
            Unirme a hogar
          </button>
        </div>

        {mode === 'join' && (
          <div className="alert alert-info">
            <i className="fa fa-circle-info" />
            <div>Inicia sesión con tu cuenta y pega el código de invitación que te dio tu pareja (lo encuentra en Ajustes → Hogar compartido).</div>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {mode === 'signup' && (
            <div className="form-group">
              <label>Tu nombre</label>
              <input className="form-control" value={name} onChange={e => setName(e.target.value)} placeholder="María" required />
            </div>
          )}
          <div className="form-group">
            <label>Email</label>
            <input className="form-control" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@email.com" required />
          </div>
          <div className="form-group">
            <label>Contraseña</label>
            <input className="form-control" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} />
          </div>
          {mode === 'join' && (
            <div className="form-group">
              <label>Código de invitación</label>
              <input className="form-control" value={inviteCode} onChange={e => setInviteCode(e.target.value)} placeholder="ej: a1b2c3d4" required style={{ fontFamily: 'monospace' }} />
            </div>
          )}

          {error && <div className="alert alert-danger">{error}</div>}

          <button type="submit" className="btn btn-primary w-full" disabled={loading} style={{ justifyContent: 'center', padding: '10px 0' }}>
            {loading ? 'Cargando…' : mode === 'signin' ? 'Entrar' : mode === 'signup' ? 'Crear cuenta' : 'Unirme'}
          </button>
        </form>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '16px 0' }}>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>o</span>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        </div>

        <button className="btn btn-ghost w-full" onClick={handleGoogle} style={{ justifyContent: 'center' }}>
          <i className="fa-brands fa-google" /> Continuar con Google
        </button>

        <p style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center', marginTop: 18 }}>
          Tus datos se sincronizan de forma segura y privada.<br />Solo tú y los miembros de tu hogar pueden verlos.
        </p>
      </div>
    </div>
  )
}

function translateError(msg) {
  const map = {
    'Invalid login credentials': 'Email o contraseña incorrectos.',
    'User already registered': 'Ya existe una cuenta con este email.',
    'Password should be at least 6 characters': 'La contraseña debe tener al menos 6 caracteres.',
    'Código de invitación no válido': 'Código de invitación no válido. Pídele el código correcto a tu pareja.',
  }
  return map[msg] || msg
}

const pageStyle = {
  minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'linear-gradient(135deg, #f7f6ff 0%, #eef2ff 100%)', padding: 20
}
const cardStyle = {
  background: '#fff', borderRadius: 20, padding: 32, width: '100%', maxWidth: 420,
  boxShadow: '0 20px 60px rgba(49,46,129,0.15)', border: '1px solid #e5e7eb'
}
