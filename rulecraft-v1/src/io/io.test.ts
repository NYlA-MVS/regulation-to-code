import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import { describe, expect, it } from 'vitest'
import { applyMapping, autoMap, groupInvoices, runInvoices } from '../rules/engine'
import { fixListCsv, problems } from './report'
import { decodeText, detectHeaderRow, parseCsv, readWorkbook, toTable } from './table'

const factory = readFileSync(join(__dirname, '..', 'samples', 'factory.csv'), 'utf8')
const check = (cells: string[][]) => {
  const t = toTable(cells)
  const rows = applyMapping(t.records, autoMap(t.headers))
  const invoices = groupInvoices(rows, 0.07, t.lineNos)
  return { t, invoices, results: runInvoices(invoices, 'v2026', 0.07) }
}
const failing = (r: ReturnType<typeof check>['results'][number]) =>
  Object.entries(r).filter(([, x]) => x?.verdict === 'fail').map(([id]) => id)

describe('decodeText', () => {
  it('reads UTF-8 with BOM', () => {
    const buf = new TextEncoder().encode('﻿เลขที่,วันที่').buffer
    expect(decodeText(buf)).toBe('เลขที่,วันที่')
  })
  it('falls back to Windows-874 (TIS-620) as saved by Thai Excel', () => {
    // "ใบกำกับภาษี" in TIS-620: Thai block U+0E01..U+0E5B maps to 0xA1..0xFB
    const tis = Uint8Array.from([...'ใบกำกับภาษี'].map((ch) => ch.codePointAt(0)! - 0x0e00 + 0xa0))
    expect(decodeText(tis.buffer)).toBe('ใบกำกับภาษี')
  })
})

describe('header detection', () => {
  it('skips report title rows above the header', () => {
    const cells = parseCsv(factory)
    expect(detectHeaderRow(cells)).toBe(3)
    const t = toTable(cells)
    expect(t.headerLine).toBe(4)
    expect(t.lineNos[0]).toBe(5)
  })
  it('names blank and repeated headers so none are lost', () => {
    expect(toTable([['a', '', 'a'], ['1', '2', '3']]).headers).toEqual(['a', 'คอลัมน์ 2', 'a (2)'])
  })
})

describe('factory sample (multi-line invoices)', () => {
  const { t, invoices, results } = check(parseCsv(factory))
  it('groups 12 rows into 8 invoices', () => {
    expect(t.records.length).toBe(12)
    expect(invoices.map((x) => x.lines.length)).toEqual([3, 2, 1, 2, 1, 1, 1, 1])
    expect(invoices[0].lineNos).toEqual([5, 6, 7])
  })
  it('flags exactly the planted errors', () => {
    expect(results.map(failing)).toEqual([[], [], ['TI-10'], ['TI-05'], ['TI-09'], ['TI-06b'], ['TI-01'], []])
  })
  it('sums per-line VAT and accepts VAT repeated on every line', () => {
    expect(invoices[0].row.amount_ex_vat).toBe('13500.00')
    expect(invoices[0].row.vat_amount).toBe('945.00')
    expect(invoices[1].row.vat_amount).toBe('588.00')
  })
  it('names the line item that failed', () => {
    expect(results[3]['TI-05']?.evidence).toMatch(/^รายการที่ 2/)
  })
  it('explains a tax ID that lost its leading zero', () => {
    expect(results[4]['TI-09']?.evidence).toMatch(/Excel/)
  })
  it('exports a fix list Excel can open', () => {
    const csv = fixListCsv(invoices, results)
    expect(csv.startsWith('﻿')).toBe(true)
    const parsed = Papa.parse<string[]>(csv.slice(1)).data
    expect(parsed.length).toBe(1 + problems(results).length)
    expect(parsed[1][1]).toBe('SP6911-003')
    expect(parsed[1][4]).toBe('10')
  })
})

describe('grouping keeps real duplicates apart', () => {
  it('same number, different buyer → two invoices, second fails TI-04', () => {
    const cells = parseCsv(factory)
    const dup = [...cells[9]]
    dup[7] = 'บริษัท อื่น จำกัด'
    const { invoices, results } = check([...cells, dup])
    expect(invoices.length).toBe(9)
    expect(results[8]['TI-04']?.verdict).toBe('fail')
  })
})

describe('Excel input', () => {
  it('keeps text tax IDs, converts dates, and reads formatted numbers', () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['ชื่อรายงาน'],
      ['เลขที่ใบกำกับ', 'วันที่', 'เลขผู้เสียภาษีผู้ขาย', 'มูลค่าก่อน VAT'],
      ['A-1', new Date(2026, 10, 3), '0105558123451', 1234.5],
    ], { cellDates: true })
    ws['D3'].z = '#,##0.00'
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'ขาย')
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
    const [sheet] = readWorkbook(buf)
    expect(sheet.name).toBe('ขาย')
    const t = toTable(sheet.cells)
    expect(t.headerLine).toBe(2)
    expect(t.records[0]).toMatchObject({ 'วันที่': '2026-11-03', 'เลขผู้เสียภาษีผู้ขาย': '0105558123451', 'มูลค่าก่อน VAT': '1,234.50' })
  })
})
