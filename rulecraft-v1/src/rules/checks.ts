// One pure check per clause. Each returns a verdict with evidence and a fix hint.
import type { ClauseId } from './clauses'
import { compact, isBlank, norm, parseAmount } from './normalize'
import { isBranchNotation, isPlaceholder, parseDate, taxIdProblem } from './validators'

export type Verdict = 'pass' | 'fail' | 'n/a' | 'needs_expert'
export type Row = Record<string, string>
export interface Result {
  verdict: Verdict
  evidence: string
  fix?: string
  /** For multi-line invoices: index of the line item the result is about. */
  line?: number
}
export interface Context {
  vatRate: number
  /** invoice numbers already seen earlier in the file */
  seen: Set<string>
  /** Line items of a multi-line invoice. Defaults to the row itself. */
  lines?: Row[]
}

const TITLE = compact('ใบกำกับภาษี')
const ABBREVIATED = compact('อย่างย่อ')
const pass = (evidence: string): Result => ({ verdict: 'pass', evidence })
const fail = (evidence: string, fix: string): Result => ({ verdict: 'fail', evidence, fix })
const show = (v: string | undefined) => (isBlank(v) ? '(ว่าง)' : `"${norm(v)}"`)

const registrant = (row: Row): boolean | null => {
  const v = norm(row.buyer_is_vat_registrant).toLowerCase()
  if (['y', 'yes', 'true', '1', 'จด', 'ใช่'].includes(v)) return true
  if (['n', 'no', 'false', '0', 'ไม่จด', 'ไม่ใช่'].includes(v)) return false
  return null
}

