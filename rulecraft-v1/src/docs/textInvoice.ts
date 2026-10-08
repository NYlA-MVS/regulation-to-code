/* eslint-disable no-control-regex -- PDF text layers emit U+0000 where Thai tone marks were lost */
// Reads invoices from the text layer of a PDF made by accounting software. Runs in the browser, no
// network. It looks for labels Thai invoices use ("เลขที่", "วันที่", "ลูกค้า", "รวมเงิน", ...) rather
// than one fixed layout, and reports every field it could not find so the user can fill it in.
import type { Field } from '../rules/engine'
import { compact, digitsOnly, norm, parseAmount } from '../rules/normalize'
import { parseDate } from '../rules/validators'
import { DOC_REQUIRED } from './types'
import type { DocLine, ExtractedInvoice } from './types'

/** A text run as pdf.js reports it (x, y in PDF points; y grows upwards). */
export interface TextRun { str: string; x: number; y: number; width: number }

/** One visual line, split into cells where the horizontal gap is wide (table columns, side-by-side boxes). */
export type Line = string[]

/** Groups runs into lines top-to-bottom and rebuilds Thai words split into glyph clusters. */
export function toLines(runs: TextRun[]): Line[] {
  const rows: { y: number; runs: TextRun[] }[] = []
  for (const r of runs) {
    if (!r.str) continue
    const row = rows.find((x) => Math.abs(x.y - r.y) <= 3)
    if (row) row.runs.push(r)
    else rows.push({ y: r.y, runs: [r] })
  }
  rows.sort((a, b) => b.y - a.y)
  return rows.map(({ runs: rs }) => {
    rs.sort((a, b) => a.x - b.x)
    const cells: string[] = []
    let cur = ''
    let end = -Infinity
    for (const r of rs) {
      const gap = r.x - end
      if (cur && gap > 14) { cells.push(cur); cur = '' }
      else if (cur && gap > 2.2 && !/\s$/.test(cur)) cur += ' '
      cur += r.str
      end = r.x + r.width
    }
    if (cur) cells.push(cur)
    return cells.map((c) => norm(c).replace(/\s+/g, ' ')).filter(Boolean)
  }).filter((l) => l.length)
}

/** True when the text layer is real Thai/Latin text rather than empty or broken font mappings. */
export function readable(lines: Line[]): boolean {
  const text = lines.flat().join(' ')
  if (text.replace(/\s/g, '').length < 40) return false
  const bad = (text.match(/[-�]/g) ?? []).length
  return bad / text.length < 0.02 && /[ก-๛]|invoice/i.test(text)
}

// Thai PDFs often lose tone marks to broken font tables (they come out as U+0000). Labels are matched with
// tone marks ignored; values keep what was readable and the invoice is flagged so the user can check it.
const MARKS = /[\u0000\u0E48-\u0E4B]/g
const strip = (s: string) => s.replace(MARKS, '')
const loose = (re: RegExp) => new RegExp(strip(re.source), re.flags.replace('g', ''))
/** The original text after a label matched with tone marks ignored. */
function after(cell: string, label: RegExp): string | undefined {
  const re = new RegExp(`^(?:${strip(label.source)})\\s*[:：]?\\s*`, 'i')
  const m = re.exec(strip(cell))
  if (!m) return undefined
  let seen = 0, k = 0
  while (k < cell.length && seen < m[0].length) { if (!/[\u0000\u0E48-\u0E4B]/.test(cell[k])) seen++; k++ }
  while (k < cell.length && /[\u0000\u0E48-\u0E4B]/.test(cell[k])) k++
  return clean(cell.slice(k)) || undefined
}
const clean = (s: string) => s.replace(/\u0000/g, '').trim()
export const garbled = (lines: Line[]) => lines.some((l) => l.some((c) => /[\u0000\uE000-\uF8FF\uFFFD]/.test(c)))

const TITLE = /(ใบกำกับภาษี|ใบลดหนี้|ใบเพิ่มหนี้|ใบเสร็จรับเงิน|tax\s*invoice|credit\s*note|debit\s*note|receipt|invoice)/i
const ENTITY = /(บริษัท|ห้างหุ้นส่วน|หจก\.|บจ\.|บมจ\.|บ\..*จก\.|co\.,?\s*ltd|limited|ร้าน)/i
const BUYER = /^(ชื่อลูกค้า|ลูกค้า|ผู้ซื้อ|นามผู้ซื้อ|customer|bill\s*to|sold\s*to)\s*[:：]?\s*/i
const BRANCH = /(สำนักงานใหญ่|สนญ\.?|สาขาที่\s*\d+|สาขา\s*\d+|head\s*office|branch\s*(no\.?)?\s*\d+)/i
/** Branch notation in tone-stripped text, returned in its proper spelling. */
function branchIn(stripped: string): string | undefined {
  const m = loose(BRANCH).exec(stripped)
  if (!m) return undefined
  const n = /\d+/.exec(m[1])?.[0]
  if (n) return /branch/i.test(m[1]) ? `Branch ${n}` : `สาขาที่ ${n}`
  return /head/i.test(m[1]) ? 'Head Office' : /สนญ/.test(m[1]) ? 'สนญ.' : 'สำนักงานใหญ่'
}
const TIN = /(?<![\d-])(\d[\d\- ]{11,22}\d)(?![\d-])/g
const NUM = /^-?[\d,]+(\.\d+)?$/

