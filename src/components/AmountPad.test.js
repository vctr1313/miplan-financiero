import { nextAmount, formatAmountDisplay } from './AmountPad'

const type = (keys) => keys.reduce((v, k) => nextAmount(v, k), '')

describe('nextAmount', () => {
  it('builds an amount digit by digit', () => {
    expect(type(['1', '2', '5', ',', '5', '0'])).toBe('125.50')
  })
  it('caps decimals at two', () => {
    expect(type(['9', ',', '9', '9', '9'])).toBe('9.99')
  })
  it('starts "0," when the separator comes first, and allows only one', () => {
    expect(type([',', '5', ','])).toBe('0.5')
  })
  it('replaces a lone leading zero', () => {
    expect(type(['0', '7'])).toBe('7')
  })
  it('deletes the last character', () => {
    expect(type(['4', '2', ',', '1', 'del', 'del'])).toBe('42')
  })
  it('limits the integer part to seven digits', () => {
    expect(type(['1', '2', '3', '4', '5', '6', '7', '8'])).toBe('1234567')
  })
  it('stays parseFloat-compatible', () => {
    expect(parseFloat(type(['1', '9', ',', '9', '5']))).toBeCloseTo(19.95, 6)
  })
})

describe('formatAmountDisplay', () => {
  it('shows a comma decimal and thousands separators', () => {
    expect(formatAmountDisplay('1234.5')).toBe('1234,5'.replace('1234', Number(1234).toLocaleString('es-ES')))
    expect(formatAmountDisplay('')).toBe('0')
  })
})
