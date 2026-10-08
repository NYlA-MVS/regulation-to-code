// P0 fixes from the legal research report (reports/กฎหมาย ตรวจใบกำกับภาษีขาย ก่อนยื่นภาษี.md, section 4.3).
import { describe, expect, it } from 'vitest'
import type { Row } from './checks'
import { groupInvoices, runInvoices, runPack } from './engine'
import { branchCode, parseDate, splitTaxId, taxIdProblem } from './validators'

const base: Row = {
  invoice_no: 'A-1', book_no: '', issue_date: '2026-11-15', doc_title: 'ใบกำกับภาษี',
  seller_name: 'บริษัท ก จำกัด', seller_address: '1 ถ.หนึ่ง', seller_tax_id: '0105558123451', seller_branch: 'สำนักงานใหญ่',
  buyer_name: 'บริษัท ข จำกัด', buyer_address: '2 ถ.สอง', buyer_tax_id: '0105547003211', buyer_branch: 'สำนักงานใหญ่', buyer_is_vat_registrant: 'Y',
  item_desc: 'น็อต', qty: '10', unit_price: '10', amount_ex_vat: '100.00', vat_amount: '7.00', total: '107.00',
}
const one = (over: Partial<Row>) => runPack([{ ...base, ...over } as Row], 'v2026', 0.07)[0]
const run = (rows: Partial<Row>[]) => {
  const inv = groupInvoices(rows.map((r) => ({ ...base, ...r }) as Row), 0.07)
  return { inv, res: runInvoices(inv, 'v2026', 0.07) }
}

describe('TI-01: English-only title is approved (ประกาศฯ 92 ข้อ 2, ป.86/2542 ข้อ 8)', () => {
  it.each(['TAX INVOICE', 'Tax Invoice / Receipt', 'TAXINVOICE'])('%s passes', (t) => expect(one({ doc_title: t })['TI-01']?.verdict).toBe('pass'))
  it('abbreviated tax invoice still goes to an expert', () => {
    expect(one({ doc_title: 'ใบกำกับภาษีอย่างย่อ' })['TI-01']?.verdict).toBe('needs_expert')
    expect(one({ doc_title: 'Tax Invoice (ABB)' })['TI-01']?.verdict).toBe('needs_expert')
  })
})

describe('dates: Thai month names and Excel serials (ป.86/2542 allows either era)', () => {
  it.each([
    ['8 ต.ค. 2569', '2026-10-08'], ['8 ตค 2569', '2026-10-08'], ['8 ตุลาคม 2569', '2026-10-08'], ['๘ ต.ค. ๒๕๖๙', '2026-10-08'],
    ['8 Oct 2026', '2026-10-08'], ['08-10-2569', '2026-10-08'], ['08.10.2026', '2026-10-08'], ['46303', '2026-10-08'],
  ])('%s', (v, iso) => expect(parseDate(v)?.toISOString().slice(0, 10)).toBe(iso))
  it.each(['31 ก.พ. 2569', '8 ตุลา', '123', '8 xyz 2569'])('rejects %s', (v) => expect(parseDate(v)).toBeNull())
  it('TI-07 passes a Thai-month date', () => expect(one({ issue_date: '15 พ.ย. 2569' })['TI-07']?.verdict).toBe('pass'))
})

describe('18-digit TIN (ETDA: 13-digit TIN + 5-digit branch)', () => {
  it('splits and validates', () => {
    expect(splitTaxId('0105558123451-00002')).toEqual({ tin: '0105558123451', branch: '00002' })
    expect(taxIdProblem('010555812345100000')).toBeNull()
    expect(taxIdProblem('010555812345200000')).not.toBeNull()
  })
  it('supplies the branch when the branch column is empty', () => {
    const r = one({ seller_tax_id: '010555812345100000', seller_branch: '', buyer_tax_id: '010554700321100003', buyer_branch: '' })
    expect([r['TI-02']?.verdict, r['TI-08']?.verdict, r['TI-09']?.verdict, r['TI-10']?.verdict]).toEqual(['pass', 'pass', 'pass', 'pass'])
  })
})