interface PageRead {
  fields: Partial<Record<Field, string>>
  lines: DocLine[]
  sheet?: { n: number; of: number }
}

/** Reads one page. Returns whatever it can find; the caller merges pages into invoices. */
export function readPage(lines: Line[]): PageRead {
  const f: Partial<Record<Field, string>> = {}
  const items: DocLine[] = []
  const cells = lines.flat()
  const buyerAt = lines.findIndex((l) => loose(BUYER).test(strip(l[0] ?? '')))
  const sellerLines = buyerAt > 0 ? lines.slice(0, buyerAt) : lines.slice(0, 4)

  f.doc_title = cells.map(clean).find((c) => TITLE.test(c) && c.length < 60 && !/^(อ้างอิง|ref)/i.test(strip(c)))
  for (const c of cells) {
    const ref = loose(/(?:อ้างอิง|ใบกำกับภาษีเดิม|ref).*?(?:เลขที่|no\.?)\s*[:：]?\s*([A-Za-z0-9][\w\-/.]*\d)/i).exec(strip(c))
    if (ref) { f.ref_invoice_no ??= ref[1]; continue }
    const no = after(c, /เลขที่(?:ใบกำกับภาษี|ใบกำกับ|เอกสาร)?|no\.?|invoice\s*no\.?|document\s*no\.?/)
    if (no && /\d/.test(no) && !f.invoice_no && !/\s/.test(no)) f.invoice_no = no
    const book = after(c, /เล่มที่|book\s*no\.?/)
    if (book && !f.book_no) f.book_no = book
    const date = after(c, /วันที่|date/)
    if (date && !f.issue_date && parseDate(date)) f.issue_date = date
    const reason = after(c, /เหตุผล|สาเหตุ|reason/)
    if (reason) f.reason ??= reason
  }
  const sheet = loose(/แผ่นที่\s*(\d+)\s*\/\s*(\d+)/).exec(strip(cells.join(' ')))

  // Seller: the first legal-entity name before the buyer block, its address on the next line.
  const sIdx = sellerLines.findIndex((l) => ENTITY.test(l[0] ?? '') && !TITLE.test(l[0]))
  if (sIdx >= 0) {
    f.seller_name = clean(sellerLines[sIdx][0])
    const next = sellerLines[sIdx + 1]?.[0]
    if (next && !loose(/เลขประจำตัว|tax\s*id|โทร|tel/i).test(strip(next)) && !TITLE.test(next)) f.seller_address = clean(next)
  }
  // Buyer: text after the label; address on the line that starts with "ที่อยู่" or simply the next line.
  if (buyerAt >= 0) {
    f.buyer_name = after(lines[buyerAt][0], new RegExp(BUYER.source.slice(1).replace(/\\s\*\[:：\]\?\\s\*$/, ''), 'i')) || clean(lines[buyerAt + 1]?.[0] ?? '')
    const addr = lines.slice(buyerAt + 1, buyerAt + 4).map((l) => after(l[0] ?? '', /ที่อยู่|address/i)).find(Boolean)
    f.buyer_address = addr ?? clean(lines[buyerAt + 1]?.[0] ?? '')
    if (f.buyer_address && loose(/เลขประจำตัว|tax\s*id/i).test(strip(f.buyer_address))) f.buyer_address = undefined
  }
  // Tax IDs and branches: first one in each block. A branch is looked for on the TIN's line first.
  const findIn = (ls: Line[]) => {
    for (const l of ls) {
      const text = strip(l.join(' '))
      for (const m of text.matchAll(TIN)) {
        const d = digitsOnly(m[1])
        if (d.length === 13 || d.length === 18) {
          const br = branchIn(text)
          return { tin: m[1].replace(/\s/g, ''), branch: br }
        }
      }
    }
    return undefined
  }
  const s = findIn(buyerAt > 0 ? lines.slice(0, buyerAt) : lines.slice(0, 5))
  if (s) { f.seller_tax_id = s.tin; f.seller_branch = s.branch ?? sellerLines.flat().map((c) => branchIn(strip(c))).find(Boolean) }
  if (buyerAt >= 0) {
    const b = findIn(lines.slice(buyerAt, buyerAt + 5))
    if (b) { f.buyer_tax_id = b.tin; f.buyer_branch = b.branch }
  }

  // Item table: rows that end in numbers, between the column header and the totals.
  const head = lines.findIndex((l) => l.some((c) => loose(/(^|\s)(รายการ|description|รายละเอียด)(\s|$)/i).test(strip(c))))
  const isTotal = (l: Line) => loose(/^(รวม|ภาษีมูลค่าเพิ่ม|vat|total|มูลค่าที่ลดลง|มูลค่าที่เพิ่มขึ้น|จำนวนเงินรวม)/i).test(strip(l[0] ?? ''))
  const headCells = head >= 0 ? strip(lines[head].join(' ')) : ''
  const noteTable = loose(/มูลค่าตามใบกำกับ|มูลค่าเดิม|original/i).test(headCells)
  for (const l of head >= 0 ? lines.slice(head + 1) : []) {
    if (isTotal(l)) break
    const parts = l.flatMap((c) => c.split(' '))
    const nums: string[] = []
    while (parts.length && NUM.test(parts[parts.length - 1])) nums.unshift(parts.pop()!)
    if (parts.length && /^\d+$/.test(parts[0])) parts.shift()
    const text = [clean(parts.join(' '))].filter(Boolean)
    if (nums.length < 2 || !text.length) continue
    if (noteTable && nums.length >= 3) {
      // Credit/debit note row: original value, correct value, difference (ม.86/9(5), 86/10(5)).
      f.original_value ??= nums[nums.length - 3].replace(/,/g, '')
      f.correct_value ??= nums[nums.length - 2].replace(/,/g, '')
      items.push({ desc: text.join(' '), qty: '', price: '', amount: nums[nums.length - 1].replace(/,/g, '') })
      continue
    }
    const [qty, price, amount] = nums.length >= 3 ? nums.slice(-3) : ['', nums[0], nums[1]]
    items.push({ desc: text.join(' '), qty: qty.replace(/,/g, ''), price: price.replace(/,/g, ''), amount: amount.replace(/,/g, '') })
  }

  // Totals: label in the first cell, amount in the last numeric cell of the line.
  const lastNum = (l: Line) => [...l.flatMap((c) => c.split(' '))].reverse().find((c) => NUM.test(c))?.replace(/,/g, '')
  for (const l of lines) {
    const label = strip(compact(l[0])).toLowerCase()
    const v = lastNum(l)
    if (!v) continue
    if (loose(/^(รวมเงิน|มูลค่าสินค้า|มูลค่าก่อนภาษี|ราคาก่อนภาษี|รวมก่อนภาษี|มูลค่าที่ลดลง|มูลค่าที่เพิ่มขึ้น|subtotal|totalbeforevat)/).test(label)) f.amount_ex_vat = v
    else if (loose(/^(ภาษีมูลค่าเพิ่ม|vat)/).test(label)) f.vat_amount = v
    else if (loose(/(รวมทั้งสิ้น|ยอดสุทธิ|grandtotal|totalamount|^total$)/).test(label)) f.total = v
  }
  for (const k of Object.keys(f) as Field[]) if (f[k] === undefined || f[k] === '') delete f[k]
  return { fields: f, lines: items, sheet: sheet ? { n: Number(sheet[1]), of: Number(sheet[2]) } : undefined }
}

