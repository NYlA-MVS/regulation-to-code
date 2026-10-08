// P3: credit/debit notes, cancel-and-reissue, currency, VAT category, tax point, filing signs.
import { describe, expect, it } from 'vitest'
import { filingSummary } from '../io/filing'
import type { Row } from './checks'
import { docType, vatCategory } from './checks'
import { groupInvoices, runInvoices, runPack } from './engine'

const base = {
  invoice_no: 'A-0001', book_no: '', issue_date: '2026-09-15', doc_title: 'ใบกำกับภาษี',
  seller_name: 'บริษัท ก จำกัด', seller_address: '1 ถ.หนึ่ง', seller_tax_id: '0105558123451', seller_branch: 'สำนักงานใหญ่',
  buyer_name: 'บริษัท ข จำกัด', buyer_address: '2 ถ.สอง', buyer_tax_id: '0105547003211', buyer_branch: 'สำนักงานใหญ่', buyer_is_vat_registrant: 'Y',
  item_desc: 'น็อต', qty: '10', unit_price: '10', amount_ex_vat: '100.00', vat_amount: '7.00', total: '107.00',
} as Row
const cn = { invoice_no: 'CN-0001', doc_title: 'ใบลดหนี้', item_desc: '', qty: '', unit_price: '', ref_invoice_no: 'A-0001', original_value: '100.00', correct_value: '80.00', amount_ex_vat: '20.00', vat_amount: '1.40', total: '21.40', reason: 'คืนสินค้า 2 ชิ้น' } as Partial<Row>
const opts = { today: new Date('2026-10-08') }
const one = (over: Partial<Row>) => runPack([{ ...base, ...over } as Row], 'v2026', 0.07, undefined, opts)[0]
const many = (rows: Partial<Row>[]) => {
  const inv = groupInvoices(rows.map((r) => ({ ...base, ...r }) as Row), 0.07)
  return { inv, res: runInvoices(inv, 'v2026', 0.07, opts) }
}

describe('document type', () => {
  it('reads the doc_type column or falls back to the title', () => {
    expect(docType({ ...base, doc_type: 'CN' })).toBe('CN')
    expect(docType({ ...base, doc_title: 'ใบเพิ่มหนี้/ใบกำกับภาษี' })).toBe('DN')
    expect(docType({ ...base, doc_title: 'Credit Note' })).toBe('CN')
    expect(docType(base)).toBe('INV')
  })
})

describe('CN-01..04: credit and debit notes (ม.86/9, 86/10)', () => {
  it('a complete credit note passes every CN check and skips invoice-only checks', () => {
    const r = one(cn)
    expect(['CN-01', 'CN-02', 'CN-03', 'CN-04'].map((id) => r[id as 'CN-01']?.verdict)).toEqual(['pass', 'pass', 'pass', 'pass'])
    expect([r['TI-01']?.verdict, r['TI-05']?.verdict]).toEqual(['n/a', 'n/a'])
    expect(r['TI-06b']?.verdict).toBe('pass')
  })
  it('flags each missing particular', () => {
    expect(one({ ...cn, doc_type: 'CN', doc_title: 'ใบกำกับภาษี' })['CN-01']?.verdict).toBe('fail')
    expect(one({ ...cn, ref_invoice_no: '' })['CN-02']?.verdict).toBe('fail')
    expect(one({ ...cn, original_value: '' })['CN-03']?.verdict).toBe('fail')
    expect(one({ ...cn, correct_value: '120.00' })['CN-03']?.verdict).toBe('fail')
    expect(one({ ...cn, amount_ex_vat: '25.00', vat_amount: '1.75', total: '26.75' })['CN-03']?.verdict).toBe('fail')
    expect(one({ ...cn, reason: '' })['CN-04']?.verdict).toBe('fail')
  })
  it('a debit note needs a higher correct value', () => {
    const dn = { ...cn, invoice_no: 'DN-0001', doc_title: 'ใบเพิ่มหนี้', correct_value: '120.00' }
    expect(one(dn)['CN-03']?.verdict).toBe('pass')
    expect(one({ ...dn, correct_value: '80.00' })['CN-03']?.verdict).toBe('fail')
  })
  it('CN checks do not apply to invoices', () => expect(one({})['CN-02']?.verdict).toBe('n/a'))
})

