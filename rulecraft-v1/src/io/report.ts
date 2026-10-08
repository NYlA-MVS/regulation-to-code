// Files the user takes away: the fix list (opens in Excel) and a blank template.
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import { CLAUSES } from '../rules/clauses'
import type { Invoice, RowResults } from '../rules/engine'
import { FIELD_LABEL, FIELDS } from '../rules/engine'

const VERDICT_TH = { fail: 'ต้องแก้', needs_expert: 'ถามผู้เชี่ยวชาญ', warn: 'ควรตรวจสอบ', pass: 'ผ่าน', 'n/a': 'ไม่เกี่ยว' } as const

/** Stops a cell from being run as a formula when the file is opened in Excel. */
const safe = (v: string) => (/^[=+@\t\r]|^-[^\d]/.test(v) ? `'${v}` : v)

export const lineRange = (nos: number[]) => (nos.length === 1 ? `${nos[0]}` : `${nos[0]}–${nos[nos.length - 1]}`)

export interface Problem {
  invoice: number
  clauseId: string
  verdict: 'fail' | 'needs_expert' | 'warn'
  evidence: string
  fix: string
}

/** Every fail / needs-expert result, in invoice order then clause order. */
export function problems(results: RowResults[]): Problem[] {
  const out: Problem[] = []
  results.forEach((r, i) => {
    for (const c of CLAUSES) {
      const x = r[c.id]
      if (x && (x.verdict === 'fail' || x.verdict === 'needs_expert' || x.verdict === 'warn'))
        out.push({ invoice: i, clauseId: c.id, verdict: x.verdict, evidence: x.evidence, fix: x.fix ?? '' })
    }
  })
  return out
}

export function fixListCsv(invoices: Invoice[], results: RowResults[]): string {
  const rows = problems(results).map((p) => {
    const inv = invoices[p.invoice]
    const clause = CLAUSES.find((c) => c.id === p.clauseId)!
    return [
      String(p.invoice + 1), inv.row.invoice_no, inv.row.issue_date, inv.row.buyer_name, lineRange(inv.lineNos),
      p.clauseId, VERDICT_TH[p.verdict], p.evidence, p.fix, clause.source,
    ].map(safe)
  })
  const header = ['ใบที่', 'เลขที่ใบกำกับภาษี', 'วันที่', 'ผู้ซื้อ', 'แถวในไฟล์', 'ข้อ', 'ผลตรวจ', 'ปัญหาที่พบ', 'วิธีแก้', 'อ้างอิงกฎหมาย']
  return '﻿' + Papa.unparse([header, ...rows])
}

export function download(name: string, text: string, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Excel template with Thai headers. Tax-ID columns are text so leading zeros survive. */
export function downloadTemplate() {
  const header = FIELDS.map((f) => FIELD_LABEL[f])
  const ex = (line: Partial<Record<(typeof FIELDS)[number], string | number>>) => FIELDS.map((f) => line[f] ?? '')
  const head = {
    invoice_no: 'INV-0001', issue_date: '01/12/2569', doc_title: 'ใบกำกับภาษี/ใบเสร็จรับเงิน',
    seller_name: 'บริษัท ตัวอย่าง จำกัด', seller_address: '1 ถ.ตัวอย่าง อ.เมือง จ.สมุทรปราการ 10280', seller_tax_id: '0105558123451', seller_branch: 'สำนักงานใหญ่',
    buyer_name: 'บริษัท ลูกค้า จำกัด', buyer_address: '2 ถ.ตัวอย่าง อ.เมือง จ.ชลบุรี 20000', buyer_tax_id: '0105547003211', buyer_branch: 'สำนักงานใหญ่', buyer_is_vat_registrant: 'Y',
  }
  const aoa = [
    header,
    ex({ ...head, item_desc: 'สินค้า A', qty: 10, unit_price: 100, amount_ex_vat: 1000, vat_amount: 70, total: 1070 }),
    ex({ ...head, item_desc: 'สินค้า B (บรรทัดที่ 2 ของใบเดียวกัน)', qty: 5, unit_price: 40, amount_ex_vat: 200, vat_amount: 14, total: 214 }),
  ]
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  for (const f of ['seller_tax_id', 'buyer_tax_id', 'invoice_no', 'seller_branch', 'buyer_branch'] as const) {
    const c = FIELDS.indexOf(f)
    for (let r = 1; r < aoa.length; r++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })]
      if (cell) Object.assign(cell, { t: 's', z: '@' })
    }
  }
  ws['!cols'] = header.map((h) => ({ wch: Math.max(12, h.length + 4) }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'ใบกำกับภาษีขาย')
  XLSX.writeFile(wb, 'แม่แบบ-ตรวจใบกำกับภาษี.xlsx')
}

/**
 * The user's own rows with three columns added: status, problems and fixes. Bookkeepers fix the
 * data in their own system or in Excel and re-upload (HubSpot "rows with errors" pattern).
 */
export function downloadAnnotated(fileName: string, headers: string[], records: Record<string, string>[], lineNos: number[], invoices: Invoice[], results: RowResults[]) {
  const byLine = new Map<number, number>()
  invoices.forEach((x, i) => x.lineNos.forEach((n) => byLine.set(n, i)))
  const order = { fail: 0, warn: 1, needs_expert: 2 } as Record<string, number>
  const aoa: (string | number)[][] = [[...headers, 'ผลตรวจ', 'ปัญหาที่พบ', 'วิธีแก้']]
  records.forEach((rec, k) => {
    const inv = byLine.get(lineNos[k])
    const found = inv === undefined ? [] : CLAUSES.map((c) => results[inv]?.[c.id]).filter((x) => x && x.verdict in order)
    found.sort((a, b) => order[a!.verdict] - order[b!.verdict])
    const status = found.length ? VERDICT_TH[found[0]!.verdict as keyof typeof VERDICT_TH] : 'ผ่าน'
    aoa.push([...headers.map((h) => safe(rec[h] ?? '')), status, found.map((x) => safe(x!.evidence)).join(' | '), found.map((x) => safe(x!.fix ?? '')).filter(Boolean).join(' | ')])
  })
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = [...headers.map(() => ({ wch: 16 })), { wch: 14 }, { wch: 60 }, { wch: 60 }]
  ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: aoa.length - 1, c: aoa[0].length - 1 } }) }
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'ผลตรวจ')
  XLSX.writeFile(wb, `ผลตรวจ-${fileName.replace(/\.[^.]+$/, '')}.xlsx`)
}
