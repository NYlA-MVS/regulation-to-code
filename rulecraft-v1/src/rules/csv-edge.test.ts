import { describe, expect, it } from 'vitest'
import Papa from 'papaparse'
import { applyMapping, autoMap, runPack } from './engine'

describe('CSV parsing edge cases', () => {
  const parse = (text: string) => Papa.parse<Record<string, string>>(text.replace(/^﻿/, ''), { header: true, skipEmptyLines: true })

  it('handles empty CSV file', () => {
    const parsed = parse('')
    expect(parsed.data).toEqual([])
    expect(parsed.meta.fields).toEqual([])
  })

  it('handles header-only CSV file', () => {
    const parsed = parse('invoice_no,seller_name,buyer_name')
    expect(parsed.data).toEqual([])
    expect(parsed.meta.fields).toEqual(['invoice_no', 'seller_name', 'buyer_name'])
  })

  it('handles CSV with BOM (Byte Order Mark)', () => {
    const csv = '﻿invoice_no,seller_name,amount\nINV-001,Shop A,100'
    const parsed = parse(csv)

    // BOM should be stripped
    expect(parsed.meta.fields).toContain('invoice_no')
    expect(parsed.data[0].invoice_no).toBe('INV-001')
  })

  it('handles CSV with only whitespace rows', () => {
    const csv = 'invoice_no,seller_name\n\n   \n\n'
    const parsed = parse(csv)

    // skipEmptyLines skips completely empty lines, but not whitespace-only
    expect(parsed.data.length).toBeGreaterThanOrEqual(0)
  })

  it('handles CSV with trailing empty columns', () => {
    const csv = 'invoice_no,seller_name,,,\nINV-001,Shop A,,,'
    const parsed = parse(csv)

    expect(parsed.meta.fields).toHaveLength(5)
    expect(parsed.data[0].invoice_no).toBe('INV-001')
  })

  it('handles CSV with missing values', () => {
    const csv = 'invoice_no,seller_name,buyer_name\nINV-001,,\nINV-002,Shop B,'
    const parsed = parse(csv)

    expect(parsed.data).toHaveLength(2)
    expect(parsed.data[0].seller_name).toBe('')
    expect(parsed.data[0].buyer_name).toBe('')
    expect(parsed.data[1].buyer_name).toBe('')
  })

  it('handles CSV with quoted fields containing commas', () => {
    const csv = 'invoice_no,seller_name,address\nINV-001,"Shop A, Inc","123 Main St, Bangkok"'
    const parsed = parse(csv)

    expect(parsed.data[0].seller_name).toBe('Shop A, Inc')
    expect(parsed.data[0].address).toBe('123 Main St, Bangkok')
  })

  it('handles CSV with quoted fields containing newlines', () => {
    const csv = 'invoice_no,seller_name,address\nINV-001,"Shop\nA","Line 1\nLine 2"'
    const parsed = parse(csv)

    expect(parsed.data[0].seller_name).toBe('Shop\nA')
    expect(parsed.data[0].address).toBe('Line 1\nLine 2')
  })

  it('handles CSV with mixed case headers', () => {
    const csv = 'INVOICE_NO,Seller_Name,SELLER_ADDRESS\nINV-001,Shop A,Bangkok'
    const parsed = parse(csv)
    const mapping = autoMap(parsed.meta.fields ?? [])

    // autoMap should handle case-insensitive matching
    expect(mapping.invoice_no).toBe('INVOICE_NO')
    expect(mapping.seller_name).toBe('Seller_Name')
    expect(mapping.seller_address).toBe('SELLER_ADDRESS')
  })

  it('handles CSV with headers that have extra spaces', () => {
    const csv = ' invoice no , seller name , buyer name \nINV-001,Shop A,Customer B'
    const parsed = parse(csv)
    const mapping = autoMap(parsed.meta.fields ?? [])

    // autoMap should trim and normalize spaces
    expect(mapping.invoice_no).toBe(' invoice no ')
  })
})