describe('TI-21: cancel and reissue (ป.86/2542 ข้อ 25)', () => {
  it('cancelled original + replacement with the same date passes; only TI-04/TI-21 apply to the cancelled one', () => {
    const { res } = many([{ status: 'ยกเลิก', buyer_name: 'บริษัท ขอ จำกัด' }, { invoice_no: 'A-0002', replaces_invoice_no: 'A-0001' }])
    expect(res[1]['TI-21']?.verdict).toBe('pass')
    expect(res[0]['TI-03']?.verdict).toBe('n/a')
    expect(res[0]['TI-21']?.verdict).toBe('pass')
  })
  it('warns when the original is not marked cancelled or the paper date differs', () => {
    expect(many([{}, { invoice_no: 'A-0002', replaces_invoice_no: 'A-0001' }]).res[1]['TI-21']?.verdict).toBe('warn')
    expect(many([{ status: 'cancelled' }, { invoice_no: 'A-0002', replaces_invoice_no: 'A-0001', issue_date: '2026-09-20' }]).res[1]['TI-21']?.verdict).toBe('warn')
  })
  it('e-Tax replacements use a new date (ประกาศฯ 15 ข้อ 22)', () => {
    expect(many([{ status: 'cancelled' }, { invoice_no: 'A-0002', replaces_invoice_no: 'A-0001', issue_date: '2026-09-20', channel: 'e-Tax' }]).res[1]['TI-21']?.verdict).toBe('pass')
  })
  it('reusing the old number goes to an expert (ป.86 ข้อ 25 vs ruling 0702(กม.05)/1041)', () => {
    expect(one({ replaces_invoice_no: 'A-0001' })['TI-21']?.verdict).toBe('needs_expert')
  })
})

describe('TI-22: foreign currency (ประกาศฯ 39 ข้อ 5, ฉบับที่ 92)', () => {
  it('n/a for baht, fail without a rate, warn needing approval, pass for zero-rated exporters', () => {
    expect(one({ currency: 'THB' })['TI-22']?.verdict).toBe('n/a')
    expect(one({ currency: 'USD' })['TI-22']?.verdict).toBe('fail')
    expect(one({ currency: 'USD', exchange_rate: '36.50' })['TI-22']?.verdict).toBe('warn')
    expect(one({ currency: 'USD', exchange_rate: '36.50', vat_category: '0%', vat_amount: '0.00', total: '100.00' })['TI-22']?.verdict).toBe('pass')
  })
})

describe('TI-23 and TI-06b: zero-rated and exempt (ม.80/1, ป.86/2542 ข้อ 4(5))', () => {
  it('reads category spellings', () => {
    expect(['0%', 'ส่งออก', 'zero', 'ยกเว้น', 'exempt', '', 'standard'].map((c) => vatCategory({ ...base, vat_category: c }))).toEqual(['zero', 'zero', 'zero', 'exempt', 'exempt', 'standard', 'standard'])
  })
  it('zero-rated must carry no VAT', () => {
    const ok = one({ vat_category: '0%', vat_amount: '0.00', total: '100.00' })
    expect([ok['TI-23']?.verdict, ok['TI-06b']?.verdict, ok['TI-13']?.verdict]).toEqual(['pass', 'pass', 'n/a'])
    expect(one({ vat_category: '0%' })['TI-23']?.verdict).toBe('fail')
  })
  it('mixed lines: VAT is computed on standard lines only', () => {
    const { res } = many([{ vat_amount: '7.00', total: '107.00' }, { item_desc: 'ผักสด', vat_category: 'ยกเว้น', amount_ex_vat: '50.00', vat_amount: '0.00', total: '50.00' }])
    expect([res[0]['TI-23']?.verdict, res[0]['TI-06b']?.verdict]).toEqual(['pass', 'pass'])
  })
  it('a fully exempt invoice warns', () => expect(one({ vat_category: 'exempt', vat_amount: '0.00', total: '100.00' })['TI-23']?.verdict).toBe('warn'))
})

describe('TI-25: tax point (ม.78(1), 78/1)', () => {
  it('passes on or before delivery/payment, warns after and names the right month', () => {
    expect(one({ delivery_date: '2026-09-15' })['TI-25']?.verdict).toBe('pass')
    expect(one({ delivery_date: '2026-09-10' })['TI-25']?.verdict).toBe('warn')
    const r = one({ delivery_date: '2026-08-30' })['TI-25']
    expect(r?.fix).toMatch(/ส\.ค\. 2569/)
    expect(one({ payment_date: '2026-09-01' })['TI-25']?.verdict).toBe('warn')
    expect(one({})['TI-25']?.verdict).toBe('n/a')
  })
})

describe('filing summary signs', () => {
  it('credit notes subtract, debit notes add, cancelled are listed but not summed', () => {
    const { inv, res } = many([{}, { ...cn }, { ...cn, invoice_no: 'DN-0001', doc_title: 'ใบเพิ่มหนี้', correct_value: '110.00', amount_ex_vat: '10.00', vat_amount: '0.70', total: '10.70' }, { invoice_no: 'A-0009', status: 'ยกเลิก', buyer_name: 'บริษัท ค จำกัด' }])
    const [row] = filingSummary(inv, res)
    expect({ amount: row.amount, vat: row.vat, notes: row.notes, cancelled: row.cancelled, invoices: row.invoices }).toEqual({ amount: 90, vat: 6.3, notes: 2, cancelled: 1, invoices: 4 })
  })
})
