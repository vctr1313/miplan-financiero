// Balance between two linked partners from their shared expenses (see
// supabase_patch_shared_expenses.sql). Every row says who paid
// (payer_id), who owes (debtor_id) and how much of it is the debtor's
// part (debtor_share). Only unsettled rows count.

const cents = (v) => Math.round((Number(v) || 0) * 100)

export function sharedBalance(sharedExpenses, meId) {
  const open = sharedExpenses.filter(s => !s.settled_at)
  let toMe = 0
  let byMe = 0
  open.forEach(s => {
    if (s.payer_id === meId) toMe += cents(s.debtor_share)
    else if (s.debtor_id === meId) byMe += cents(s.debtor_share)
  })
  return {
    open,
    owedToMe: toMe / 100,
    owedByMe: byMe / 100,
    // > 0: the partner owes me; < 0: I owe the partner.
    net: (toMe - byMe) / 100,
  }
}

// The partner's part for each way of sharing offered in the form.
export function partnerShare(mode, total, custom) {
  const t = Number(total) || 0
  if (mode === 'half') return Math.round(t * 50) / 100
  if (mode === 'all') return t
  const c = Number(custom) || 0
  return c > 0 && c <= t ? Math.round(c * 100) / 100 : null
}

export function balanceHeadline(net, partnerName = 'Tu pareja') {
  if (Math.abs(net) < 0.005) return 'Estáis en paz'
  return net > 0 ? `${partnerName} te debe` : `Debes a ${partnerName}`
}
