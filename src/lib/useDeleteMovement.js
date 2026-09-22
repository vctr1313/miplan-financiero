import { useApp } from '../App'
import { deleteTransaction, deleteSplitGroup, deleteSharedExpense } from './supabase'
import { confirmDialog, alertDialog, toast } from './dialog'
import { haptic } from './ui'

const UNDO_MS = 5000

// One delete path for every list of movements, because deleting is no
// longer "remove this row": some rows only make sense together with
// others.
//  * A part of a split purchase takes the whole purchase with it.
//  * A shared expense takes its partner's-part transfer and the shared
//    record with it (the partner stops seeing it).
//  * The partner's-part transfer itself can't be deleted alone -- that
//    would silently put the partner's share back on your budget while
//    they still see it as owed.
//
// No "are you sure?" first: the rows vanish at once and a toast offers
// "Deshacer" for a few seconds; only when that window closes does the
// server delete run. (Leaving the app early commits it -- see
// DialogHost.) The one exception is a shared expense that's already
// settled, which touches the partner's history too, so it still asks.
export default function useDeleteMovement() {
  const { transactions, shared, partnerSummary, refresh, removeTransactionLocally } = useApp()
  const partnerName = partnerSummary?.partner_name || 'tu pareja'

  return async (id) => {
    const tx = transactions.find(t => t.id === id)
    if (!tx) return

    const shareOf = shared.expenses.find(s => s.share_tx_id === id)
    if (shareOf) {
      await alertDialog({
        icon: 'fa-user-group',
        title: 'Forma parte de un gasto compartido',
        message: `Es la parte de ${partnerName} de "${shareOf.description}". Para quitarla, borra ese gasto compartido.`,
      })
      return
    }

    const sharedRow = shared.expenses.find(s => s.expense_tx_id === id)
    const group = tx.split_group ? transactions.filter(t => t.split_group === tx.split_group) : null
    const isGroup = group && group.length > 1

    if (sharedRow?.settled_at) {
      const ok = await confirmDialog({
        icon: 'fa-trash', destructive: true, confirmText: 'Eliminar',
        title: '¿Eliminar este gasto compartido?',
        message: `Ya está saldado con ${partnerName}; también desaparecerá de su lista.`,
      })
      if (!ok) return
    }

    const ids = sharedRow
      ? [id, sharedRow.share_tx_id].filter(Boolean)
      : (isGroup ? group.map(t => t.id) : [id])
    const restores = ids.map(removeTransactionLocally)
    const restore = () => restores.forEach(r => r())
    haptic('warning')

    const text = sharedRow ? 'Gasto compartido eliminado'
      : isGroup ? `Compra eliminada (${group.length} partes)`
      : 'Movimiento eliminado'

    toast({
      text, icon: 'fa-trash', actionText: 'Deshacer', duration: UNDO_MS,
      onAction: restore,
      onExpire: async () => {
        try {
          if (sharedRow) await deleteSharedExpense(sharedRow)
          else if (isGroup) await deleteSplitGroup(tx.split_group)
          else await deleteTransaction(id)
        } catch (err) {
          restore()
          haptic('error')
          alertDialog({ icon: 'fa-triangle-exclamation', title: 'No se pudo eliminar', message: err.message })
        }
        refresh()
      },
    })
  }
}
