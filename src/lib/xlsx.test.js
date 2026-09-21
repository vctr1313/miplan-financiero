/**
 * @jest-environment node
 */
import fs from 'fs'
import path from 'path'
import { readXlsx } from './xlsx'
import { detectColumns, extractMovements } from './bankImport'
import { DecompressionStream } from 'stream/web'
import { Blob } from 'buffer'

// Jest's sandbox doesn't forward these Node globals; the browser has them.
global.DecompressionStream = global.DecompressionStream || DecompressionStream
global.Blob = global.Blob || Blob

const fixture = () => {
  const buf = fs.readFileSync(path.join(__dirname, '__fixtures__', 'extracto.xlsx'))
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
}

it('reads the first sheet: shared strings, rich text, entities, numbers, gaps', async () => {
  const rows = await readXlsx(fixture())
  expect(rows[0]).toEqual(['Cuenta', 'ES12 3456'])
  expect(rows[1]).toEqual([])
  expect(rows[2]).toEqual(['Fecha', 'Concepto', 'Importe', 'Saldo'])
  expect(rows[3]).toEqual([46283, 'COMPRA TARJ MERCADONA', -96.3, 1200])
  expect(rows[5][1]).toBe('Farmacia & Salud')
  expect(rows[6][1]).toBe('Cafetería Sol')
})

it('feeds straight into the importer', async () => {
  const rows = await readXlsx(fixture())
  const movs = extractMovements(rows, detectColumns(rows))
  expect(movs.map(m => [m.date, m.sign * m.amount])).toEqual([
    ['2026-09-18', -96.3],
    ['2026-08-28', 1883.8],
    ['2026-09-05', -7.5],
    ['2026-09-06', -3.4],
  ])
})

it('explains old .xls files instead of failing obscurely', async () => {
  const ole = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]).buffer
  await expect(readXlsx(ole)).rejects.toThrow(/\.xls antiguo/)
})

it('rejects something that is not a zip', async () => {
  await expect(readXlsx(new TextEncoder().encode('Fecha;Concepto').buffer)).rejects.toThrow(/no es un \.xlsx/)
})
