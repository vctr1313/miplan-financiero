import { useEffect } from 'react'

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
