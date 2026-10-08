// Runs a rule pack over rows, maps columns, compares with expected labels, and mutation-tests the checks.
import { buildPeers, CHECKS, invoiceKey } from './checks'
import type { Result, Row, Verdict } from './checks'
import { CLAUSES, PACKS } from './clauses'
import type { ClauseId, PackId } from './clauses'
import { isBlank as isBlankValue, norm, parseAmount as parseAmountValue } from './normalize'

export const FIELDS = [
  'invoice_no', 'book_no', 'issue_date', 'doc_title', 'seller_name', 'seller_address', 'seller_tax_id', 'seller_branch',
  'buyer_name', 'buyer_address', 'buyer_tax_id', 'buyer_branch', 'buyer_is_vat_registrant', 'item_desc', 'qty', 'unit_price',
  'amount_ex_vat', 'vat_amount', 'total',
] as const
export type Field = (typeof FIELDS)[number]

export const FIELD_LABEL: Record<Field, string> = {
  invoice_no: 'เลขที่ใบกำกับภาษี', book_no: 'เล่มที่', issue_date: 'วันที่ออก', doc_title: 'ชื่อเอกสาร',
  seller_name: 'ชื่อผู้ขาย', seller_address: 'ที่อยู่ผู้ขาย', seller_tax_id: 'เลขผู้เสียภาษีผู้ขาย', seller_branch: 'สาขาผู้ขาย',
  buyer_name: 'ชื่อผู้ซื้อ', buyer_address: 'ที่อยู่ผู้ซื้อ', buyer_tax_id: 'เลขผู้เสียภาษีผู้ซื้อ', buyer_branch: 'สาขาผู้ซื้อ',
  buyer_is_vat_registrant: 'ผู้ซื้อจด VAT', item_desc: 'รายการสินค้า', qty: 'จำนวน', unit_price: 'ราคาต่อหน่วย',
  amount_ex_vat: 'มูลค่าก่อน VAT', vat_amount: 'ภาษีมูลค่าเพิ่ม', total: 'รวมทั้งสิ้น',
}

// Header names we recognise for each field (English keys plus common Thai headers).
const SYNONYMS: Record<Field, string[]> = {
  invoice_no: ['เลขที่ใบกำกับ', 'เลขที่ใบกำกับภาษี', 'เลขที่เอกสาร', 'invoice no', 'invoice number'],
  book_no: ['เล่มที่', 'book'],
  issue_date: ['วันที่', 'วันที่ออก', 'date', 'invoice date'],
  doc_title: ['ชื่อเอกสาร', 'title', 'document title'],
  seller_name: ['ชื่อผู้ขาย', 'seller', 'seller name'],
  seller_address: ['ที่อยู่ผู้ขาย', 'seller address'],
  seller_tax_id: ['เลขผู้เสียภาษีผู้ขาย', 'seller tax id', 'seller tin'],
  seller_branch: ['สาขาผู้ขาย', 'seller branch'],
  buyer_name: ['ชื่อลูกค้า', 'ชื่อผู้ซื้อ', 'customer', 'buyer', 'buyer name'],
  buyer_address: ['ที่อยู่ลูกค้า', 'ที่อยู่ผู้ซื้อ', 'customer address', 'buyer address'],
  buyer_tax_id: ['เลขผู้เสียภาษีลูกค้า', 'เลขผู้เสียภาษีผู้ซื้อ', 'buyer tax id', 'customer tax id'],
  buyer_branch: ['สาขาลูกค้า', 'สาขาผู้ซื้อ', 'buyer branch'],
  buyer_is_vat_registrant: ['ลูกค้าจด vat', 'ผู้ซื้อจด vat', 'buyer vat registered'],
  item_desc: ['รายการ', 'รายการสินค้า', 'สินค้า', 'description', 'item'],
  qty: ['จำนวน', 'quantity'],
  unit_price: ['ราคาต่อหน่วย', 'unit price', 'price'],
  amount_ex_vat: ['มูลค่าก่อน vat', 'มูลค่า', 'amount', 'subtotal'],
  vat_amount: ['ภาษีมูลค่าเพิ่ม', 'vat', 'vat amount'],
  total: ['รวมทั้งสิ้น', 'รวม', 'total', 'grand total'],
}

const key = (s: string) => norm(s).toLowerCase().replace(/[\s_]+/g, ' ')

/** Proposes field → header. Unmatched fields map to '' (the user can fix them). */
export function autoMap(headers: string[]): Record<Field, string> {
  const out = {} as Record<Field, string>
  for (const f of FIELDS) {
    const wanted = [f, f.replace(/_/g, ' '), ...SYNONYMS[f]].map(key)
    out[f] = headers.find((h) => wanted.includes(key(h))) ?? ''
  }
  return out
}

export function applyMapping(raw: Record<string, string>[], mapping: Record<Field, string>): Row[] {
  return raw.map((r) => {
    const row: Row = {}
    for (const f of FIELDS) row[f] = mapping[f] ? (r[mapping[f]] ?? '') : ''
    return row
  })
}

