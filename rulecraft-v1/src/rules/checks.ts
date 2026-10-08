// One pure check per clause. Each returns a verdict with evidence and a fix hint.
import type { ClauseId } from './clauses'
import { compact, digitsOnly, isBlank, norm, parseAmount } from './normalize'
import { DG199_FROM, monthOf, RATE_KNOWN_UNTIL, rateFor, thaiDate, thaiMonth } from './rates'
import { branchCode, isBranchNotation, isPlaceholder, parseDate, splitTaxId, taxIdProblem } from './validators'

/** warn: likely a problem but depends on facts the file does not show. */
export type Verdict = 'pass' | 'fail' | 'n/a' | 'needs_expert' | 'warn'
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
  /** "YYYY-MM": the tax month being filed. TI-14 compares invoice dates with it. */
  taxMonth?: string
  /** Defaults to now; tests pin it. */
  today?: Date
  /** Most common name/address per tax ID across the file (see buildPeers). */
  peers?: Peers
  /** Every row in the file by invoice number, for cross-references (TI-21). */
  byNumber?: Map<string, Row[]>
}

const TITLE = compact('ใบกำกับภาษี')
const ABBREVIATED = compact('อย่างย่อ')
const pass = (evidence: string): Result => ({ verdict: 'pass', evidence })
const fail = (evidence: string, fix: string): Result => ({ verdict: 'fail', evidence, fix })
const warn = (evidence: string, fix: string): Result => ({ verdict: 'warn', evidence, fix })
const show = (v: string | undefined) => (isBlank(v) ? '(ว่าง)' : `"${norm(v)}"`)

const registrant = (row: Row): boolean | null => {
  const v = norm(row.buyer_is_vat_registrant).toLowerCase()
  if (['y', 'yes', 'true', '1', 'จด', 'ใช่'].includes(v)) return true
  if (['n', 'no', 'false', '0', 'ไม่จด', 'ไม่ใช่'].includes(v)) return false
  return null
}

