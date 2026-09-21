// Minimal reader for the first sheet of an .xlsx file, with no
// dependencies.
//
// Why not the usual npm "xlsx" package: its npm-published versions
// carry known vulnerabilities (prototype pollution, ReDoS) that were
// only fixed outside the npm registry, and this app only ever needs
// "give me the cells of the first sheet". An .xlsx is a ZIP of XML
// files; the browser can inflate ZIP entries natively
// (DecompressionStream 'deflate-raw'), so that's all this does:
// locate four files in the ZIP and pull the cell values out of them.
//
// Returns rows as arrays of cell values: strings, or numbers for
// numeric cells (dates come through as Excel serial numbers, which
// lib/bankImport.js's parseDate understands).

const u16 = (b, o) => b[o] | (b[o + 1] << 8)
const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0

function readZipDirectory(bytes) {
  // End of central directory: scan back from the end (the record can be
  // followed by a comment of up to 64 KB).
  let eocd = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
    if (u32(bytes, i) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new Error('El archivo no es un .xlsx válido')
  const count = u16(bytes, eocd + 10)
  let p = u32(bytes, eocd + 16)
  const dec = new TextDecoder()
  const entries = {}
  for (let n = 0; n < count; n++) {
    if (u32(bytes, p) !== 0x02014b50) break
    const method = u16(bytes, p + 10)
    const compSize = u32(bytes, p + 20)
    const nameLen = u16(bytes, p + 28)
    const extraLen = u16(bytes, p + 30)
    const commentLen = u16(bytes, p + 32)
    const localOffset = u32(bytes, p + 42)
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen))
    entries[name] = { method, compSize, localOffset }
    p += 46 + nameLen + extraLen + commentLen
  }
  return entries
}

async function readEntry(bytes, entry) {
  const p = entry.localOffset
  if (u32(bytes, p) !== 0x04034b50) throw new Error('El archivo .xlsx está dañado')
  const start = p + 30 + u16(bytes, p + 26) + u16(bytes, p + 28)
  const data = bytes.subarray(start, start + entry.compSize)
  if (entry.method === 0) return new TextDecoder().decode(data)
  if (entry.method !== 8) throw new Error('Compresión de .xlsx no soportada')
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Tu navegador no puede leer .xlsx. Exporta el extracto como CSV.')
  }
  const reader = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader()
  const chunks = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    size += value.length
  }
  const out = new Uint8Array(size)
  let o = 0
  for (const c of chunks) { out.set(c, o); o += c.length }
  return new TextDecoder().decode(out)
}

const decodeXml = (s) => s
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&amp;/g, '&')

// All <t> runs inside a fragment, concatenated (rich text splits one
// string into several runs).
const textRuns = (xml) => {
  let out = ''
  xml.replace(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g, (_, t) => { out += t; return '' })
  return decodeXml(out)
}

const colIndex = (ref) => {
  const letters = ref.match(/^[A-Z]+/)[0]
  let n = 0
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

export async function readXlsx(buffer) {
  const bytes = new Uint8Array(buffer)
  // Old binary .xls (Excel 97-2003) is an OLE container, not a ZIP.
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) {
    throw new Error('Es un .xls antiguo. Ábrelo en Excel y guárdalo como .xlsx o CSV.')
  }
  const entries = readZipDirectory(bytes)

  // First sheet in workbook order -> its file via the relationships.
  let sheetPath = 'xl/worksheets/sheet1.xml'
  if (entries['xl/workbook.xml'] && entries['xl/_rels/workbook.xml.rels']) {
    const wb = await readEntry(bytes, entries['xl/workbook.xml'])
    const rels = await readEntry(bytes, entries['xl/_rels/workbook.xml.rels'])
    const rid = (wb.match(/<sheet\b[^>]*\br:id="([^"]+)"/) || [])[1]
    const rel = rid && new RegExp(`<Relationship\\b[^>]*\\bId="${rid}"[^>]*>`).exec(rels)
    const target = rel && (rel[0].match(/\bTarget="([^"]+)"/) || [])[1]
    if (target) sheetPath = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`
  }
  if (!entries[sheetPath]) throw new Error('No encuentro ninguna hoja en el .xlsx')

  const shared = []
  if (entries['xl/sharedStrings.xml']) {
    const sst = await readEntry(bytes, entries['xl/sharedStrings.xml'])
    sst.replace(/<si>([\s\S]*?)<\/si>/g, (_, si) => { shared.push(textRuns(si)); return '' })
  }

  const sheet = await readEntry(bytes, entries[sheetPath])
  const rows = []
  // A row can be self-closing (<row r="2"/>) and empty rows are often
  // omitted entirely, so place each row by its own r="" number rather
  // than by the order it appears in.
  sheet.replace(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g, (_, rowAttrs, rowXml = '') => {
    const rowNum = Number((rowAttrs.match(/\br="(\d+)"/) || [])[1]) || rows.length + 1
    const row = []
    rowXml.replace(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, (__, attrs, inner = '') => {
      const ref = (attrs.match(/\br="([A-Z]+\d+)"/) || [])[1]
      const type = (attrs.match(/\bt="([^"]+)"/) || [])[1]
      const col = ref ? colIndex(ref) : row.length
      const v = (inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1]
      let value = ''
      if (type === 's') value = shared[Number(v)] ?? ''
      else if (type === 'inlineStr') value = textRuns(inner)
      else if (type === 'str' || type === 'e') value = v != null ? decodeXml(v) : ''
      else if (type === 'b') value = v === '1' ? 'TRUE' : 'FALSE'
      else if (v != null && v !== '') value = Number(v)
      while (row.length < col) row.push('')
      row[col] = value
      return ''
    })
    while (rows.length < rowNum - 1) rows.push([])
    rows[rowNum - 1] = row
    return ''
  })
  return rows
}
