import React from 'react'

export const Skel = ({ w = '100%', h = 14, r = 8, style }) => (
  <span className="skel" style={{ width: w, height: h, borderRadius: r, ...style }} />
)

// Shown while the first load is in flight. Mirrors the dashboard's
// real layout (title, pace card, four figures, two lists), so the page
// seems to fill in rather than jump from a spinner to content.
export function DashboardSkeleton() {
  return (
    <div className="boot-skeleton" aria-busy="true" aria-label="Cargando tu plan financiero">
      <aside className="boot-skeleton-side">
        <Skel w="70%" h={20} />
        <Skel w="45%" h={10} style={{ marginTop: 8 }} />
        <div style={{ marginTop: 34, display: 'grid', gap: 14 }}>
          {Array.from({ length: 8 }).map((_, i) => <Skel key={i} w={`${60 + (i % 3) * 12}%`} h={16} />)}
        </div>
      </aside>
      <main className="boot-skeleton-main">
        <Skel w={220} h={30} />
        <Skel w={160} h={13} style={{ marginTop: 10 }} />
        <div className="card" style={{ marginTop: 28, display: 'flex', gap: 28, alignItems: 'center' }}>
          <Skel w={170} h={170} r={85} />
          <div style={{ flex: 1, display: 'grid', gap: 12 }}>
            <Skel w="55%" h={20} />
            <Skel w="35%" h={12} />
            <Skel w="70%" h={16} style={{ marginTop: 10 }} />
          </div>
        </div>
        <div className="grid-4" style={{ marginTop: 18 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="stat-card" style={{ display: 'grid', gap: 10 }}>
              <Skel w="45%" h={11} /><Skel w="75%" h={24} /><Skel w="35%" h={10} />
            </div>
          ))}
        </div>
        <div className="grid-2" style={{ marginTop: 18 }}>
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="card" style={{ display: 'grid', gap: 16 }}>
              <Skel w="40%" h={15} />
              {Array.from({ length: 4 }).map((_, j) => (
                <div key={j} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <Skel w={36} h={36} r={10} />
                  <div style={{ flex: 1, display: 'grid', gap: 7 }}><Skel w="60%" h={12} /><Skel w="35%" h={10} /></div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