/** Pages → invoices. A page without its own number, or with the same number, continues the previous invoice. */
export function readInvoices(file: string, pages: Line[][]): { invoices: ExtractedInvoice[]; unreadPages: number[] } {
  const invoices: ExtractedInvoice[] = []
  const unreadPages: number[] = []
  pages.forEach((lines, i) => {
    if (!readable(lines)) { unreadPages.push(i + 1); return }
    const p = readPage(lines)
    const prev = invoices[invoices.length - 1]
    const continues = prev && prev.source === 'text' && prev.pages[prev.pages.length - 1] === i &&
      (!p.fields.invoice_no || norm(p.fields.invoice_no) === norm(prev.fields.invoice_no)) && p.sheet?.n !== 1
    if (continues) {
      prev.pages.push(i + 1)
      prev.lines.push(...p.lines)
      for (const [k, v] of Object.entries(p.fields) as [Field, string][]) if (v && (['amount_ex_vat', 'vat_amount', 'total'].includes(k) || !prev.fields[k])) prev.fields[k] = v
    } else invoices.push({ source: 'text', file, pages: [i + 1], fields: p.fields, lines: p.lines, missing: [], garbled: false })
    invoices[invoices.length - 1].garbled ||= garbled(lines)
  })
  for (const inv of invoices) inv.missing = DOC_REQUIRED.filter((k) => !inv.fields[k])
  return { invoices, unreadPages }
}

/** Sum of item amounts, used when the totals block is missing. */
export const itemsTotal = (lines: DocLine[]) => lines.reduce((n, l) => n + (parseAmount(l.amount) ?? 0), 0)