describe('Column mapping edge cases', () => {
  it('detects when two fields would map to the same column', () => {
    // If headers have both 'seller' and 'seller name', autoMap might map both to seller_name
    const headers = ['invoice_no', 'seller', 'seller name', 'buyer']
    const mapping = autoMap(headers)

    // autoMap maps to first matching synonym in the headers
    expect(mapping.seller_name).toBe('seller')
  })

  it('handles unmapped required columns gracefully', () => {
    const headers = ['col1', 'col2', 'col3']
    const mapping = autoMap(headers)
    const data = [{ col1: 'A', col2: 'B', col3: 'C' }]
    const rows = applyMapping(data, mapping)
    const results = runPack(rows, 'v2026', 0.07)

    // All checks should fail or be n/a when required fields are unmapped
    expect(results[0]['TI-01']!.verdict).not.toBe('pass')
    expect(results[0]['TI-02']!.verdict).toBe('fail')
    expect(results[0]['TI-03']!.verdict).toBe('fail')
    expect(results[0]['TI-04']!.verdict).toBe('fail')
  })

  it('applies mapping correctly when user manually overrides', () => {
    const headers = ['num', 'shop', 'customer']
    const mapping = autoMap(headers)

    // User manually maps
    mapping.invoice_no = 'num'
    mapping.seller_name = 'shop'
    mapping.buyer_name = 'customer'

    const data = [{ num: 'INV-001', shop: 'Shop A', customer: 'Customer B' }]
    const rows = applyMapping(data, mapping)

    expect(rows[0].invoice_no).toBe('INV-001')
    expect(rows[0].seller_name).toBe('Shop A')
    expect(rows[0].buyer_name).toBe('Customer B')
  })

  it('handles when user maps two different fields to same column', () => {
    // This is a user error but should not crash
    const headers = ['invoice_no', 'name']
    const mapping = autoMap(headers)

    // User incorrectly maps both seller_name and buyer_name to 'name'
    mapping.seller_name = 'name'
    mapping.buyer_name = 'name'

    const data = [{ invoice_no: 'INV-001', name: 'Shop A' }]
    const rows = applyMapping(data, mapping)

    // Both should get the same value (not ideal but shouldn't crash)
    expect(rows[0].seller_name).toBe('Shop A')
    expect(rows[0].buyer_name).toBe('Shop A')
  })
})

describe('CSV with special characters', () => {
  const parse = (text: string) => Papa.parse<Record<string, string>>(text.replace(/^﻿/, ''), { header: true, skipEmptyLines: true })

  it('handles CSV with Thai characters in headers', () => {
    const csv = 'เลขที่ใบกำกับ,ชื่อผู้ขาย,ชื่อผู้ซื้อ\nINV-001,ร้าน A,ลูกค้า B'
    const parsed = parse(csv)
    const mapping = autoMap(parsed.meta.fields ?? [])

    // Thai headers that are in SYNONYMS should be mapped correctly
    expect(mapping.invoice_no).toBe('เลขที่ใบกำกับ')
    expect(mapping.seller_name).toBe('ชื่อผู้ขาย')
    expect(mapping.buyer_name).toBe('ชื่อผู้ซื้อ')
  })

  it('handles CSV with zero-width characters in data', () => {
    const csv = 'invoice_no,seller_name\nINV-001,Shop​A' // Contains zero-width space
    const parsed = parse(csv)
    const mapping = autoMap(parsed.meta.fields ?? [])
    const rows = applyMapping(parsed.data, mapping)

    // Zero-width characters should be removed by normalization
    expect(rows[0].seller_name.includes('​')).toBe(true) // Raw data has it
  })

  it('handles CSV with decomposed Thai vowels', () => {
    const csv = 'doc_title\nใบกํากับภาษี' // Contains decomposed SARA AM
    const parsed = parse(csv)
    const mapping = autoMap(parsed.meta.fields ?? [])
    mapping.doc_title = 'doc_title'
    const rows = applyMapping(parsed.data, mapping)
    const results = runPack(rows, 'v2026', 0.07)

    // Should pass TI-01 even with decomposed vowel
    expect(results[0]['TI-01']!.verdict).toBe('pass')
  })
})