export const CHECKS: Record<ClauseId, (row: Row, ctx: Context) => Result> = {
  'TI-01': (row) => {
    if (docType(row) !== 'INV') return { verdict: 'n/a', evidence: 'ใบเพิ่มหนี้/ใบลดหนี้ ตรวจที่ CN-01' }
    const t = compact(row.doc_title)
    if (t.includes(TITLE)) {
      if (t.includes(ABBREVIATED))
        return { verdict: 'needs_expert', evidence: `ชื่อเอกสาร ${show(row.doc_title)} เป็นใบกำกับภาษีอย่างย่อ`, fix: 'ใบกำกับภาษีอย่างย่อไม่ใช่แบบเต็มรูป ให้ผู้เชี่ยวชาญยืนยันว่ารายการนี้ต้องออกแบบเต็มรูปหรือไม่' }
      return pass(`ชื่อเอกสาร ${show(row.doc_title)} มีคำว่า ใบกำกับภาษี`)
    }
    // ประกาศอธิบดีฯ ฉบับที่ 92 ข้อ 2 and ป.86/2542 ข้อ 8: English with Thai baht counts as approved.
    if (/taxinvoice/i.test(t)) {
      if (/abb|abbreviated/i.test(t))
        return { verdict: 'needs_expert', evidence: `ชื่อเอกสาร ${show(row.doc_title)} เป็นใบกำกับภาษีอย่างย่อ`, fix: 'ใบกำกับภาษีอย่างย่อไม่ใช่แบบเต็มรูป ให้ผู้เชี่ยวชาญยืนยันว่ารายการนี้ต้องออกแบบเต็มรูปหรือไม่' }
      return pass(`ชื่อเอกสาร ${show(row.doc_title)} เป็นภาษาอังกฤษ ใช้ได้เมื่อเป็นเงินบาท (ประกาศอธิบดีฯ ฉบับที่ 92 ข้อ 2)`)
    }
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
    const book = norm(row.book_no)
    if (ctx.seen.has(invoiceKey(row)))
      return fail(`เลขที่ "${n}"${book ? ` เล่มที่ "${book}"` : ''} ของสาขาเดียวกันซ้ำกับใบก่อนหน้า`, 'เลขที่ใบกำกับภาษีต้องไม่ซ้ำกันภายในสาขาและเล่มเดียวกัน ถ้าเป็นใบที่ยกเลิกแล้วออกใหม่ ให้ระบุเลขที่ใหม่')
    return pass(`เลขที่ "${n}" ไม่ซ้ำ`)
  },
  'TI-05': (row, ctx) => {
    if (docType(row) !== 'INV') return { verdict: 'n/a', evidence: 'ใบเพิ่มหนี้/ใบลดหนี้ไม่บังคับรายการสินค้า (ม.86/9, 86/10)' }
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
    // Zero-rated and exempt lines carry no VAT; only standard-rated value is the base.
    const lines = ctx.lines ?? [row]
    const base = lines.length > 1 && lines.some((l) => vatCategory(l) !== 'standard')
      ? lines.filter((l) => vatCategory(l) === 'standard').reduce((n, l) => n + (parseAmount(l.amount_ex_vat) ?? 0), 0)
      : vatCategory(row) === 'standard' ? amt : 0
    // ป.86/2542 ข้อ 4(6): round half up at the third decimal.
    const want = roundHalfUp(base * ctx.vatRate)
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
  'TI-08': (row) => {
    if (beforeDG199(row)) return beforeDG199Result
    const branch = isBlank(row.seller_branch) ? (splitTaxId(row.seller_tax_id).branch ?? '') : row.seller_branch
    if (isBranchNotation(branch)) return pass(`ผู้ขาย: ${show(branch)}`)
    if (!isBlank(branch)) return warn(`สาขาผู้ขาย ${show(row.seller_branch)} เป็นชื่อสถานที่ ไม่ใช่ "สำนักงานใหญ่" หรือ "สาขาที่ ..."`, 'ระบุตามใบทะเบียน ภ.พ.20 เช่น "สาขาที่ 00001"')
    return fail('ไม่มีสาขาผู้ขาย', 'ระบุ "สำนักงานใหญ่" หรือ "สาขาที่ ..." ของผู้ขาย')
  },
  'TI-09': (row) => {
    if (beforeDG199(row)) return beforeDG199Result
    const reg = registrant(row)
    if (reg === false) return { verdict: 'n/a', evidence: 'ผู้ซื้อไม่ได้จด VAT' }
    if (reg === null) {
      if (isBlank(row.buyer_tax_id)) return { verdict: 'n/a', evidence: 'ไม่ทราบว่าผู้ซื้อจด VAT หรือไม่ และไม่มีเลขผู้เสียภาษีผู้ซื้อ' }
      const p = taxIdProblem(row.buyer_tax_id)
      return p
        ? warn(`เลขผู้เสียภาษีผู้ซื้อ ${show(row.buyer_tax_id)}: ${p} (ไม่ได้ระบุว่าผู้ซื้อจด VAT)`, 'ถ้าผู้ซื้อจด VAT ต้องแก้เลขให้ถูก ลูกค้าจึงจะใช้ภาษีซื้อได้ และควรใส่ช่อง "ผู้ซื้อจด VAT" ในไฟล์')
        : pass('เลขผู้เสียภาษีผู้ซื้อถูกรูปแบบ')
    }
    const p = taxIdProblem(row.buyer_tax_id)
    return p ? fail(`เลขผู้เสียภาษีผู้ซื้อ ${show(row.buyer_tax_id)}: ${p}`, 'ขอเลขผู้เสียภาษี 13 หลักจากผู้ซื้อ') : pass('เลขผู้เสียภาษีผู้ซื้อถูกรูปแบบ')
  },
  'TI-10': (row) => {
    if (beforeDG199(row)) return beforeDG199Result
    const reg = registrant(row)
    const branch = isBlank(row.buyer_branch) ? (splitTaxId(row.buyer_tax_id).branch ?? '') : row.buyer_branch
    if (reg === false) return { verdict: 'n/a', evidence: 'ตรวจเฉพาะผู้ซื้อที่จด VAT' }
    if (reg === null) {
      if (isBlank(row.buyer_tax_id)) return { verdict: 'n/a', evidence: 'ไม่ทราบว่าผู้ซื้อจด VAT หรือไม่ และไม่มีเลขผู้เสียภาษีผู้ซื้อ' }
      return isBranchNotation(branch)
        ? pass(`ผู้ซื้อ: ${show(branch)}`)
        : warn(`ผู้ซื้อมีเลขผู้เสียภาษีแต่สาขาผู้ซื้อ ${show(row.buyer_branch)} ไม่ตรงรูปแบบ (ไม่ได้ระบุว่าผู้ซื้อจด VAT)`, 'ถ้าผู้ซื้อจด VAT ต้องระบุ "สำนักงานใหญ่" หรือ "สาขาที่ ..." ของผู้ซื้อ')
    }
    if (isBranchNotation(branch)) return pass(`ผู้ซื้อ: ${show(branch)}`)
    if (!isBlank(branch)) return warn(`สาขาผู้ซื้อ ${show(row.buyer_branch)} เป็นชื่อสถานที่ ไม่ใช่ "สำนักงานใหญ่" หรือ "สาขาที่ ..."`, 'ระบุตามใบทะเบียน ภ.พ.20 ของผู้ซื้อ เช่น "สาขาที่ 00001"')
    return fail('ไม่มีสาขาผู้ซื้อ', 'ระบุ "สำนักงานใหญ่" หรือ "สาขาที่ ..." ของผู้ซื้อ')
  },
  'TI-11': (row, ctx) => {
    if (isBlank(row.total)) return { verdict: 'n/a', evidence: 'ไฟล์ไม่มียอดรวมทั้งสิ้น' }
    const total = parseAmount(row.total)
    const amt = parseAmount(row.amount_ex_vat)
    const vat = parseAmount(row.vat_amount)
    if (total === null) return warn(`ยอดรวม ${show(row.total)} ไม่ใช่ตัวเลข`, 'ตรวจช่องยอดรวมทั้งสิ้น')
    if (amt === null || vat === null) return { verdict: 'n/a', evidence: 'ตรวจยอดรวมไม่ได้เพราะมูลค่าหรือภาษีไม่ใช่ตัวเลข' }
    const want = Math.round((amt + vat) * 100) / 100
    if (Math.abs(total - want) > 0.01 * (ctx.lines?.length ?? 1) + 1e-9)
      return warn(`ยอดรวม ${total.toFixed(2)} บาท แต่มูลค่า ${amt.toFixed(2)} + ภาษี ${vat.toFixed(2)} = ${want.toFixed(2)} บาท`, 'ตรวจมูลค่า ภาษี และยอดรวมอีกครั้ง ถ้ามีส่วนลด ต้องแสดงในใบและคำนวณภาษีหลังหักส่วนลด')
    return pass(`ยอดรวม ${total.toFixed(2)} = มูลค่า + ภาษี`)
  },
  'TI-12': (row, ctx) => {
    const lines = ctx.lines ?? [row]
    let checked = 0
    for (const [k, line] of lines.entries()) {
      const qty = parseAmount(line.qty)
      const price = parseAmount(line.unit_price)
      const amt = parseAmount(line.amount_ex_vat)
      if (qty === null || price === null || amt === null) continue
      checked++
      const want = roundHalfUp(qty * price)
      if (Math.abs(want - amt) > 0.01 + 1e-9) {
        const at = lines.length > 1 ? `รายการที่ ${k + 1}: ` : ''
        return { ...warn(`${at}${qty} × ${price.toFixed(2)} = ${want.toFixed(2)} บาท แต่มูลค่าเป็น ${amt.toFixed(2)} บาท`, 'ถ้ามีส่วนลด ต้องแสดงส่วนลดในใบกำกับภาษีให้ชัด แล้วคำนวณภาษีจากมูลค่าหลังหักส่วนลด'), line: k }
      }
    }
    return checked ? pass('จำนวน × ราคาต่อหน่วย ตรงกับมูลค่า') : { verdict: 'n/a', evidence: 'ไม่มีราคาต่อหน่วยให้ตรวจ' }
  },
  'TI-13': (row, ctx) => {
    if (vatCategory(row) !== 'standard') return { verdict: 'n/a', evidence: 'รายการอัตรา 0% หรือยกเว้น' }
    const d = parseDate(row.issue_date)
    if (!d) return { verdict: 'n/a', evidence: 'ไม่ทราบวันที่ จึงหาอัตราตามกฎหมายไม่ได้' }
    const law = rateFor(d)
    if (!law)
      return warn(`วันที่ ${thaiDate(d)} เลยวันที่ ${thaiDate(new Date(RATE_KNOWN_UNTIL))} ซึ่งเป็นวันสุดท้ายที่มีพระราชกฤษฎีกากำหนดอัตรา 7%`, 'ตรวจว่ามีพระราชกฤษฎีกาฉบับใหม่กำหนดอัตราเท่าใด ถ้าไม่ต่ออายุ อัตราจะกลับไปตามมาตรา 80')
    if (Math.abs(law.rate - ctx.vatRate) > 1e-9)
      return warn(`ตั้งอัตราตรวจไว้ ${(ctx.vatRate * 100).toFixed(1)}% แต่อัตราตามกฎหมาย ณ วันที่ ${thaiDate(d)} คือ ${(law.rate * 100).toFixed(0)}%`, `ใช้อัตรา ${(law.rate * 100).toFixed(0)}% ตาม${law.source} เว้นแต่เป็นรายการอัตรา 0% เช่นการส่งออก`)
    return pass(`อัตรา ${(law.rate * 100).toFixed(0)}% ตาม${law.source}`)
  },
  'TI-14': (row, ctx) => {
    const d = parseDate(row.issue_date)
    if (!d) return { verdict: 'n/a', evidence: 'ไม่ทราบวันที่' }
    const today = ctx.today ?? new Date()
    if (d.toISOString().slice(0, 10) > today.toISOString().slice(0, 10))
      return warn(`วันที่ ${thaiDate(d)} เป็นวันในอนาคต`, 'ใบกำกับภาษีต้องออกทันทีที่ความรับผิดเกิดขึ้น ตรวจว่าพิมพ์วันที่หรือปีผิดหรือไม่')
    if (d.toISOString().slice(0, 10) < DG199_FROM)
      return warn(`วันที่ ${thaiDate(d)} ก่อน 1 ม.ค. 2558`, 'ตรวจว่าปีถูกต้อง ใบที่ออกก่อนวันนี้ไม่ต้องมีสาขาและเลขผู้ซื้อตามประกาศฯ ฉบับที่ 199 จึงข้ามข้อ TI-08 ถึง TI-10')
    if (ctx.taxMonth && monthOf(d) !== ctx.taxMonth)
      return warn(`ใบลงวันที่ ${thaiDate(d)} อยู่นอกเดือนภาษี ${thaiMonth(ctx.taxMonth)} ที่กำลังจะยื่น`, `ภาษีขายของใบนี้ต้องอยู่ใน ภ.พ.30 เดือน ${thaiMonth(monthOf(d))} ถ้ายังไม่ได้รวมไว้ ให้ยื่นแบบเพิ่มเติมของเดือนนั้น`)
    return pass(ctx.taxMonth ? `อยู่ในเดือนภาษี ${thaiMonth(ctx.taxMonth)}` : 'วันที่ไม่อยู่ในอนาคต')
  },
  'TI-16': (row, ctx) => {
    if (!ctx.peers) return { verdict: 'n/a', evidence: 'ตรวจเทียบทั้งไฟล์เท่านั้น' }
    const issues: string[] = []
    for (const [field, label, key] of [
      ['seller_name', 'ชื่อผู้ขาย', sellerKey(row)],
      ['seller_address', 'ที่อยู่ผู้ขาย', sellerKey(row)],
      ['buyer_name', 'ชื่อผู้ซื้อ', buyerKey(row)],
    ] as const) {
      if (!key || isBlank(row[field])) continue
      const top = ctx.peers.get(`${field}\u0001${key}`)
      if (top && top.count >= 2 && looseText(row[field]) !== top.key) issues.push(`${label} ${show(row[field])} ต่างจาก ${show(top.value)} ที่ใช้ใน ${top.count} ใบอื่นของเลขผู้เสียภาษีเดียวกัน`)
    }
    return issues.length
      ? warn(issues.join(' · '), 'ใช้ชื่อและที่อยู่ตามที่จดทะเบียน VAT ให้ตรงกันทุกใบ ถ้าผู้ซื้อเปลี่ยนชื่อแล้ว ต้องใช้ชื่อใหม่ (ป.86/2542 ข้อ 11)')
      : pass('ชื่อและที่อยู่ตรงกับใบอื่นของเลขผู้เสียภาษีเดียวกัน')
  },
  'TI-17': (row) => {
    const bad = [['ผู้ขาย', row.seller_name], ['ผู้ซื้อ', row.buyer_name]].filter(([, n]) => /(^|\s)บ\.?จ\.?ก\.?(\s|$)/.test(norm(n)))
    return bad.length
      ? warn(`ชื่อ${bad.map(([who, n]) => `${who} ${show(n)}`).join(' และ ')} ใช้คำย่อ "บจก." ซึ่งไม่อยู่ในรายการคำย่อของ ป.86/2542`, 'ใช้ "บริษัท ... จำกัด", "บ. ... จก." หรือ "บจ." แทน (ยังไม่พบคำวินิจฉัยว่า "บจก." ใช้ไม่ได้ จึงเป็นเพียงคำเตือน)')
      : pass('คำย่อนิติบุคคลอยู่ในรูปแบบที่รับรอง')
  },
  'TI-18': (row) => {
    const n = norm(row.buyer_name).replace(/\s+/g, ' ')
    const m = /^(นางสาว|นาง|นาย|น\.ส\.|ด\.ช\.|ด\.ญ\.|mr\.?|mrs\.?|ms\.?|miss)\s*(.*)$/i.exec(n)
    if (!m) return { verdict: 'n/a', evidence: 'ไม่ใช่ชื่อบุคคลธรรมดาที่มีคำนำหน้า' }
    return m[2].split(' ').filter(Boolean).length >= 2
      ? pass('มีชื่อและนามสกุลผู้ซื้อ')
      : warn(`ชื่อผู้ซื้อ ${show(row.buyer_name)} ไม่มีนามสกุล`, 'ผู้ซื้อที่เป็นบุคคลธรรมดาต้องระบุทั้งชื่อและนามสกุล')
  },
  'TI-21': (row, ctx) => {
    if (isCancelled(row)) return pass('ใบนี้ถูกยกเลิก ไม่นับยอดในแบบ ภ.พ.30')
    const old = norm(row.replaces_invoice_no)
    if (!old) return { verdict: 'n/a', evidence: 'ไม่ใช่ใบที่ออกแทนใบที่ยกเลิก' }
    if (old === norm(row.invoice_no)) return { verdict: 'needs_expert', evidence: `ออกแทนโดยใช้เลขที่เดิม "${old}"`, fix: 'ป.86/2542 ข้อ 25 ให้ใช้เลขที่ใหม่ แต่ข้อหารือ กค 0702(กม.05)/1041 ยอมให้ใช้เลขเดิมได้ในบางกรณี ควรให้ผู้เชี่ยวชาญยืนยัน' }
    const originals = ctx.byNumber?.get(old) ?? []
    if (!originals.length) return pass(`ออกแทนใบเลขที่ "${old}" (ใบเดิมไม่อยู่ในไฟล์นี้)`)
    const orig = originals[0]
    if (!originals.some(isCancelled)) return warn(`ออกแทนใบเลขที่ "${old}" แต่ใบเดิมในไฟล์ยังไม่ได้ระบุว่ายกเลิก`, 'ระบุสถานะ "ยกเลิก" ที่ใบเดิม และหมายเหตุการยกเลิกในรายงานภาษีขายของเดือนที่ออกใบใหม่')
    const a = parseDate(row.issue_date), b = parseDate(orig.issue_date)
    if (a && b && a.getTime() !== b.getTime() && !isEtax(row))
      return warn(`ใบใหม่ลงวันที่ ${thaiDate(a)} แต่ใบเดิมลงวันที่ ${thaiDate(b)}`, 'ใบกระดาษที่ออกแทนต้องลงวันที่ตรงกับใบเดิม (ป.86/2542 ข้อ 25) ยกเว้น e-Tax Invoice ที่ใช้วันที่ใหม่ (ประกาศอธิบดีฯ ฉบับที่ 15 ข้อ 22)')
    return pass(`ออกแทนใบเลขที่ "${old}" ที่ยกเลิกแล้ว`)
  },
  'TI-22': (row) => {
    const cur = norm(row.currency).toUpperCase()
    if (!cur || ['THB', 'BAHT', 'บาท', '฿'].includes(cur)) return { verdict: 'n/a', evidence: 'เงินบาท' }
    const fx = parseAmount(row.exchange_rate)
    if (fx === null || fx <= 0) return fail(`ใบเป็นสกุล ${cur} แต่ไม่มีอัตราแลกเปลี่ยน`, 'ระบุอัตราแลกเปลี่ยนเป็นเงินบาทในใบกำกับภาษี ตามมาตรา 79/4 (ประกาศอธิบดีฯ ฉบับที่ 39 ข้อ 5)')
    if (vatCategory(row) === 'zero') return pass(`สกุล ${cur} อัตรา ${fx} บาท (ผู้ส่งออกอัตรา 0% ไม่ต้องขออนุมัติ ตามประกาศฯ ฉบับที่ 92 ข้อ 3)`)
    return warn(`ใบเป็นสกุล ${cur} อัตรา ${fx} บาท`, 'การออกใบกำกับภาษีเป็นเงินตราต่างประเทศต้องได้รับอนุมัติจากอธิบดี (ประกาศฯ ฉบับที่ 92 ข้อ 4) ตรวจว่ามีหนังสืออนุมัติ')
  },
  'TI-23': (row, ctx) => {
    const lines = ctx.lines ?? [row]
    const cats = new Set(lines.map(vatCategory))
    if (cats.size === 1 && cats.has('standard')) return { verdict: 'n/a', evidence: 'รายการอัตราปกติทั้งหมด' }
    const vat = parseAmount(row.vat_amount) ?? 0
    if (!cats.has('standard') && vat > 0)
      return fail(`รายการทั้งหมดเป็นอัตรา 0% หรือยกเว้น แต่มีภาษี ${vat.toFixed(2)} บาท`, 'รายการอัตรา 0% และรายการยกเว้นไม่ต้องเรียกเก็บภาษีมูลค่าเพิ่ม')
    if (cats.size === 1 && cats.has('exempt'))
      return warn('ทั้งใบเป็นรายการยกเว้นภาษี', 'การขายที่ได้รับยกเว้น (ม.81) ไม่ต้องออกใบกำกับภาษี ถ้าออก ภาษีที่แสดงต้องเป็นศูนย์และควรระบุว่ายกเว้น')
    if (cats.has('exempt') && cats.has('standard'))
      return pass('มีทั้งรายการปกติและรายการยกเว้น ตรวจภาษีจากรายการปกติเท่านั้น (ต้องทำเครื่องหมายแยกในใบ ตาม ป.86/2542 ข้อ 4(5))')
    return pass('รายการอัตรา 0% ไม่มีภาษี')
  },
  'TI-25': (row) => {
    const d = parseDate(row.issue_date)
    const del = parseDate(row.delivery_date), paid = parseDate(row.payment_date)
    if (!d || (!del && !paid)) return { verdict: 'n/a', evidence: 'ไม่มีวันส่งมอบหรือวันรับชำระ' }
    const events = [del && ['ส่งมอบ', del], paid && ['รับชำระ', paid]].filter(Boolean) as [string, Date][]
    const [label, first] = events.sort((a, b) => a[1].getTime() - b[1].getTime())[0]
    if (d.getTime() > first.getTime()) {
      const sameMonth = monthOf(d) === monthOf(first)
      return warn(`ออกใบวันที่ ${thaiDate(d)} หลังวัน${label} ${thaiDate(first)}`, `ความรับผิดเกิดเมื่อ${label} ต้องออกใบกำกับภาษีทันที${sameMonth ? '' : ` ภาษีขายนี้เป็นของเดือน ${thaiMonth(monthOf(first))} ไม่ใช่เดือนที่ออกใบ`}`)
    }
    return pass(`ออกใบไม่ช้ากว่าวัน${label}`)
  },
  'TI-26': (row) => {
    const yes = (v: string | undefined) => /^(y|yes|true|1|ใช่|มี)$/i.test(norm(v))
    const seen = [yes(row.img_handwritten) && 'มีรอยแก้ไขด้วยมือ', yes(row.img_copy) && 'เป็นสำเนา ไม่ใช่ต้นฉบับ', yes(row.img_title_not_printed) && /ใบกำกับภาษี|ใบลดหนี้|ใบเพิ่มหนี้/.test(compact(row.doc_title)) && 'คำว่า "ใบกำกับภาษี" ไม่ได้ตีพิมพ์ (เช่น ประทับตรายางหรือเขียนเอง)'].filter(Boolean)
    if (isBlank(row.img_handwritten) && isBlank(row.img_copy) && isBlank(row.img_title_not_printed)) return { verdict: 'n/a', evidence: 'ไม่ได้อ่านจากภาพ' }
    return seen.length
      ? warn(`จากการอ่านภาพ: ${seen.join(', ')}`, 'ลูกค้าอาจใช้ภาษีซื้อจากใบนี้ไม่ได้ ตรวจต้นฉบับ ถ้ามีการแก้ไขที่ไม่ใช่ที่อยู่หรือเลขผู้เสียภาษีตาม ป.46/2537 ให้ยกเลิกแล้วออกใบใหม่')
      : pass('จากการอ่านภาพ: ไม่พบรอยแก้ด้วยมือหรือสำเนา')
  },
  'CN-01': (row) => {
    const t = docType(row)
    if (t === 'INV') return { verdict: 'n/a', evidence: 'ไม่ใช่ใบเพิ่มหนี้/ใบลดหนี้' }
    const word = t === 'CN' ? 'ใบลดหนี้' : 'ใบเพิ่มหนี้'
    const title = compact(row.doc_title)
    if (title.includes(compact(word)) || (t === 'CN' ? /creditnote/i : /debitnote/i).test(title)) return pass(`ชื่อเอกสารมีคำว่า ${word}`)
    return fail(`เป็น${word} แต่ชื่อเอกสาร ${show(row.doc_title)} ไม่มีคำว่า "${word}"`, `ใส่คำว่า "${word}" ในที่ที่เห็นได้เด่นชัด`)
  },
  'CN-02': (row) => {
    if (docType(row) === 'INV') return { verdict: 'n/a', evidence: 'ไม่ใช่ใบเพิ่มหนี้/ใบลดหนี้' }
    return isBlank(row.ref_invoice_no) ? fail('ไม่ได้อ้างเลขที่ใบกำกับภาษีเดิม', 'ระบุเลขที่ (และเล่มที่ถ้ามี) ของใบกำกับภาษีเดิม') : pass(`อ้างใบกำกับภาษีเดิมเลขที่ ${show(row.ref_invoice_no)}`)
  },
  'CN-03': (row) => {
    const t = docType(row)
    if (t === 'INV') return { verdict: 'n/a', evidence: 'ไม่ใช่ใบเพิ่มหนี้/ใบลดหนี้' }
    const o = parseAmount(row.original_value), c = parseAmount(row.correct_value), diff = parseAmount(row.amount_ex_vat)
    if (o === null || c === null) return fail('ไม่มีมูลค่าตามใบเดิมหรือมูลค่าที่ถูกต้อง', 'ระบุมูลค่าตามใบกำกับภาษีเดิม มูลค่าที่ถูกต้อง และผลต่าง')
    if ((t === 'CN' && c >= o) || (t === 'DN' && c <= o))
      return fail(`${t === 'CN' ? 'ใบลดหนี้' : 'ใบเพิ่มหนี้'} แต่มูลค่าที่ถูกต้อง ${c.toFixed(2)} ${t === 'CN' ? 'ไม่ได้น้อยกว่า' : 'ไม่ได้มากกว่า'}มูลค่าเดิม ${o.toFixed(2)}`, 'ตรวจประเภทเอกสารและมูลค่า')
    if (diff !== null && Math.abs(Math.abs(o - c) - Math.abs(diff)) > 0.01)
      return fail(`ผลต่าง ${Math.abs(o - c).toFixed(2)} ไม่ตรงกับมูลค่าในเอกสาร ${Math.abs(diff).toFixed(2)}`, 'มูลค่าก่อน VAT ของใบเพิ่มหนี้/ใบลดหนี้ต้องเท่ากับผลต่างของมูลค่าทั้งสอง')
    return pass(`มูลค่าเดิม ${o.toFixed(2)} → ${c.toFixed(2)} ผลต่าง ${Math.abs(o - c).toFixed(2)}`)
  },
  'CN-04': (row) => {
    if (docType(row) === 'INV') return { verdict: 'n/a', evidence: 'ไม่ใช่ใบเพิ่มหนี้/ใบลดหนี้' }
    return isBlank(row.reason) ? fail('ไม่มีเหตุผลการออกเอกสาร', 'ระบุคำอธิบายสั้น ๆ ถึงสาเหตุ เช่น คืนสินค้า ลดราคา') : pass(`เหตุผล: ${show(row.reason)}`)
  },
  'TI-24': (row) => {
    if (!compact(row.doc_title).includes(ABBREVIATED) && !/\babb\b|abbreviated/i.test(norm(row.doc_title)))
      return pass('ไม่ใช่ใบกำกับภาษีอย่างย่อ')
    if (registrant(row) !== true) return { verdict: 'n/a', evidence: 'ใบอย่างย่อ แต่ผู้ซื้อไม่ได้ระบุว่าจด VAT' }
    return warn('ออกใบกำกับภาษีอย่างย่อให้ผู้ซื้อที่จด VAT', 'ผู้ซื้อใช้ภาษีซื้อจากใบอย่างย่อไม่ได้ (ประกาศฯ ฉบับที่ 42 ข้อ 2(2)) ควรออกใบกำกับภาษีเต็มรูปให้แทน')
  },
  'TI-15': (row, ctx) => {
    const lines = ctx.lines ?? [row]
    if (lines.length < 2) return pass('ใบนี้มีบรรทัดเดียว')
    const differ = HEADER_FIELDS.filter(([f]) => lines.some((l) => headerValue(f, l) !== headerValue(f, lines[0]))).map(([, label]) => label)
    if (differ.length)
      return fail(`บรรทัดของเลขที่ "${norm(row.invoice_no)}" มี${differ.join(', ')}ไม่ตรงกัน`, 'ถ้าเป็นใบเดียวกัน ให้แก้หัวใบทุกบรรทัดให้ตรงกัน ถ้าเป็นคนละใบ แปลว่าใช้เลขที่ซ้ำ ต้องออกเลขที่ใหม่')
    return pass(`หัวใบตรงกันทั้ง ${lines.length} บรรทัด`)
  },
}

const HEADER_FIELDS = [['issue_date', 'วันที่'], ['doc_title', 'ชื่อเอกสาร'], ['buyer_name', 'ชื่อผู้ซื้อ'], ['buyer_tax_id', 'เลขผู้เสียภาษีผู้ซื้อ'], ['buyer_branch', 'สาขาผู้ซื้อ']] as const
const headerValue = (f: string, r: Row) => (f === 'buyer_branch' ? branchCode(r[f]) : f === 'buyer_tax_id' ? digitsOnly(r[f]) : compact(r[f]).toLowerCase())

/** ป.86/2542 ข้อ 4(6): round VAT half up at the third decimal. The epsilon absorbs binary float error. */
export function roundHalfUp(n: number): number {
  return Math.round((n + Math.sign(n) * 1e-9) * 100) / 100
}

/** Invoices are numbered per business premises and per book, so the duplicate key includes both. */
export function invoiceKey(row: Row): string {
  return [splitTaxId(row.seller_tax_id).tin, branchCode(row.seller_branch), norm(row.book_no), norm(row.invoice_no)].join('\u0001')
}

const beforeDG199 = (row: Row) => {
  const d = parseDate(row.issue_date)
  return d !== null && d.toISOString().slice(0, 10) < DG199_FROM
}
const beforeDG199Result: Result = { verdict: 'n/a', evidence: 'ใบออกก่อน 1 ม.ค. 2558 ประกาศอธิบดีฯ ฉบับที่ 199 ยังไม่บังคับ' }

// ---- File-wide name/address consistency (TI-16) ----
export type Peers = Map<string, { key: string; value: string; count: number }>
const looseText = (v: string | undefined) => compact(v).toLowerCase()
const sellerKey = (r: Row) => { const t = splitTaxId(r.seller_tax_id).tin; return t ? `${t}:${branchCode(r.seller_branch)}` : '' }
const buyerKey = (r: Row) => { const t = splitTaxId(r.buyer_tax_id).tin; return t ? `${t}:${branchCode(r.buyer_branch)}` : '' }

/** For each tax ID + branch, the most common spelling of each name/address field. */
export function buildPeers(rows: Row[]): Peers {
  const counts = new Map<string, Map<string, { value: string; count: number }>>()
  for (const r of rows) {
    for (const [field, key] of [['seller_name', sellerKey(r)], ['seller_address', sellerKey(r)], ['buyer_name', buyerKey(r)]] as const) {
      if (!key || isBlank(r[field])) continue
      const k = `${field}\u0001${key}`
      const m = counts.get(k) ?? new Map()
      const v = looseText(r[field])
      m.set(v, { value: norm(r[field]), count: (m.get(v)?.count ?? 0) + 1 })
      counts.set(k, m)
    }
  }
  const out: Peers = new Map()
  for (const [k, m] of counts) {
    const [key, top] = [...m].sort((a, b) => b[1].count - a[1].count)[0]
    // Only a clear majority is a reference; a 1-vs-1 split says nothing about which is right.
    const second = [...m.values()].map((x) => x.count).sort((a, b) => b - a)[1] ?? 0
    if (top.count > second) out.set(k, { key, ...top })
  }
  return out
}

// ---- Document type, status and VAT category (optional columns, with fallbacks) ----
export type DocType = 'INV' | 'CN' | 'DN'
export function docType(row: Row): DocType {
  const t = compact(row.doc_type).toLowerCase()
  if (/^(cn|creditnote|ใบลดหนี้|ลดหนี้|81)$/.test(t)) return 'CN'
  if (/^(dn|debitnote|ใบเพิ่มหนี้|เพิ่มหนี้|80)$/.test(t)) return 'DN'
  const title = compact(row.doc_title).toLowerCase()
  if (title.includes(compact('ใบลดหนี้')) || title.includes('creditnote')) return 'CN'
  if (title.includes(compact('ใบเพิ่มหนี้')) || title.includes('debitnote')) return 'DN'
  return 'INV'
}
export const isCancelled = (row: Row) => /^(ยกเลิก|cancel(l?ed)?|void|c)$/i.test(norm(row.status))
export const isEtax = (row: Row) => /e-?tax|xml|time\s*stamp|อิเล็กทรอนิกส์/i.test(norm(row.channel))
export function vatCategory(row: Row): 'standard' | 'zero' | 'exempt' {
  const c = compact(row.vat_category).toLowerCase()
  if (/^(0|0%|0\.0+%?|zero|zerorated|ส่งออก|export|อัตรา0%?)$/.test(c)) return 'zero'
  if (/^(exempt|ยกเว้น|e|ex|nonvat)$/.test(c)) return 'exempt'
  return 'standard'
}
