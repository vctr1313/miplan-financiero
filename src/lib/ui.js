import { useEffect, useState } from 'react'

// ── THEME ─────────────────────────────────────────────────────
// Stored in localStorage rather than the profile, because the theme
// has to be applied before React (and therefore before the profile
// request) has run at all -- see the inline script in index.html.
// 'light' | 'dark' | null, where null means "follow the system".
const THEME_KEY = 'fp_theme'

const systemPrefersDark = () =>
  window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false

export const getStoredTheme = () => {
  try {
    const v = localStorage.getItem(THEME_KEY)
    return v === 'light' || v === 'dark' ? v : null
  } catch { return null }
}

export const isDarkActive = () =>
  document.documentElement.getAttribute('data-theme') === 'dark'

export const applyTheme = (theme) => {
  const dark = theme ? theme === 'dark' : systemPrefersDark()
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
  // Keep the browser/OS chrome (status bar, tab strip) in step with
  // the app instead of leaving a light bar above a dark page.
  document.querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', dark ? '#000000' : '#f5f5f7')
  try {
    if (theme) localStorage.setItem(THEME_KEY, theme)
    else localStorage.removeItem(THEME_KEY)
  } catch { /* private mode: the theme just won't persist */ }
  return dark
}

// Follows the OS while the user hasn't made an explicit choice, so
// the app flips with the system's own light/dark schedule.
export function useSystemThemeSync(onChange) {
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!mq) return
    const handler = () => {
      if (getStoredTheme()) return
      document.documentElement.setAttribute('data-theme', mq.matches ? 'dark' : 'light')
      onChange?.(mq.matches)
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [onChange])
}

// Only autofocus a field on pointer devices. On a phone, autofocus
// pops the on-screen keyboard the instant a dialog opens, which
// covers a bottom-anchored sheet before the user has even read it --
// and on iOS the keyboard doesn't shrink the layout viewport, so the
// sheet ends up behind it.
export const autoFocusOnPointer = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(hover: hover) and (pointer: fine)').matches

// Publishes the height of the on-screen keyboard as `--kb` on <html>,
// so CSS can lift dialogs above it and cap their height.
//
// Needed because iOS Safari doesn't resize the layout viewport when
// the keyboard opens -- it only shrinks the VISUAL viewport, so a
// `position: fixed` sheet stays pinned to the (now hidden) bottom of
// the page. Android Chrome does resize the layout viewport, in which
// case window.innerHeight shrinks along with it and this correctly
// measures ~0, leaving the layout untouched.
export function useKeyboardInset() {
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return

    const root = document.documentElement
    const update = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
      // Ignore a couple of stray pixels from rounding/toolbars so the
      // layout doesn't twitch when no keyboard is actually open.
      root.style.setProperty('--kb', inset > 24 ? `${Math.round(inset)}px` : '0px')
    }

    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
      root.style.removeProperty('--kb')
    }
  }, [])
}

// ── HAPTICS ───────────────────────────────────────────────────
// Short vibrations on Android (the Vibration API). iPhone doesn't
// expose it to web apps, so there this is silently a no-op.
const HAPTICS = {
  light: 8,
  select: 12,
  success: [12, 60, 18],
  warning: [22, 70, 22],
  error: [30, 50, 30, 50, 30],
}
export function haptic(kind = 'light') {
  try { navigator.vibrate?.(HAPTICS[kind] ?? HAPTICS.light) } catch { /* not allowed here */ }
}

// ── TEXT SIZE ─────────────────────────────────────────────────
// 'm' (default) | 'l' | 'xl'. Applied as data-textsize on <html>, which
// scales the whole interface (see global.css), and set before first
// paint by the inline script in index.html -- same as the theme.
const TEXT_KEY = 'fp_textsize'
export const TEXT_SIZES = [
  { id: 'm', label: 'Normal' },
  { id: 'l', label: 'Grande' },
  { id: 'xl', label: 'Muy grande' },
]
export const getTextSize = () => {
  try { return localStorage.getItem(TEXT_KEY) || 'm' } catch { return 'm' }
}
export const applyTextSize = (size) => {
  document.documentElement.setAttribute('data-textsize', size)
  try {
    if (size === 'm') localStorage.removeItem(TEXT_KEY)
    else localStorage.setItem(TEXT_KEY, size)
  } catch { /* private mode */ }
}

// Live boolean for a CSS media query, e.g. useMediaQuery('(min-width: 1100px)').
export function useMediaQuery(query) {
  const get = () => typeof window !== 'undefined' && !!window.matchMedia?.(query).matches
  const [matches, setMatches] = useState(get)
  useEffect(() => {
    const mq = window.matchMedia?.(query)
    if (!mq) return
    const onChange = () => setMatches(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [query])
  return matches
}
