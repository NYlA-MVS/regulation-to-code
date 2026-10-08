import { describe, expect, it } from 'vitest'
import { parseDate, taxIdProblem, isBranchNotation } from './validators'
import { parseAmount } from './normalize'
import { applyMapping, autoMap, runPack } from './engine'
import type { Row } from './checks'

describe('CSV edge cases', () => {
  it('handles empty CSV data', () => {
    const rows = applyMapping([], autoMap([]))
    const results = runPack(rows, 'v2026', 0.07)
    expect(results).toEqual([])
  })

  it('handles duplicate header names', () => {
    const headers = ['invoice_no', 'invoice_no', 'date']
    const mapping = autoMap(headers)
    // Should map to the first occurrence
    expect(mapping.invoice_no).toBe('invoice_no')
  })

  it('handles blank invoice numbers in duplicate detection', () => {
    // Multiple rows with blank invoice_no should each fail with "ไม่มีเลขที่ใบกำกับภาษี"
    const rows: Row[] = [
      { invoice_no: '', seller_name: 'A', seller_address: 'B', seller_tax_id: '0105536000313', seller_branch: 'HQ', buyer_name: 'C', buyer_address: 'D', buyer_tax_id: '0105536000313', buyer_branch: 'HQ', buyer_is_vat_registrant: 'yes', item_desc: 'item', qty: '1', amount_ex_vat: '100', vat_amount: '7', issue_date: '2026-11-15', doc_title: 'ใบกำกับภาษี', book_no: '', unit_price: '', total: '' },
      { invoice_no: '', seller_name: 'A', seller_address: 'B', seller_tax_id: '0105536000313', seller_branch: 'HQ', buyer_name: 'C', buyer_address: 'D', buyer_tax_id: '0105536000313', buyer_branch: 'HQ', buyer_is_vat_registrant: 'yes', item_desc: 'item', qty: '1', amount_ex_vat: '100', vat_amount: '7', issue_date: '2026-11-15', doc_title: 'ใบกำกับภาษี', book_no: '', unit_price: '', total: '' },
      { invoice_no: '', seller_name: 'A', seller_address: 'B', seller_tax_id: '0105536000313', seller_branch: 'HQ', buyer_name: 'C', buyer_address: 'D', buyer_tax_id: '0105536000313', buyer_branch: 'HQ', buyer_is_vat_registrant: 'yes', item_desc: 'item', qty: '1', amount_ex_vat: '100', vat_amount: '7', issue_date: '2026-11-15', doc_title: 'ใบกำกับภาษี', book_no: '', unit_price: '', total: '' },
    ]
    const results = runPack(rows, 'v2026', 0.07)

    // First row should fail with "ไม่มีเลขที่ใบกำกับภาษี"
    expect(results[0]['TI-04']!.verdict).toBe('fail')
    expect(results[0]['TI-04']!.evidence).toContain('ไม่มีเลขที่ใบกำกับภาษี')

    // Second and third rows currently would be marked as duplicates of "" from first row
    // This is a bug - they should each independently fail with "ไม่มีเลขที่ใบกำกับภาษี"
    expect(results[1]['TI-04']!.verdict).toBe('fail')
    expect(results[1]['TI-04']!.evidence).toContain('ไม่มีเลขที่ใบกำกับภาษี')
    expect(results[2]['TI-04']!.verdict).toBe('fail')
    expect(results[2]['TI-04']!.evidence).toContain('ไม่มีเลขที่ใบกำกับภาษี')
  })
})

describe('Thai normalization edge cases', () => {
  it('handles Thai digits in tax ID', () => {
    expect(taxIdProblem('๐๑๐๕๕๓๖๐๐๐๓๑๓')).toBeNull()
    expect(taxIdProblem('๐-๑๐๕๕-๓๖๐๐๐-๓๑-๓')).toBeNull()
  })

  it('handles full-width digits in tax ID', () => {
    expect(taxIdProblem('０１０５５３６０００３１３')).toBeNull()
  })

  it('handles mixed Thai and Arabic digits in tax ID', () => {
    expect(taxIdProblem('0๑0๕๕๓๖000๓๑๓')).toBeNull()
  })

  it('handles Thai digits in amounts', () => {
    expect(parseAmount('๑๗๐')).toBe(170)
    expect(parseAmount('๑,๑๗๐.๐๐')).toBe(1170)
  })

  it('handles full-width digits in amounts', () => {
    expect(parseAmount('１７０')).toBe(170)
    expect(parseAmount('１,１７０.００')).toBe(1170)
  })

  it('handles Thai digits in branch notation', () => {
    expect(isBranchNotation('สาขาที่ ๒')).toBe(true)
    expect(isBranchNotation('00๐๐๐')).toBe(true)
  })
})

describe('Date parsing edge cases', () => {
  it('handles leap years correctly', () => {
    expect(parseDate('29/02/2567')).not.toBeNull() // 2024 is leap year
    expect(parseDate('29/02/2566')).toBeNull() // 2023 is not leap year
  })

  it('rejects invalid dates', () => {
    expect(parseDate('31/02/2569')).toBeNull()
    expect(parseDate('32/01/2569')).toBeNull()
    expect(parseDate('00/01/2569')).toBeNull()
    expect(parseDate('15/13/2569')).toBeNull()
  })

  it('handles Thai digits in dates', () => {
    expect(parseDate('๑๕/๑๑/๒๕๖๙')).not.toBeNull()
  })

  it('handles full-width digits in dates', () => {
    expect(parseDate('１５/１１/２５６９')).not.toBeNull()
  })

  it('rejects 2-digit years', () => {
    // 2-digit years are not supported - should fail
    expect(parseDate('15/11/69')).toBeNull()
    expect(parseDate('15/11/26')).toBeNull()
  })
})

