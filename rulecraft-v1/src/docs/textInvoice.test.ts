import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
import { readInvoices, readPage, toLines } from './textInvoice'
import type { TextRun } from './textInvoice'

async function pdfPages(file: string) {
  const doc = await getDocument({ data: new Uint8Array(readFileSync(join(__dirname, '..', '..', 'test-files', file))) }).promise
  const pages = []
  for (let p = 1; p <= doc.numPages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent()
    const runs: TextRun[] = tc.items.flatMap((it) => ('str' in it ? [{ str: it.str, x: it.transform[4], y: it.transform[5], width: it.width }] : []))
    pages.push(toLines(runs))
  }
  return pages
}

describe('text PDF from accounting software (test-files/09)', async () => {
  const pages = await pdfPages('09-ใบกำกับภาษี-PDF-จากโปรแกรม-5ใบ.pdf')
  const { invoices, unreadPages } = readInvoices('09.pdf', pages)
  it('rebuilds Thai words split into glyph clusters', () => {
    expect(pages[0].flat()).toContain('บริษัท ไทยเมทัล พาร์ท จำกัด')
  })
  it('finds 5 invoices on 6 pages, joining the two-page one', () => {
    expect(unreadPages).toEqual([])
    expect(invoices.map((x) => x.fields.invoice_no)).toEqual(['IV6909-0201', 'IV6909-0202', 'IV6909-0203', 'IV6909-0204', 'IV6909-0205'])
    expect(invoices[2].pages).toEqual([3, 4])
    expect(invoices[2].lines.length).toBe(16)
  })
  it('reads header fields, items and totals', () => {
    const f = invoices[0].fields
    expect(f).toMatchObject({
      doc_title: 'ใบกำกับภาษี/ใบส่งของ', issue_date: '02/09/2569', seller_name: 'บริษัท ไทยเมทัล พาร์ท จำกัด', seller_tax_id: '0105559012342', seller_branch: 'สำนักงานใหญ่',
      buyer_name: 'บริษัท สยามออโต้ พาร์ท จำกัด', buyer_tax_id: '0105545123457', buyer_branch: 'สำนักงานใหญ่', amount_ex_vat: '13500.00', vat_amount: '945.00', total: '14445.00',
    })
    expect(f.seller_address).toMatch(/^99\/1 ม\.2/)
    expect(f.buyer_address).toMatch(/^700\/12/)
    expect(invoices[0].lines[1]).toEqual({ desc: 'สกรูหัวจม M8x20', qty: '2000', price: '1.25', amount: '2500.00' })
    expect(invoices[0].missing).toEqual([])
  })
  it('keeps what is printed, including the planted errors', () => {
    expect(invoices[1].fields.buyer_branch).toBeUndefined()
    expect(invoices[3].fields.vat_amount).toBe('764.00')
  })
})

describe('scanned PDF has no text layer (test-files/11)', async () => {
  const pages = await pdfPages('11-ใบกำกับภาษี-สแกน-3ใบ.pdf')
  it('reports every page as unread so the AI reader can take them', () => {
    expect(readInvoices('11.pdf', pages)).toEqual({ invoices: [], unreadPages: [1, 2, 3] })
  })
})

describe('readPage on a credit note layout', () => {
  it('reads reference, values and reason', () => {
    const r = readPage([
      ['บริษัท ไทยเมทัล พาร์ท จำกัด', 'ใบลดหนี้'], ['99/1 ถ.เทพารักษ์ สมุทรปราการ'], ['เลขประจำตัวผู้เสียภาษี 0105559012342 สำนักงานใหญ่'],
      ['ลูกค้า: บริษัท สยามออโต้ พาร์ท จำกัด', 'เลขที่ CN6909-0011'], ['ที่อยู่: 700/12 ชลบุรี', 'วันที่ 25/09/2569'], ['เลขประจำตัวผู้เสียภาษี 0105545123457 สำนักงานใหญ่', 'อ้างอิงใบกำกับภาษีเลขที่ IV6909-0201'],
      ['รายการ', 'มูลค่าตามใบกำกับเดิม', 'มูลค่าที่ถูกต้อง', 'ผลต่าง'], ['ขายึดกันชน (คืน 40 ชิ้น)', '13,500.00', '12,760.00', '740.00'],
      ['มูลค่าที่ลดลง', '740.00'], ['ภาษีมูลค่าเพิ่ม 7%', '51.80'], ['รวมทั้งสิ้น', '791.80'], ['เหตุผล: ลูกค้าคืนสินค้าชำรุด'],
    ])
    expect(r.fields).toMatchObject({ doc_title: 'ใบลดหนี้', invoice_no: 'CN6909-0011', ref_invoice_no: 'IV6909-0201', original_value: '13500.00', correct_value: '12760.00', amount_ex_vat: '740.00', vat_amount: '51.80', reason: 'ลูกค้าคืนสินค้าชำรุด' })
  })
})

describe('PDF → table → rules (test-files/09 end to end)', async () => {
  const { toSheet } = await import('./toSheet')
  const { toTable } = await import('../io/table')
  const { applyMapping, autoMap, groupInvoices, runInvoices } = await import('../rules/engine')
  const pages = await pdfPages('09-ใบกำกับภาษี-PDF-จากโปรแกรม-5ใบ.pdf')
  const sheet = toSheet('09.pdf', readInvoices('09.pdf', pages).invoices)
  const t = toTable(sheet.cells)
  const map = autoMap(t.headers)
  const inv = groupInvoices(applyMapping(t.records, map), 0.07, t.lineNos)
  const res = runInvoices(inv, 'v2026', 0.07, { taxMonth: '2026-09', today: new Date('2026-10-08') })
  const fails = res.map((r) => Object.entries(r).filter(([, x]) => x?.verdict === 'fail').map(([id]) => id))
  it('headers map back to every core field', () => {
    for (const f of ['invoice_no', 'issue_date', 'doc_title', 'seller_tax_id', 'buyer_name', 'amount_ex_vat', 'vat_amount', 'total'] as const) expect(map[f]).not.toBe('')
  })
  it('regroups 5 invoices and finds the two planted errors', () => {
    expect(inv.length).toBe(5)
    expect(fails).toEqual([[], [], [], ['TI-06b'], []])
    // A PDF does not say whether the buyer is VAT-registered, so a buyer TIN without a branch is a warning.
    expect(res[1]['TI-10']?.verdict).toBe('warn')
  })
})