describe('TI-09 / TI-10 when the buyer VAT status is unknown', () => {
  it('valid buyer TIN + branch passes', () => {
    const r = one({ buyer_is_vat_registrant: '' })
    expect([r['TI-09']?.verdict, r['TI-10']?.verdict]).toEqual(['pass', 'pass'])
  })
  it('buyer TIN present but bad or branch missing → warn, not silent n/a', () => {
    expect(one({ buyer_is_vat_registrant: '', buyer_tax_id: '0105547003212' })['TI-09']?.verdict).toBe('warn')
    expect(one({ buyer_is_vat_registrant: '', buyer_branch: '' })['TI-10']?.verdict).toBe('warn')
  })
  it('no status and no TIN stays n/a (reported once at file level in the UI)', () => {
    const r = one({ buyer_is_vat_registrant: '', buyer_tax_id: '', buyer_branch: '' })
    expect([r['TI-09']?.verdict, r['TI-10']?.verdict]).toEqual(['n/a', 'n/a'])
  })
  it('a registered buyer is still a hard fail', () => {
    expect(one({ buyer_branch: '' })['TI-10']?.verdict).toBe('fail')
  })
})

describe('TI-11: total = value + VAT', () => {
  it('passes, warns on mismatch, n/a without a total', () => {
    expect(one({})['TI-11']?.verdict).toBe('pass')
    expect(one({ total: '110.00' })['TI-11']?.verdict).toBe('warn')
    expect(one({ total: '' })['TI-11']?.verdict).toBe('n/a')
  })
  it('works on grouped invoices with per-line totals', () => {
    const { res } = run([{}, { item_desc: 'สกรู', amount_ex_vat: '50.00', vat_amount: '3.50', total: '53.50' }])
    expect(res[0]['TI-11']?.verdict).toBe('pass')
  })
})

describe('TI-06b rounds half up (ป.86/2542 ข้อ 4(6))', () => {
  it('11.775 → 11.78', () => {
    expect(one({ amount_ex_vat: '168.21', vat_amount: '11.77', total: '' })['TI-06b']?.verdict).toBe('pass')
    expect(one({ amount_ex_vat: '168.25', vat_amount: '11.78', total: '' })['TI-06b']?.verdict).toBe('pass')
    expect(one({ amount_ex_vat: '168.25', vat_amount: '11.76', total: '' })['TI-06b']?.verdict).toBe('fail')
  })
})

describe('TI-04 duplicate key = seller TIN + branch + book + number', () => {
  it('same number at a different branch or book is not a duplicate', () => {
    const { res } = run([{}, { seller_branch: 'สาขาที่ 1', buyer_name: 'บริษัท ค จำกัด' }, { book_no: '2', buyer_name: 'บริษัท ง จำกัด' }])
    expect(res.map((r) => r['TI-04']?.verdict)).toEqual(['pass', 'pass', 'pass'])
  })
  it('different spellings of the same branch are the same branch', () => {
    expect(branchCode('สำนักงานใหญ่')).toBe(branchCode('HQ'))
    expect(branchCode('สาขาที่ 2')).toBe('00002')
    const { res } = run([{}, { invoice_no: 'B-1' }, { seller_branch: '00000', buyer_name: 'บริษัท ค จำกัด' }])
    expect(res.map((r) => r['TI-04']?.verdict)).toEqual(['pass', 'pass', 'fail'])
  })
})

describe('TI-15: header consistency inside one invoice (ป.86/2542 ข้อ 9(2))', () => {
  it('consecutive lines with a different date are one invoice that fails TI-15', () => {
    const { inv, res } = run([{}, { issue_date: '2026-11-16', item_desc: 'สกรู' }])
    expect(inv.length).toBe(1)
    expect(res[0]['TI-15']?.verdict).toBe('fail')
    expect(res[0]['TI-15']?.evidence).toMatch(/วันที่/)
    expect(res[0]['TI-04']?.verdict).toBe('pass')
  })
  it('the same number later in the file with another buyer is a duplicate (TI-04), not TI-15', () => {
    const { inv, res } = run([{}, { invoice_no: 'A-2' }, { buyer_name: 'บริษัท ค จำกัด' }])
    expect(inv.length).toBe(3)
    expect(res[2]['TI-04']?.verdict).toBe('fail')
    expect(res[0]['TI-15']?.verdict).toBe('pass')
  })
  it('spacing and branch spelling differences are not header conflicts', () => {
    const { res } = run([{}, { buyer_name: 'บริษัท  ข จำกัด', buyer_branch: '00000', buyer_tax_id: '0-1055-47003-21-1', item_desc: 'สกรู' }])
    expect(res[0]['TI-15']?.verdict).toBe('pass')
  })
})