describe('Amount parsing edge cases', () => {
  it('handles negative amounts', () => {
    expect(parseAmount('-100')).toBe(-100)
    expect(parseAmount('-1,170.50')).toBe(-1170.5)
  })

  it('handles zero', () => {
    expect(parseAmount('0')).toBe(0)
    expect(parseAmount('0.00')).toBe(0)
  })

  it('rejects invalid amount formats', () => {
    expect(parseAmount('abc')).toBeNull()
    expect(parseAmount('1.2.3')).toBeNull()
    expect(parseAmount('--100')).toBeNull()
  })

  it('handles amounts with only commas', () => {
    expect(parseAmount('1,170')).toBe(1170)
    expect(parseAmount('1,000,000')).toBe(1000000)
  })
})

describe('VAT calculation rounding', () => {
  it('respects 0.01 tolerance in TI-06b', () => {
    const row: Row = {
      invoice_no: 'INV-001',
      seller_name: 'A', seller_address: 'B', seller_tax_id: '0105536000313', seller_branch: 'HQ',
      buyer_name: 'C', buyer_address: 'D', buyer_tax_id: '0105536000313', buyer_branch: 'HQ',
      buyer_is_vat_registrant: 'yes', item_desc: 'item', qty: '1',
      amount_ex_vat: '142.85', // 142.85 * 0.07 = 9.9995 rounds to 10.00
      vat_amount: '10.00',
      issue_date: '2026-11-15', doc_title: 'ใบกำกับภาษี',
      book_no: '', unit_price: '', total: ''
    }
    const results = runPack([row], 'v2026', 0.07)
    expect(results[0]['TI-06b']!.verdict).toBe('pass')
  })

  it('fails when VAT is off by more than 0.01', () => {
    const row: Row = {
      invoice_no: 'INV-001',
      seller_name: 'A', seller_address: 'B', seller_tax_id: '0105536000313', seller_branch: 'HQ',
      buyer_name: 'C', buyer_address: 'D', buyer_tax_id: '0105536000313', buyer_branch: 'HQ',
      buyer_is_vat_registrant: 'yes', item_desc: 'item', qty: '1',
      amount_ex_vat: '100',
      vat_amount: '7.50', // Should be 7.00
      issue_date: '2026-11-15', doc_title: 'ใบกำกับภาษี',
      book_no: '', unit_price: '', total: ''
    }
    const results = runPack([row], 'v2026', 0.07)
    expect(results[0]['TI-06b']!.verdict).toBe('fail')
  })
})

describe('Registrant flag edge cases', () => {
  it('handles various registrant flag values', () => {
    const testRow = (flag: string, expectedVerdict: 'pass' | 'fail' | 'n/a') => {
      const row: Row = {
        invoice_no: 'INV-001',
        seller_name: 'A', seller_address: 'B', seller_tax_id: '0105536000313', seller_branch: 'HQ',
        buyer_name: 'C', buyer_address: 'D', buyer_tax_id: '0105536000313', buyer_branch: 'HQ',
        buyer_is_vat_registrant: flag, item_desc: 'item', qty: '1',
        amount_ex_vat: '100', vat_amount: '7',
        issue_date: '2026-11-15', doc_title: 'ใบกำกับภาษี',
        book_no: '', unit_price: '', total: ''
      }
      const results = runPack([row], 'v2026', 0.07)
      expect(results[0]['TI-09']!.verdict).toBe(expectedVerdict)
    }

    // Should be recognized as registered
    testRow('y', 'pass')
    testRow('Y', 'pass')
    testRow('yes', 'pass')
    testRow('YES', 'pass')
    testRow('true', 'pass')
    testRow('TRUE', 'pass')
    testRow('1', 'pass')
    testRow('จด', 'pass')
    testRow('ใช่', 'pass')

    // Should be recognized as not registered
    testRow('n', 'n/a')
    testRow('N', 'n/a')
    testRow('no', 'n/a')
    testRow('NO', 'n/a')
    testRow('false', 'n/a')
    testRow('FALSE', 'n/a')
    testRow('0', 'n/a')
    testRow('ไม่จด', 'n/a')
    testRow('ไม่ใช่', 'n/a')

    // Unknown status: the buyer TIN is still checked when present (here it is valid)
    testRow('', 'pass')
    testRow('maybe', 'pass')
    testRow('unknown', 'pass')
  })
})

describe('Tax ID validation edge cases', () => {
  it('handles short tax IDs correctly', () => {
    expect(taxIdProblem('')).not.toBeNull()
    expect(taxIdProblem('123')).not.toBeNull()
    expect(taxIdProblem('010553600031')).not.toBeNull() // 12 digits
  })

  it('handles tax IDs with invalid check digits', () => {
    expect(taxIdProblem('0105536000314')).not.toBeNull()
    expect(taxIdProblem('0105536000312')).not.toBeNull()
  })
})
