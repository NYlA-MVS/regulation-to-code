// P1 checks from the legal research report: rate by date, tax month, filing summary, abbreviated invoices.
import { describe, expect, it } from 'vitest'
import { filingSummary, likelyTaxMonth } from '../io/filing'
import type { Row } from './checks'
import { groupInvoices, runInvoices, runPack } from './engine'
import type { RunOptions } from './engine'
import { filingDeadlines, rateFor, thaiDate } from './rates'

const base = {
  invoice_no: 'A-1', book_no: '', issue_date: '2026-09-15', doc_title: 'ใบกำกับภาษี',
  seller_name: 'บริษัท ก จำกัด', seller_address: '1 ถ.หนึ่ง', seller_tax_id: '0105558123451', seller_branch: 'สำนักงานใหญ่',
  buyer_name: 'บริษัท ข จำกัด', buyer_address: '2 ถ.สอง', buyer_tax_id: '0105547003211', buyer_branch: 'สำนักงานใหญ่', buyer_is_vat_registrant: 'Y',
  item_desc: 'น็อต', qty: '10', unit_price: '10', amount_ex_vat: '100.00', vat_amount: '7.00', total: '107.00',
} as Row
const TODAY = new Date('2026-10-08T12:00:00Z')
const one = (over: Partial<Row>, opts: RunOptions = {}, rate = 0.07) => runPack([{ ...base, ...over } as Row], 'v2026', rate, undefined, { today: TODAY, ...opts })[0]

describe('TI-13: VAT rate by date (ม.80, พ.ร.ฎ. 807)', () => {
  it('7% applies through 30 ก.ย. 2570', () => {
    expect(rateFor(new Date('2027-09-30'))?.rate).toBe(0.07)
    expect(rateFor(new Date('2027-10-01'))).toBeNull()
    expect(one({})['TI-13']?.verdict).toBe('pass')
  })
  it('warns after the decree ends, or when the set rate differs from the law', () => {
    expect(one({ issue_date: '2027-10-01' }, { today: new Date('2028-01-01') })['TI-13']?.verdict).toBe('warn')
    expect(one({}, {}, 0.1)['TI-13']?.verdict).toBe('warn')
  })
})

describe('TI-14: tax month, future and pre-2558 dates (ม.86, ม.83)', () => {
  it('passes inside the tax month', () => expect(one({}, { taxMonth: '2026-09' })['TI-14']?.verdict).toBe('pass'))
  it('warns outside the tax month and names the right month', () => {
    const r = one({ issue_date: '2026-08-31' }, { taxMonth: '2026-09' })['TI-14']
    expect(r?.verdict).toBe('warn')
    expect(r?.fix).toMatch(/ส\.ค\. 2569/)
  })
  it('warns on a future date', () => expect(one({ issue_date: '2026-10-09' })['TI-14']?.verdict).toBe('warn'))
  it('warns before 1 ม.ค. 2558 and skips the DG 199 checks', () => {
    const r = one({ issue_date: '2014-12-31', seller_branch: '', buyer_branch: '' })
    expect(r['TI-14']?.verdict).toBe('warn')
    expect([r['TI-08']?.verdict, r['TI-09']?.verdict, r['TI-10']?.verdict]).toEqual(['n/a', 'n/a', 'n/a'])
  })
})

describe('TI-24: abbreviated invoice to a VAT-registered buyer (ประกาศฯ 42 ข้อ 2(2))', () => {
  it('warns only when the buyer is registered', () => {
    expect(one({ doc_title: 'ใบกำกับภาษีอย่างย่อ' })['TI-24']?.verdict).toBe('warn')
    expect(one({ doc_title: 'ใบกำกับภาษีอย่างย่อ', buyer_is_vat_registrant: 'N' })['TI-24']?.verdict).toBe('n/a')
    expect(one({})['TI-24']?.verdict).toBe('pass')
  })
})

describe('ภ.พ.30 due dates (ม.83 + e-filing extension to returns due 31 ม.ค. 2570)', () => {
  it('Sep 2569 → 15 / 23 ต.ค. 2569', () => {
    const d = filingDeadlines('2026-09')!
    expect(thaiDate(d.paper)).toBe('15 ต.ค. 2569')
    expect(thaiDate(d.online!)).toBe('23 ต.ค. 2569')
  })
  it('Dec 2569 is the last month with the online extension on file', () => {
    expect(filingDeadlines('2026-12')!.online).not.toBeNull()
    expect(filingDeadlines('2027-01')!.online).toBeNull()
  })
})

describe('F-01 filing summary', () => {
  const rows = [
    {}, { item_desc: 'สกรู', amount_ex_vat: '50.00', vat_amount: '3.50', total: '53.50' },
    { invoice_no: 'B-1', seller_branch: 'สาขาที่ 2', amount_ex_vat: '200.00', vat_amount: '14.00', total: '214.00' },
    { invoice_no: 'C-1', issue_date: '2026-08-31', buyer_branch: '' },
  ].map((r) => ({ ...base, ...r }) as Row)
  const inv = groupInvoices(rows, 0.07)
  const res = runInvoices(inv, 'v2026', 0.07, { today: TODAY })
  it('defaults the tax month to the most common invoice month', () => expect(likelyTaxMonth(inv)).toBe('2026-09'))
  it('groups by premises and month, sums value and VAT, counts failing invoices', () => {
    expect(filingSummary(inv, res)).toEqual([
      { sellerTin: '0105558123451', branch: '00000', month: '2026-08', invoices: 1, amount: 100, vat: 7, failing: 1, unreadable: 0 },
      { sellerTin: '0105558123451', branch: '00000', month: '2026-09', invoices: 1, amount: 150, vat: 10.5, failing: 0, unreadable: 0 },
      { sellerTin: '0105558123451', branch: '00002', month: '2026-09', invoices: 1, amount: 200, vat: 14, failing: 0, unreadable: 0 },
    ])
  })
})
