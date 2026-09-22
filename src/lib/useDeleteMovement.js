import { useApp } from '../App'
import { deleteTransaction, deleteSplitGroup, deleteSharedExpense } from './supabase'

// One delete path for every list of movements, because deleting is no
// longer "remove this row": some rows only make sense together with
// others.
//  * A part of a split purchase takes the whole purchase with it.
//  * A shared expense takes its partner's-part transfer and the shared
//    record with it (the partner stops seeing it).
//  * The partner's-part transfer itself can't be deleted alone -- that
//    would silently put the partner's share back on your budget while
//    they still see it as owed.
// Rows disappear immediately and come back if the server refuses.
export default function useDeleteMovement() {
  const { transactions, shared, partnerSummary, refresh, removeTransactionLocally } = useApp()
  const partnerName = partnerSummary?.partner_name || 'tu pareja'

  return async (id) => {
    const tx = transactions.find(t => t.id === id)
    if (!tx) return

    const shareOf = shared.expenses.find(s => s.share_tx_id === id)
    if (shareOf) {
      window.alert(`Es la parte de ${partnerName} de "${shareOf.description}". Para quitarla, borra ese gasto compartido.`)
      return
    }

    const sharedRow = shared.expenses.find(s => s.expense_tx_id === id)
    const group = tx.split_group ? transactions.filter(t => t.split_group === tx.split_group) : null

    let question = '¿Eliminar este movimiento?'
    if (sharedRow) {
      question = sharedRow.settled_at
        ? `Este gasto compartido con ${partnerName} ya está saldado. ¿Eliminarlo igualmente?`
        : `Es un gasto compartido con ${partnerName}: también se quitará su parte pendiente (${sharedRow.debtor_share} €). ¿Eliminarlo?`
    } else if (group && group.length > 1) {
      question = `Esta compra está repartida en ${group.length} categorías. ¿Eliminar las ${group.length} partes?`
    }
    if (!window.confirm(question)) return

    const ids = sharedRow
      ? [id, sharedRow.share_tx_id].filter(Boolean)
      : (group && group.length > 1 ? group.map(t => t.id) : [id])
    const restores = ids.map(removeTransactionLocally)
    try {
      if (sharedRow) await deleteSharedExpense(sharedRow)
      else if (group && group.length > 1) await deleteSplitGroup(tx.split_group)
      else await deleteTransaction(id)
    } catch (err) {
      restores.forEach(r => r())
      window.alert('No se pudo eliminar: ' + err.message)
    }
    refresh()
  }
}
