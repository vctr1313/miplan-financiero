// App-styled replacements for window.confirm / window.alert, plus
// toasts (with an optional action such as "Deshacer").
//
// A tiny store outside React, so plain functions and hooks can ask for
// a dialog and await the answer exactly like confirm() -- but with the
// app's own look instead of the browser's grey box. <DialogHost/>
// (mounted once in App.js) renders whatever is queued here.

let state = { dialogs: [], toasts: [] }
const listeners = new Set()
const emit = () => listeners.forEach(fn => fn(state))
const set = (patch) => { state = { ...state, ...patch }; emit() }
let seq = 0

export function subscribeDialogs(fn) {
  listeners.add(fn)
  fn(state)
  return () => listeners.delete(fn)
}

// Dialogs queue: the next one shows when the current one is answered.
function openDialog(dialog) {
  return new Promise(resolve => {
    set({ dialogs: [...state.dialogs, { ...dialog, id: ++seq, resolve }] })
  })
}

export function answerDialog(id, value) {
  const d = state.dialogs.find(x => x.id === id)
  if (!d) return
  set({ dialogs: state.dialogs.filter(x => x.id !== id) })
  d.resolve(value)
}

// Resolves true/false. `destructive` paints the confirm button red.
export const confirmDialog = ({ title, message, confirmText = 'Aceptar', cancelText = 'Cancelar', destructive = false, icon }) =>
  openDialog({ kind: 'confirm', title, message, confirmText, cancelText, destructive, icon })

export const alertDialog = ({ title, message, okText = 'Entendido', icon }) =>
  openDialog({ kind: 'alert', title, message, okText, icon }).then(() => undefined)

// Returns the toast id. `onAction` runs when its button is tapped;
// `onExpire` when it times out untouched (or is flushed early).
export function toast({ text, icon, tone = 'neutral', actionText, onAction, onExpire, duration = 3200 }) {
  const id = ++seq
  const timer = setTimeout(() => expireToast(id), duration)
  set({ toasts: [...state.toasts, { id, text, icon, tone, actionText, onAction, onExpire, duration, timer }] })
  return id
}

const takeToast = (id) => {
  const t = state.toasts.find(x => x.id === id)
  if (!t) return null
  clearTimeout(t.timer)
  set({ toasts: state.toasts.filter(x => x.id !== id) })
  return t
}

export function expireToast(id) {
  takeToast(id)?.onExpire?.()
}

export function actToast(id) {
  takeToast(id)?.onAction?.()
}

// Runs every pending onExpire now -- used when the app is being hidden
// or closed, so a delete waiting out its "Deshacer" window still
// happens instead of silently never reaching the server.
export function flushToasts() {
  state.toasts.map(t => t.id).forEach(expireToast)
}

// Test helper.
export const _resetDialogs = () => { state.toasts.forEach(t => clearTimeout(t.timer)); state = { dialogs: [], toasts: [] }; emit() }