export type RowResults = Partial<Record<ClauseId, Result>>

/** `lines` gives the line items of each row when rows are grouped invoices (see groupInvoices). */
export interface RunOptions {
  taxMonth?: string
  today?: Date
}

export function runPack(rows: Row[], pack: PackId, vatRate: number, lines?: Row[][], opts: RunOptions = {}): RowResults[] {
  const ids = PACKS[pack].clauses as readonly ClauseId[]
  const seen = new Set<string>()
  const peers = buildPeers(rows)
  return rows.map((row, i) => {
    const res: RowResults = {}
    for (const id of ids) res[id] = CHECKS[id](row, { vatRate, seen, lines: lines?.[i], peers, ...opts })
    if (norm(row.invoice_no)) seen.add(invoiceKey(row))
    return res
  })
}

export function summary(results: RowResults[]) {
  const byClause = CLAUSES.map((c) => {
    const counts: Record<Verdict, number> = { pass: 0, fail: 0, 'n/a': 0, needs_expert: 0, warn: 0 }
    for (const r of results) {
      const v = r[c.id]?.verdict
      if (v) counts[v]++
    }
    return { clause: c, counts, active: results.some((r) => r[c.id]) }
  })
  const rowsWithFail = results.filter((r) => Object.values(r).some((x) => x?.verdict === 'fail')).length
  const rowsNeedExpert = results.filter((r) => Object.values(r).some((x) => x?.verdict === 'needs_expert' || x?.verdict === 'warn')).length
  return { byClause, rowsWithFail, rowsNeedExpert, rows: results.length }
}

/** Agreement between the engine and hand/planted labels. */
export function compareExpected(results: RowResults[], expected: Record<string, string>[]) {
  let agree = 0
  let total = 0
  const mismatches: { row: number; clause: ClauseId; got: Verdict; want: string }[] = []
  results.forEach((r, i) => {
    const e = expected[i]
    if (!e) return
    for (const c of CLAUSES) {
      const got = r[c.id]?.verdict
      if (!got || e[c.id] === undefined) continue
      total++
      if (got === e[c.id]) agree++
      else mismatches.push({ row: i + 1, clause: c.id, got, want: e[c.id] })
    }
  })
  return { agree, total, mismatches }
}

// Mutation testing: break one key field of a passing row; the check must turn to fail.
type Mutant = Row | { row: Row; lines?: Row[]; peers?: ReturnType<typeof buildPeers> }
const MUTATORS: Record<ClauseId, (r: Row) => Mutant> = {
  'TI-01': (r) => ({ ...r, doc_title: 'ใบเสร็จรับเงิน' }),
  'TI-02': (r) => ({ ...r, seller_tax_id: r.seller_tax_id.slice(0, -1) + String((Number(r.seller_tax_id.slice(-1)) + 1) % 10) }),
  'TI-03': (r) => ({ ...r, buyer_address: '' }),
  'TI-04': (r) => ({ ...r, invoice_no: '' }),
  'TI-05': (r) => ({ ...r, qty: '0' }),
  'TI-06': (r) => ({ ...r, vat_amount: '' }),
  'TI-06b': (r) => ({ ...r, vat_amount: String((parseFloat(r.vat_amount.replace(/,/g, '')) || 0) + 5) }),
  'TI-07': (r) => ({ ...r, issue_date: '31/02/2569' }),
  'TI-08': (r) => ({ ...r, seller_branch: '' }),
  'TI-09': (r) => ({ ...r, buyer_tax_id: r.buyer_tax_id.slice(0, -1) + String((Number(r.buyer_tax_id.slice(-1)) + 1) % 10) }),
  'TI-10': (r) => ({ ...r, buyer_branch: '' }),
  'TI-11': (r) => ({ ...r, total: String((parseFloat(r.total.replace(/,/g, '')) || 0) + 5) }),
  'TI-13': (r) => ({ ...r, issue_date: '2099-01-01' }),
  'TI-14': (r) => ({ ...r, issue_date: '2099-01-01' }),
  'TI-15': (r) => ({ row: r, lines: [r, { ...r, issue_date: '1999-01-01' }] }),
  'TI-24': (r) => ({ ...r, doc_title: 'ใบกำกับภาษีอย่างย่อ', buyer_is_vat_registrant: 'Y' }),
  'TI-12': (r) => ({ ...r, qty: String((parseFloat(r.qty) || 0) + 1) }),
  'TI-16': (r) => ({ row: { ...r, seller_name: `${r.seller_name} สาขาใหม่` }, peers: buildPeers([r, r]) }),
  'TI-17': (r) => ({ ...r, buyer_name: `บจก. ${r.buyer_name}` }),
  'TI-18': (r) => ({ ...r, buyer_name: 'นายสมชาย' }),
}

const isWrapped = (m: Mutant): m is { row: Row; lines?: Row[]; peers?: ReturnType<typeof buildPeers> } => typeof m.row === 'object'

