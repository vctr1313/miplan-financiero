import { sharedBalance, partnerShare, balanceHeadline } from './shared'

const row = (payer_id, debtor_id, debtor_share, settled_at = null) => ({ payer_id, debtor_id, debtor_share, settled_at })

describe('sharedBalance', () => {
  it('nets both directions from my point of view', () => {
    const rows = [row('me', 'ana', 30), row('ana', 'me', 10), row('me', 'ana', 5.55)]
    expect(sharedBalance(rows, 'me')).toMatchObject({ owedToMe: 35.55, owedByMe: 10, net: 25.55 })
    expect(sharedBalance(rows, 'ana').net).toBeCloseTo(-25.55, 6)
  })
  it('ignores settled rows', () => {
    const b = sharedBalance([row('me', 'ana', 30, '2026-09-01'), row('ana', 'me', 12)], 'me')
    expect(b.net).toBe(-12)
    expect(b.open).toHaveLength(1)
  })
  it('is exact in cents', () => {
    expect(sharedBalance([row('me', 'ana', 0.1), row('me', 'ana', 0.2)], 'me').net).toBe(0.3)
  })
  it('matches the database settlement for the same data', () => {
    // Same figures used against settle_shared_balance() in production
    // (inside a rolled-back transaction): 60 split in half, 40 with 10 mine.
    expect(sharedBalance([row('me', 'ana', 30), row('ana', 'me', 10)], 'me').net).toBe(20)
  })
})

describe('partnerShare', () => {
  it('half, all, or a custom part no larger than the total', () => {
    expect(partnerShare('half', 45.35)).toBe(22.68)
    expect(partnerShare('all', 45.35)).toBe(45.35)
    expect(partnerShare('custom', 45, '12.5')).toBe(12.5)
    expect(partnerShare('custom', 45, '50')).toBeNull()
    expect(partnerShare('custom', 45, '')).toBeNull()
  })
})

it('balanceHeadline', () => {
  expect(balanceHeadline(0, 'Ana')).toBe('Estáis en paz')
  expect(balanceHeadline(12, 'Ana')).toBe('Ana te debe')
  expect(balanceHeadline(-12, 'Ana')).toBe('Debes a Ana')
})
