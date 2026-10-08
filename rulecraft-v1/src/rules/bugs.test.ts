import { describe, expect, it } from 'vitest'
import { mutationTest, runPack } from './engine'
import type { Row } from './checks'
import Papa from 'papaparse'

describe('Potential bugs', () => {
  it('mutation test when no row passes a clause', () => {
    // Create rows where no row passes TI-01
    const rows: Row[] = [
      { invoice_no: 'INV-001', seller_name: 'A', seller_address: 'B', seller_tax_id: '0105536000313', seller_branch: 'HQ', buyer_name: 'C', buyer_address: 'D', buyer_tax_id: '0105536000313', buyer_branch: 'HQ', buyer_is_vat_registrant: 'yes', item_desc: 'item', qty: '1', amount_ex_vat: '100', vat_amount: '7', issue_date: '2026-11-15', doc_title: 'ใบเสร็จรับเงิน', book_no: '', unit_price: '', total: '' },
      { invoice_no: 'INV-002', seller_name: 'A', seller_address: 'B', seller_tax_id: '0105536000313', seller_branch: 'HQ', buyer_name: 'C', buyer_address: 'D', buyer_tax_id: '0105536000313', buyer_branch: 'HQ', buyer_is_vat_registrant: 'yes', item_desc: 'item', qty: '1', amount_ex_vat: '100', vat_amount: '7', issue_date: '2026-11-15', doc_title: 'Receipt', book_no: '', unit_price: '', total: '' },
    ]

    const mutants = mutationTest(rows, 0.07)
    const ti01 = mutants.find(m => m.clause.id === 'TI-01')
    expect(ti01).toBeDefined()
    expect(ti01!.row).toBeNull()
    expect(ti01!.killed).toBe(false)
    expect(ti01!.after).toBeNull()
  })

  it('mutation test with short tax IDs', () => {
    // Create a row with a short tax ID - the mutator for TI-02 slices the last character
    const rows: Row[] = [
      { invoice_no: 'INV-001', seller_name: 'A', seller_address: 'B', seller_tax_id: '123', seller_branch: 'HQ', buyer_name: 'C', buyer_address: 'D', buyer_tax_id: '0105536000313', buyer_branch: 'HQ', buyer_is_vat_registrant: 'yes', item_desc: 'item', qty: '1', amount_ex_vat: '100', vat_amount: '7', issue_date: '2026-11-15', doc_title: 'ใบกำกับภาษี', book_no: '', unit_price: '', total: '' },
    ]

    // This should not crash even though the tax ID is short
    const mutants = mutationTest(rows, 0.07)
    const ti02 = mutants.find(m => m.clause.id === 'TI-02')
    expect(ti02).toBeDefined()
    // The row fails TI-02 validation so it won't be used for mutation
    expect(ti02!.row).toBeNull()
  })

  it('handles CSV with semicolon delimiter', () => {
    const csv = 'invoice_no;seller_name;amount_ex_vat\nINV-001;Shop A;100'
    const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true })

    // PapaParse should auto-detect semicolon delimiter
    expect(parsed.meta.fields).toContain('invoice_no')
    expect(parsed.data[0].invoice_no).toBe('INV-001')
  })

  it('handles CSV with tab delimiter', () => {
    const csv = 'invoice_no\tseller_name\tamount_ex_vat\nINV-001\tShop A\t100'
    const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true })

    // PapaParse should auto-detect tab delimiter
    expect(parsed.meta.fields).toContain('invoice_no')
    expect(parsed.data[0].invoice_no).toBe('INV-001')
  })

  it('handles CSV with Windows line endings', () => {
    const csv = 'invoice_no,seller_name,amount_ex_vat\r\nINV-001,Shop A,100\r\nINV-002,Shop B,200'
    const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true })

    expect(parsed.data).toHaveLength(2)
    expect(parsed.data[0].invoice_no).toBe('INV-001')
    expect(parsed.data[1].invoice_no).toBe('INV-002')
  })

  it('handles duplicate column headers', () => {
    const csv = 'invoice_no,name,name,amount\nINV-001,A,B,100'
    const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true })

    // PapaParse renames duplicate headers by appending _1, _2, etc.
    expect(parsed.meta.fields).toEqual(['invoice_no', 'name', 'name_1', 'amount'])
    expect(parsed.data[0].name).toBe('A')
    expect(parsed.data[0].name_1).toBe('B')
  })

  it('handles very long CSV files', () => {
    // Create 10,000 rows
    const rows: Row[] = Array.from({ length: 10000 }, (_, i) => ({
      invoice_no: `INV-${String(i + 1).padStart(5, '0')}`,
      seller_name: 'A', seller_address: 'B', seller_tax_id: '0105536000313', seller_branch: 'HQ',
      buyer_name: 'C', buyer_address: 'D', buyer_tax_id: '0105536000313', buyer_branch: 'HQ',
      buyer_is_vat_registrant: 'yes', item_desc: 'item', qty: '1',
      amount_ex_vat: '100', vat_amount: '7',
      issue_date: '2026-11-15', doc_title: 'ใบกำกับภาษี',
      book_no: '', unit_price: '', total: ''
    }))

    // This should complete without hanging or crashing
    const start = Date.now()
    const results = runPack(rows, 'v2026', 0.07)
    const elapsed = Date.now() - start

    expect(results).toHaveLength(10000)
    expect(elapsed).toBeLessThan(5000) // Should complete in less than 5 seconds
  })

  it('TI-04 handles whitespace-only invoice numbers', () => {
    const rows: Row[] = [
      { invoice_no: '   ', seller_name: 'A', seller_address: 'B', seller_tax_id: '0105536000313', seller_branch: 'HQ', buyer_name: 'C', buyer_address: 'D', buyer_tax_id: '0105536000313', buyer_branch: 'HQ', buyer_is_vat_registrant: 'yes', item_desc: 'item', qty: '1', amount_ex_vat: '100', vat_amount: '7', issue_date: '2026-11-15', doc_title: 'ใบกำกับภาษี', book_no: '', unit_price: '', total: '' },
    ]
    const results = runPack(rows, 'v2026', 0.07)

    // Whitespace-only should be treated as blank
    expect(results[0]['TI-04']!.verdict).toBe('fail')
    expect(results[0]['TI-04']!.evidence).toContain('ไม่มีเลขที่ใบกำกับภาษี')
  })

  it('TI-05 handles zero quantity', () => {
    const rows: Row[] = [
      { invoice_no: 'INV-001', seller_name: 'A', seller_address: 'B', seller_tax_id: '0105536000313', seller_branch: 'HQ', buyer_name: 'C', buyer_address: 'D', buyer_tax_id: '0105536000313', buyer_branch: 'HQ', buyer_is_vat_registrant: 'yes', item_desc: 'item', qty: '0', amount_ex_vat: '100', vat_amount: '7', issue_date: '2026-11-15', doc_title: 'ใบกำกับภาษี', book_no: '', unit_price: '', total: '' },
    ]
    const results = runPack(rows, 'v2026', 0.07)

    expect(results[0]['TI-05']!.verdict).toBe('fail')
    expect(results[0]['TI-05']!.evidence).toContain('ต้องมากกว่า 0')
  })

  it('TI-05 handles negative quantity', () => {
    const rows: Row[] = [
      { invoice_no: 'INV-001', seller_name: 'A', seller_address: 'B', seller_tax_id: '0105536000313', seller_branch: 'HQ', buyer_name: 'C', buyer_address: 'D', buyer_tax_id: '0105536000313', buyer_branch: 'HQ', buyer_is_vat_registrant: 'yes', item_desc: 'item', qty: '-5', amount_ex_vat: '100', vat_amount: '7', issue_date: '2026-11-15', doc_title: 'ใบกำกับภาษี', book_no: '', unit_price: '', total: '' },
    ]
    const results = runPack(rows, 'v2026', 0.07)

    expect(results[0]['TI-05']!.verdict).toBe('fail')
    expect(results[0]['TI-05']!.evidence).toContain('ต้องมากกว่า 0')
  })

  it('TI-05 allows zero amount_ex_vat', () => {
    // Some invoices may have 0 amount (e.g., free items)
    const rows: Row[] = [
      { invoice_no: 'INV-001', seller_name: 'A', seller_address: 'B', seller_tax_id: '0105536000313', seller_branch: 'HQ', buyer_name: 'C', buyer_address: 'D', buyer_tax_id: '0105536000313', buyer_branch: 'HQ', buyer_is_vat_registrant: 'yes', item_desc: 'item', qty: '1', amount_ex_vat: '0', vat_amount: '0', issue_date: '2026-11-15', doc_title: 'ใบกำกับภาษี', book_no: '', unit_price: '', total: '' },
    ]
    const results = runPack(rows, 'v2026', 0.07)

    // TI-05 should pass with 0 amount (only negative is disallowed)
    expect(results[0]['TI-05']!.verdict).toBe('pass')
  })

  it('handles non-numeric VAT rate', () => {
    const rows: Row[] = [
      { invoice_no: 'INV-001', seller_name: 'A', seller_address: 'B', seller_tax_id: '0105536000313', seller_branch: 'HQ', buyer_name: 'C', buyer_address: 'D', buyer_tax_id: '0105536000313', buyer_branch: 'HQ', buyer_is_vat_registrant: 'yes', item_desc: 'item', qty: '1', amount_ex_vat: '100', vat_amount: '7', issue_date: '2026-11-15', doc_title: 'ใบกำกับภาษี', book_no: '', unit_price: '', total: '' },
    ]

    // NaN VAT rate should be handled as n/a (can't check)
    const results = runPack(rows, 'v2026', NaN)
    expect(results[0]['TI-06b']!.verdict).toBe('n/a')

    // Infinity should also be handled
    const results2 = runPack(rows, 'v2026', Infinity)
    expect(results2[0]['TI-06b']!.verdict).toBe('n/a')
  })
})
