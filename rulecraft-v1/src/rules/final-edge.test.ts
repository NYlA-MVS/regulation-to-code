import { describe, expect, it } from 'vitest'
import { runPack } from './engine'
import type { Row } from './checks'
import { parseAmount } from './normalize'

describe('Final edge cases', () => {
  it('handles very large amounts', () => {
    const row: Row = {
      invoice_no: 'INV-001',
      seller_name: 'A', seller_address: 'B', seller_tax_id: '0105536000313', seller_branch: 'HQ',
      buyer_name: 'C', buyer_address: 'D', buyer_tax_id: '0105536000313', buyer_branch: 'HQ',
      buyer_is_vat_registrant: 'yes', item_desc: 'item', qty: '1',
      amount_ex_vat: '999999999.99',
      vat_amount: '69999999.99',
      issue_date: '2026-11-15', doc_title: 'ใบกำกับภาษี',
      book_no: '', unit_price: '', total: ''
    }
    const results = runPack([row], 'v2026', 0.07)

    // Should handle large numbers
    expect(results[0]!['TI-05']!.verdict).toBe('pass')
    expect(results[0]!['TI-06']!.verdict).toBe('pass')
  })

  it('handles amounts with many decimal places', () => {
    expect(parseAmount('100.123456789')).toBe(100.123456789)
    expect(parseAmount('0.01')).toBe(0.01)
    expect(parseAmount('0.001')).toBe(0.001)
  })

  it('handles registrant flag with extra whitespace', () => {
    const row: Row = {
      invoice_no: 'INV-001',
      seller_name: 'A', seller_address: 'B', seller_tax_id: '0105536000313', seller_branch: 'HQ',
      buyer_name: 'C', buyer_address: 'D', buyer_tax_id: '0105536000313', buyer_branch: 'HQ',
      buyer_is_vat_registrant: '  yes  ', item_desc: 'item', qty: '1',
      amount_ex_vat: '100', vat_amount: '7',
      issue_date: '2026-11-15', doc_title: 'ใบกำกับภาษี',
      book_no: '', unit_price: '', total: ''
    }
    const results = runPack([row], 'v2026', 0.07)

    // Should trim and recognize 'yes'
    expect(results[0]!['TI-09']!.verdict).toBe('pass')
  })

  it('handles registrant flag with decomposed Thai', () => {
    const row: Row = {
      invoice_no: 'INV-001',
      seller_name: 'A', seller_address: 'B', seller_tax_id: '0105536000313', seller_branch: 'HQ',
      buyer_name: 'C', buyer_address: 'D', buyer_tax_id: '0105536000313', buyer_branch: 'HQ',
      buyer_is_vat_registrant: 'จด', item_desc: 'item', qty: '1',
      amount_ex_vat: '100', vat_amount: '7',
      issue_date: '2026-11-15', doc_title: 'ใบกำกับภาษี',
      book_no: '', unit_price: '', total: ''
    }
    const results = runPack([row], 'v2026', 0.07)

    expect(results[0]!['TI-09']!.verdict).toBe('pass')
  })

  it('handles TI-03 placeholder detection with various cases', () => {
    const placeholders = ['-', '--', 'N/A', 'na', 'NONE', 'null', 'ลูกค้าทั่วไป', 'ไม่ระบุ', 'ไม่มี']

    for (const placeholder of placeholders) {
      const row: Row = {
        invoice_no: 'INV-001',
        seller_name: 'A', seller_address: 'B', seller_tax_id: '0105536000313', seller_branch: 'HQ',
        buyer_name: placeholder, buyer_address: 'Real Address', buyer_tax_id: '0105536000313', buyer_branch: 'HQ',
        buyer_is_vat_registrant: 'yes', item_desc: 'item', qty: '1',
        amount_ex_vat: '100', vat_amount: '7',
        issue_date: '2026-11-15', doc_title: 'ใบกำกับภาษี',
        book_no: '', unit_price: '', total: ''
      }
      const results = runPack([row], 'v2026', 0.07)

      // Should detect placeholder and fail
      expect(results[0]!['TI-03']!.verdict).toBe('fail')
      expect(results[0]!['TI-03']!.evidence).toContain('คำแทน')
    }
  })

  it('handles mixed case in branch notation', () => {
    const branches = ['HQ', 'hq', 'Hq', 'hQ', 'HEAD OFFICE', 'Head Office', 'branch no. 1', 'BRANCH NO. 1']

    for (const branch of branches) {
      const row: Row = {
        invoice_no: 'INV-001',
        seller_name: 'A', seller_address: 'B', seller_tax_id: '0105536000313', seller_branch: branch,
        buyer_name: 'C', buyer_address: 'D', buyer_tax_id: '0105536000313', buyer_branch: 'HQ',
        buyer_is_vat_registrant: 'yes', item_desc: 'item', qty: '1',
        amount_ex_vat: '100', vat_amount: '7',
        issue_date: '2026-11-15', doc_title: 'ใบกำกับภาษี',
        book_no: '', unit_price: '', total: ''
      }
      const results = runPack([row], 'v2026', 0.07)

      // Should recognize branch notation regardless of case
      expect(results[0]!['TI-08']!.verdict).toBe('pass')
    }
  })

  it('handles amounts with leading/trailing spaces', () => {
    expect(parseAmount('  100  ')).toBe(100)
    expect(parseAmount('  1,170.50  ')).toBe(1170.5)
  })

  it('handles tax IDs with various dash formats', () => {
    const row: Row = {
      invoice_no: 'INV-001',
      seller_name: 'A', seller_address: 'B', seller_tax_id: '0-1055-36000-31-3',
      buyer_name: 'C', buyer_address: 'D', buyer_tax_id: '0--1055--36000--31--3', buyer_branch: 'HQ',
      buyer_is_vat_registrant: 'yes', item_desc: 'item', qty: '1', seller_branch: 'HQ',
      amount_ex_vat: '100', vat_amount: '7',
      issue_date: '2026-11-15', doc_title: 'ใบกำกับภาษี',
      book_no: '', unit_price: '', total: ''
    }
    const results = runPack([row], 'v2026', 0.07)

    // Should strip dashes and validate
    expect(results[0]!['TI-02']!.verdict).toBe('pass')
    expect(results[0]!['TI-09']!.verdict).toBe('pass')
  })

  it('handles date with BE year exactly at threshold', () => {
    const row: Row = {
      invoice_no: 'INV-001',
      seller_name: 'A', seller_address: 'B', seller_tax_id: '0105536000313', seller_branch: 'HQ',
      buyer_name: 'C', buyer_address: 'D', buyer_tax_id: '0105536000313', buyer_branch: 'HQ',
      buyer_is_vat_registrant: 'yes', item_desc: 'item', qty: '1',
      amount_ex_vat: '100', vat_amount: '7',
      issue_date: '15/11/2400', // Exactly at threshold
      doc_title: 'ใบกำกับภาษี',
      book_no: '', unit_price: '', total: ''
    }
    const results = runPack([row], 'v2026', 0.07)

    // 2400 should still be treated as BE and converted to 1857 CE
    expect(results[0]!['TI-07']!.verdict).toBe('pass')
  })

  it('handles duplicate invoice numbers after normalization', () => {
    // Invoice numbers that are different in raw form but same after normalization
    const rows: Row[] = [
      { invoice_no: 'INV-001', seller_name: 'A', seller_address: 'B', seller_tax_id: '0105536000313', seller_branch: 'HQ', buyer_name: 'C', buyer_address: 'D', buyer_tax_id: '0105536000313', buyer_branch: 'HQ', buyer_is_vat_registrant: 'yes', item_desc: 'item', qty: '1', amount_ex_vat: '100', vat_amount: '7', issue_date: '2026-11-15', doc_title: 'ใบกำกับภาษี', book_no: '', unit_price: '', total: '' },
      { invoice_no: '  INV-001  ', seller_name: 'A', seller_address: 'B', seller_tax_id: '0105536000313', seller_branch: 'HQ', buyer_name: 'C', buyer_address: 'D', buyer_tax_id: '0105536000313', buyer_branch: 'HQ', buyer_is_vat_registrant: 'yes', item_desc: 'item', qty: '1', amount_ex_vat: '100', vat_amount: '7', issue_date: '2026-11-15', doc_title: 'ใบกำกับภาษี', book_no: '', unit_price: '', total: '' },
    ]
    const results = runPack(rows, 'v2026', 0.07)

    // First row should pass
    expect(results[0]!['TI-04']!.verdict).toBe('pass')
    // Second row should fail as duplicate
    expect(results[1]!['TI-04']!.verdict).toBe('fail')
    expect(results[1]!['TI-04']!.evidence).toContain('ซ้ำ')
  })

  it('handles decimal qty', () => {
    const row: Row = {
      invoice_no: 'INV-001',
      seller_name: 'A', seller_address: 'B', seller_tax_id: '0105536000313', seller_branch: 'HQ',
      buyer_name: 'C', buyer_address: 'D', buyer_tax_id: '0105536000313', buyer_branch: 'HQ',
      buyer_is_vat_registrant: 'yes', item_desc: 'item', qty: '0.5',
      amount_ex_vat: '100', vat_amount: '7',
      issue_date: '2026-11-15', doc_title: 'ใบกำกับภาษี',
      book_no: '', unit_price: '', total: ''
    }
    const results = runPack([row], 'v2026', 0.07)

    // Should accept decimal quantity > 0
    expect(results[0]!['TI-05']!.verdict).toBe('pass')
  })
})