export function mutationTest(rows: Row[], vatRate: number, opts: RunOptions = {}) {
  const peers = buildPeers(rows)
  return CLAUSES.map((c) => {
    const ctx = { vatRate, seen: new Set<string>(), peers, ...opts }
    const idx = rows.findIndex((r) => CHECKS[c.id](r, ctx).verdict === 'pass')
    if (idx < 0) return { clause: c, row: null as number | null, killed: false, after: null as Result | null }
    const m = MUTATORS[c.id](rows[idx])
    const after = isWrapped(m)
      ? CHECKS[c.id](m.row, { vatRate, seen: new Set(), lines: m.lines, peers: m.peers ?? peers, ...opts })
      : CHECKS[c.id](m, { vatRate, seen: new Set(), peers, ...opts })
    return { clause: c, row: idx + 1, killed: after.verdict === 'fail' || after.verdict === 'warn', after }
  })
}

// ---- Multi-line invoices -------------------------------------------------------------------
// Accounting exports (Express, FlowAccount, PEAK, ...) usually write one row per line item.
// Rows with the same invoice number AND the same header details are one invoice. Same number
// with different details stays separate, so TI-04 still flags it as a duplicate number.

export interface Invoice {
  /** Header fields plus invoice-level amounts, as the checks see it. */
  row: Row
  lines: Row[]
  /** 1-based row numbers in the user's file. */
  lineNos: number[]
}

const HEADER_KEYS = ['issue_date', 'doc_title', 'buyer_name', 'buyer_tax_id', 'buyer_branch'] as const
const signature = (r: Row) => HEADER_KEYS.map((k) => norm(r[k]).replace(/\s+/g, ' ')).join('\u0001')
const near = (a: number, b: number, lines: number) => Math.abs(a - b) <= 0.01 * lines + 1e-9
const money = (n: number) => n.toFixed(2)

/** Invoice-level value of a column that is either repeated on every line or split per line. */
function invoiceAmount(values: string[], expected: number | null): string {
  const filled = values.filter((v) => !isBlankValue(v))
  if (filled.length === 0) return ''
  const nums = filled.map((v) => parseAmountValue(v))
  const bad = filled.find((_, i) => nums[i] === null)
  if (bad !== undefined) return bad
  const ns = nums as number[]
  if (ns.length === 1) return filled[0]
  const sum = ns.reduce((a, b) => a + b, 0)
  const same = ns.every((n) => n === ns[0])
  if (expected !== null) {
    if (same && near(ns[0], expected, 1)) return money(ns[0])
    if (near(sum, expected, ns.length)) return money(sum)
  }
  return same && filled.length < values.length ? money(ns[0]) : money(sum)
}

export function groupInvoices(rows: Row[], vatRate: number, lineNos: number[] = rows.map((_, i) => i + 2)): Invoice[] {
  // Key = seller TIN + seller branch + book + number (invoices are numbered per premises and book).
  // Consecutive rows with the same key are one invoice even if their headers disagree (TI-15 reports it).
  // A non-consecutive row joins an earlier invoice only when its header matches too; otherwise it is a
  // second invoice with the same number, which TI-04 reports as a duplicate.
  const byKey = new Map<string, Invoice[]>()
  const out: Invoice[] = []
  let prev: { key: string; inv: Invoice } | null = null
  rows.forEach((r, i) => {
    const key = norm(r.invoice_no) ? invoiceKey(r) : ''
    const same = key ? byKey.get(key) ?? [] : []
    const inv = key && prev?.key === key ? prev.inv : same.find((x) => signature(x.lines[0]) === signature(r))
    if (inv) {
      inv.lines.push(r)
      inv.lineNos.push(lineNos[i])
      prev = { key, inv }
      return
    }
    const fresh: Invoice = { row: r, lines: [r], lineNos: [lineNos[i]] }
    if (key) byKey.set(key, [...same, fresh])
    out.push(fresh)
    prev = { key, inv: fresh }
  })
  for (const inv of out) {
    if (inv.lines.length === 1) continue
    const amounts = inv.lines.map((l) => parseAmountValue(l.amount_ex_vat))
    const amount = amounts.every((a) => a !== null) ? money((amounts as number[]).reduce((a, b) => a + b, 0)) : (inv.lines.find((_, k) => amounts[k] === null)?.amount_ex_vat ?? '')
    const amt = parseAmountValue(amount)
    const vat = invoiceAmount(inv.lines.map((l) => l.vat_amount), amt === null ? null : Math.round(amt * vatRate * 100) / 100)
    const vatN = parseAmountValue(vat)
    const total = invoiceAmount(inv.lines.map((l) => l.total), amt !== null && vatN !== null ? amt + vatN : null)
    inv.row = {
      ...inv.lines[0],
      item_desc: inv.lines.map((l) => norm(l.item_desc)).filter(Boolean).join(' · '),
      qty: '',
      unit_price: '',
      amount_ex_vat: amount,
      vat_amount: vat,
      total,
    }
  }
  return out
}

export function runInvoices(invoices: Invoice[], pack: PackId, vatRate: number, opts: RunOptions = {}): RowResults[] {
  return runPack(invoices.map((x) => x.row), pack, vatRate, invoices.map((x) => x.lines), opts)
}