export const CHECKS: Record<ClauseId, (row: Row, ctx: Context) => Result> = {
  'TI-01': (row) => {
    const t = compact(row.doc_title)
    if (t.includes(TITLE)) {
      if (t.includes(ABBREVIATED))
        return { verdict: 'needs_expert', evidence: `ชื่อเอกสาร ${show(row.doc_title)} เป็นใบกำกับภาษีอย่างย่อ`, fix: 'ใบกำกับภาษีอย่างย่อไม่ใช่แบบเต็มรูป ให้ผู้เชี่ยวชาญยืนยันว่ารายการนี้ต้องออกแบบเต็มรูปหรือไม่' }
      return pass(`ชื่อเอกสาร ${show(row.doc_title)} มีคำว่า ใบกำกับภาษี`)
    }
    if (/taxinvoice/i.test(t))
      return { verdict: 'needs_expert', evidence: `มีแต่คำภาษาอังกฤษ ${show(row.doc_title)}`, fix: 'ยังไม่ยืนยันว่าชื่อภาษาอังกฤษอย่างเดียวใช้แทนได้ ให้ผู้เชี่ยวชาญตรวจ' }
    return fail(`ชื่อเอกสาร ${show(row.doc_title)} ไม่มีคำว่า ใบกำกับภาษี`, 'เพิ่มคำว่า "ใบกำกับภาษี" ในตำแหน่งที่เห็นได้ชัดบนเอกสาร')
  },
  'TI-02': (row) => {
    const missing = [isBlank(row.seller_name) && 'ชื่อผู้ขาย', isBlank(row.seller_address) && 'ที่อยู่ผู้ขาย'].filter(Boolean)
    if (missing.length) return fail(`ไม่มี${missing.join(' และ ')}`, 'กรอกชื่อและที่อยู่ของผู้ขายตามที่จดทะเบียน')
    const p = taxIdProblem(row.seller_tax_id)
    if (p) return fail(`เลขผู้เสียภาษีผู้ขาย ${show(row.seller_tax_id)}: ${p}`, 'ตรวจเลขประจำตัวผู้เสียภาษี 13 หลักของผู้ขายอีกครั้ง')
    return pass('ชื่อ ที่อยู่ และเลขผู้เสียภาษีผู้ขายครบ')
  },
  'TI-03': (row) => {
    for (const [field, label] of [['buyer_name', 'ชื่อผู้ซื้อ'], ['buyer_address', 'ที่อยู่ผู้ซื้อ']] as const) {
      if (isBlank(row[field])) return fail(`ไม่มี${label}`, `กรอก${label}ให้ครบ`)
      if (isPlaceholder(row[field])) return fail(`${label}เป็นคำแทน ${show(row[field])}`, `ใบกำกับภาษีเต็มรูปต้องมี${label}จริง`)
    }
    return pass('มีชื่อและที่อยู่ผู้ซื้อ')
  },
  'TI-04': (row, ctx) => {
    const n = norm(row.invoice_no)
    if (n === '') return fail('ไม่มีเลขที่ใบกำกับภาษี', 'ใส่เลขลำดับใบกำกับภาษี')
    if (ctx.seen.has(n)) return fail(`เลขที่ "${n}" ซ้ำกับแถวก่อนหน้า`, 'เลขที่ใบกำกับภาษีต้องไม่ซ้ำกัน')
    return pass(`เลขที่ "${n}" ไม่ซ้ำ`)
  },
  'TI-05': (row, ctx) => {
    const lines = ctx.lines ?? [row]
    for (const [k, line] of lines.entries()) {
      const at = lines.length > 1 ? `รายการที่ ${k + 1}: ` : ''
      if (isBlank(line.item_desc)) return { ...fail(`${at}ไม่มีชื่อรายการสินค้าหรือบริการ`, 'ระบุชื่อ ชนิด หรือประเภทของสินค้า'), line: k }
      const qty = parseAmount(line.qty)
      if (qty === null || qty <= 0) return { ...fail(`${at}จำนวน ${show(line.qty)} ต้องมากกว่า 0`, 'ระบุปริมาณสินค้าที่ขายจริง'), line: k }
      const amt = parseAmount(line.amount_ex_vat)
      if (amt === null || amt < 0) return { ...fail(`${at}มูลค่า ${show(line.amount_ex_vat)} ไม่ถูกต้อง`, 'ระบุมูลค่าสินค้าเป็นตัวเลขที่ไม่ติดลบ'), line: k }
    }
    return pass(lines.length > 1 ? `ครบทั้ง ${lines.length} รายการ: มีชื่อ จำนวน และมูลค่า` : 'มีรายการ จำนวน และมูลค่า')
  },
  'TI-06': (row) => {
    if (parseAmount(row.vat_amount) === null)
      return fail(`ช่องภาษีมูลค่าเพิ่ม ${show(row.vat_amount)} ไม่ได้แยกเป็นตัวเลข`, 'แสดงยอดภาษีมูลค่าเพิ่มแยกจากมูลค่าสินค้า')
    return pass(`แสดงภาษีมูลค่าเพิ่มแยก ${norm(row.vat_amount)} บาท`)
  },
  'TI-06b': (row, ctx) => {
    const vat = parseAmount(row.vat_amount)
    const amt = parseAmount(row.amount_ex_vat)
    if (vat === null || amt === null || amt < 0 || !Number.isFinite(ctx.vatRate)) return { verdict: 'n/a', evidence: 'ตรวจการคำนวณไม่ได้เพราะยอดภาษีหรือมูลค่าไม่ถูกต้อง' }
    const want = Math.round(amt * ctx.vatRate * 100) / 100
    // Per-line rounding can drift by up to 1 satang per line item.
    if (Math.abs(vat - want) > 0.01 * (ctx.lines?.length ?? 1) + 1e-9)
      return fail(`ภาษี ${vat.toFixed(2)} บาท แต่ ${amt.toFixed(2)} × ${(ctx.vatRate * 100).toFixed(0)}% = ${want.toFixed(2)} บาท`, 'คำนวณภาษีมูลค่าเพิ่มใหม่')
    return pass(`ภาษี ${vat.toFixed(2)} = ${amt.toFixed(2)} × ${(ctx.vatRate * 100).toFixed(0)}%`)
  },
  'TI-07': (row) => {
    if (isBlank(row.issue_date)) return fail('ไม่มีวันที่ออกใบกำกับภาษี', 'ระบุวัน เดือน ปี ที่ออกใบกำกับภาษี')
    if (!parseDate(row.issue_date)) return fail(`วันที่ ${show(row.issue_date)} ไม่ใช่วันที่จริง`, 'ตรวจวันที่อีกครั้ง')
    return pass(`วันที่ ${norm(row.issue_date)}`)
  },
  'TI-08': (row) =>
    isBranchNotation(row.seller_branch)
      ? pass(`ผู้ขาย: ${show(row.seller_branch)}`)
      : fail(`สาขาผู้ขาย ${show(row.seller_branch)} ไม่ตรงรูปแบบ`, 'ระบุ "สำนักงานใหญ่" หรือ "สาขาที่ ..." ของผู้ขาย'),
  'TI-09': (row) => {
    const reg = registrant(row)
    if (reg !== true) return { verdict: 'n/a', evidence: reg === false ? 'ผู้ซื้อไม่ได้จด VAT' : 'ไม่ทราบว่าผู้ซื้อจด VAT หรือไม่' }
    const p = taxIdProblem(row.buyer_tax_id)
    return p ? fail(`เลขผู้เสียภาษีผู้ซื้อ ${show(row.buyer_tax_id)}: ${p}`, 'ขอเลขผู้เสียภาษี 13 หลักจากผู้ซื้อ') : pass('เลขผู้เสียภาษีผู้ซื้อถูกรูปแบบ')
  },
  'TI-10': (row) => {
    if (registrant(row) !== true) return { verdict: 'n/a', evidence: 'ตรวจเฉพาะผู้ซื้อที่จด VAT' }
    return isBranchNotation(row.buyer_branch)
      ? pass(`ผู้ซื้อ: ${show(row.buyer_branch)}`)
      : fail(`สาขาผู้ซื้อ ${show(row.buyer_branch)} ไม่ตรงรูปแบบ`, 'ระบุ "สำนักงานใหญ่" หรือ "สาขาที่ ..." ของผู้ซื้อ')
  },
}
