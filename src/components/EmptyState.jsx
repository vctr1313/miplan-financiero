import React from 'react'

// Small hand-drawn scenes instead of a bare "Sin movimientos". Each is
// a few shapes in the accent colour, so they sit comfortably in both
// themes without shipping image files.
const ART = {
  receipt: (
    <svg viewBox="0 0 120 96" aria-hidden="true">
      <ellipse cx="60" cy="88" rx="38" ry="5" fill="var(--fill)" />
      <path d="M36 12h48v66l-8-5-8 5-8-5-8 5-8-5-8 5z" fill="var(--card)" stroke="var(--g300)" strokeWidth="2" strokeLinejoin="round" />
      <rect x="44" y="24" width="32" height="5" rx="2.5" fill="var(--i5)" opacity=".85" />
      <rect x="44" y="36" width="24" height="4" rx="2" fill="var(--g300)" />
      <rect x="44" y="46" width="28" height="4" rx="2" fill="var(--g300)" />
      <rect x="44" y="56" width="18" height="4" rx="2" fill="var(--g300)" />
      <circle cx="90" cy="22" r="9" fill="var(--e5)" />
      <path d="M86 22l3 3 5-6" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  search: (
    <svg viewBox="0 0 120 96" aria-hidden="true">
      <ellipse cx="60" cy="88" rx="34" ry="5" fill="var(--fill)" />
      <circle cx="54" cy="44" r="24" fill="var(--card)" stroke="var(--g300)" strokeWidth="3" />
      <circle cx="54" cy="44" r="15" fill="var(--accent-tint)" />
      <path d="M72 62l16 16" stroke="var(--i5)" strokeWidth="7" strokeLinecap="round" />
    </svg>
  ),
  target: (
    <svg viewBox="0 0 120 96" aria-hidden="true">
      <ellipse cx="60" cy="88" rx="34" ry="5" fill="var(--fill)" />
      <circle cx="60" cy="46" r="32" fill="var(--card)" stroke="var(--g300)" strokeWidth="2" />
      <circle cx="60" cy="46" r="21" fill="var(--accent-tint)" />
      <circle cx="60" cy="46" r="10" fill="var(--i5)" />
      <path d="M60 46l30-26" stroke="var(--g700)" strokeWidth="3" strokeLinecap="round" />
      <path d="M86 14l8 2-2 8" fill="none" stroke="var(--g700)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  jar: (
    <svg viewBox="0 0 120 96" aria-hidden="true">
      <ellipse cx="60" cy="88" rx="32" ry="5" fill="var(--fill)" />
      <rect x="44" y="10" width="32" height="10" rx="4" fill="var(--g300)" />
      <path d="M40 22h40c4 0 6 3 6 7v44c0 6-4 10-10 10H44c-6 0-10-4-10-10V29c0-4 2-7 6-7z" fill="var(--card)" stroke="var(--g300)" strokeWidth="2" />
      <path d="M36 58h48v15c0 5-3 8-8 8H44c-5 0-8-3-8-8z" fill="var(--e5)" opacity=".85" />
      <circle cx="52" cy="50" r="6" fill="var(--a4)" />
      <circle cx="66" cy="44" r="5" fill="var(--a4)" opacity=".85" />
    </svg>
  ),
}

export default function EmptyState({ art = 'receipt', title, text, action }) {
  return (
    <div className="empty">
      <div className="empty-art">{ART[art] || ART.receipt}</div>
      {title && <div className="empty-title">{title}</div>}
      {text && <div className="empty-text">{text}</div>}
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>
  )
}
