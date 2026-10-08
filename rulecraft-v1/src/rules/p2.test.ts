// P2 data-quality checks from the legal research report.
import { describe, expect, it } from 'vitest'
import { numberGaps } from '../io/sequence'
import type { Row } from './checks'
import { groupInvoices, runInvoices, runPack } from './engine'

const base = {
  invoice_no: 'A-0001', book_no: '', issue_date: '2026-09-15', doc_title: 'ใบกำกับภาษี',
  seller_name: 'บริษัท ก จำกัด', seller_address: '1 ถ.หนึ่ง', seller_tax_id: '0105558123451', seller_branch: 'สำนักงานใหญ่',
  buyer_name: 'บริษัท ข จำกัด', buyer_address: '2 ถ.สอง', buyer_tax_id: '0105547003211', buyer_branch: 'สำนักงานใหญ่', buyer_is_vat_registrant: 'Y',
  item_desc: 'น็อต', qty: '10', unit_price: '10', amount_ex_vat: '100.00', vat_amount: '7.00', total: '107.00',
} as Row
const opts = { today: new Date('2026-10-08') }
const one = (over: Partial<Row>) => runPack([{ ...base, ...over } as Row], 'v2026', 0.07, undefined, opts)[0]
const many = (rows: Partial<Row>[]) => runPack(rows.map((r) => ({ ...base, ...r }) as Row), 'v2026', 0.07, undefined, opts)

describe('TI-16: same tax ID, same name and address across the file', () => {
  it('warns on the odd one out', () => {
    const res = many([{}, { invoice_no: 'A-0002' }, { invoice_no: 'A-0003', buyer_name: 'บริษัท ข. จำกัด (เก่า)' }])
    expect(res.map((r) => r['TI-16']?.verdict)).toEqual(['pass', 'pass', 'warn'])
    expect(res[2]['TI-16']?.evidence).toMatch(/2 ใบอื่น/)
  })
  it('ignores spacing differences and 1-vs-1 splits', () => {
    expect(many([{}, { invoice_no: 'A-0002', buyer_name: 'บริษัท  ข  จำกัด' }]).map((r) => r['TI-16']?.verdict)).toEqual(['pass', 'pass'])
    expect(many([{}, { invoice_no: 'A-0002', buyer_name: 'บริษัท ค จำกัด' }]).map((r) => r['TI-16']?.verdict)).toEqual(['pass', 'pass'])
  })
  it('compares per branch, so branches may have different addresses', () => {
    const res = many([{}, { invoice_no: 'A-0002' }, { invoice_no: 'B-0001', seller_branch: 'สาขาที่ 1', seller_address: '9 ถ.เก้า' }])
    expect(res[2]['TI-16']?.verdict).toBe('pass')
  })
})

describe('TI-17: approved legal-entity abbreviations (ป.86/2542 ข้อ 8)', () => {
  it.each(['บจ. ข', 'บ. ข จก.', 'บมจ. ข', 'หจก. ข', 'บริษัท ข จำกัด', 'ABC Co., Ltd.'])('%s passes', (n) => expect(one({ buyer_name: n })['TI-17']?.verdict).toBe('pass'))
  it.each(['บจก. ข', 'บ.จ.ก. ข'])('%s warns', (n) => expect(one({ buyer_name: n })['TI-17']?.verdict).toBe('warn'))
})

describe('TI-18: individuals need a surname (ป.86/2542 ข้อ 4(3))', () => {
  it('passes with surname, warns without, n/a for companies', () => {
    expect(one({ buyer_name: 'นางสาวมาลี ใจดี' })['TI-18']?.verdict).toBe('pass')
    expect(one({ buyer_name: 'นาย สมชาย ใจดี' })['TI-18']?.verdict).toBe('pass')
    expect(one({ buyer_name: 'นายสมชาย' })['TI-18']?.verdict).toBe('warn')
    expect(one({ buyer_name: 'Mr. John' })['TI-18']?.verdict).toBe('warn')
    expect(one({})['TI-18']?.verdict).toBe('n/a')
  })
})

describe('TI-12: qty × unit price = value (ป.86/2542 ข้อ 14)', () => {
  it('passes, warns on hidden discount, n/a without unit price', () => {
    expect(one({})['TI-12']?.verdict).toBe('pass')
    expect(one({ amount_ex_vat: '90.00', vat_amount: '6.30', total: '96.30' })['TI-12']?.verdict).toBe('warn')
    expect(one({ unit_price: '' })['TI-12']?.verdict).toBe('n/a')
  })
  it('names the line on multi-line invoices', () => {
    const inv = groupInvoices([base, { ...base, item_desc: 'สกรู', qty: '3', unit_price: '5', amount_ex_vat: '20.00', vat_amount: '1.40', total: '21.40' }], 0.07)
    const r = runInvoices(inv, 'v2026', 0.07, opts)[0]['TI-12']
    expect(r?.verdict).toBe('warn')
    expect(r?.line).toBe(1)
  })
})

describe('TI-03 placeholders and branch spellings', () => {
  it.each(['เงินสด', 'ลูกค้าเงินสด', 'Cash', 'walk-in'])('buyer "%s" fails TI-03', (n) => expect(one({ buyer_name: n })['TI-03']?.verdict).toBe('fail'))
  it.each(['สาขา 1', 'Branch 2', 'branch no. 3'])('branch "%s" passes', (b) => expect(one({ seller_branch: b })['TI-08']?.verdict).toBe('pass'))
  it('a place name warns; an empty branch fails', () => {
    expect(one({ seller_branch: 'สาขาบางนา' })['TI-08']?.verdict).toBe('warn')
    expect(one({ seller_branch: '' })['TI-08']?.verdict).toBe('fail')
    expect(one({ buyer_branch: 'สาขาระยอง' })['TI-10']?.verdict).toBe('warn')
  })
})

describe('TI-19: numbering gaps (info only)', () => {
  it('lists missing numbers per series and ignores big jumps', () => {
    const inv = groupInvoices(['A-0001', 'A-0002', 'A-0005', 'A-0900', 'B-01'].map((n, i) => ({ ...base, invoice_no: n, buyer_name: `ผู้ซื้อ ${i}` }) as Row), 0.07)
    expect(numberGaps(inv)).toEqual([{ series: 'A-####', missing: ['A-0003', 'A-0004'], more: 0 }])
  })
})
