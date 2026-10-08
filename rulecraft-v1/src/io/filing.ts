// F-01: totals per seller premises and tax month, the way ภ.พ.30 is filed (ม.83 วรรคสี่, ประกาศฯ 89 ข้อ 5).
import { docType, isCancelled } from '../rules/checks'
import type { Invoice, RowResults } from '../rules/engine'
import { norm, parseAmount } from '../rules/normalize'
import { monthOf } from '../rules/rates'
import { branchCode, parseDate, splitTaxId } from '../rules/validators'

export interface FilingRow {
  sellerTin: string
  branch: string
  /** "YYYY-MM", or "" when the invoice date could not be read */
  month: string
  invoices: number
  amount: number
  vat: number
  /** invoices with at least one hard fail */
  failing: number
  /** invoices whose value or VAT is not a number, so they are left out of the sums */
  unreadable: number
  /** cancelled documents: listed, not summed */
  cancelled: number
  /** credit and debit notes included in the sums (credit notes subtract) */
  notes: number
}

/** Most common invoice month, used as the default tax month. */
export function likelyTaxMonth(invoices: Invoice[]): string | null {
  const counts = new Map<string, number>()
  for (const x of invoices) {
    const d = parseDate(x.row.issue_date)
    if (d) counts.set(monthOf(d), (counts.get(monthOf(d)) ?? 0) + 1)
  }
  return [...counts].sort((a, b) => b[1] - a[1] || b[0].localeCompare(a[0]))[0]?.[0] ?? null
}

export function filingSummary(invoices: Invoice[], results: RowResults[]): FilingRow[] {
  const groups = new Map<string, FilingRow>()
  invoices.forEach((x, i) => {
    const r = x.row
    const d = parseDate(r.issue_date)
    const branch = norm(r.seller_branch) ? branchCode(r.seller_branch) : (splitTaxId(r.seller_tax_id).branch ?? '')
    const row: FilingRow = { sellerTin: splitTaxId(r.seller_tax_id).tin, branch, month: d ? monthOf(d) : '', invoices: 0, amount: 0, vat: 0, failing: 0, unreadable: 0, cancelled: 0, notes: 0 }
    const key = [row.sellerTin, row.branch, row.month].join('\u0001')
    const g = groups.get(key) ?? row
    groups.set(key, g)
    g.invoices++
    if (isCancelled(r)) {
      g.cancelled++
      return
    }
    const type = docType(r)
    if (type !== 'INV') g.notes++
    // ม.82/9, 82/10: a debit note adds output tax, a credit note reduces it.
    const sign = type === 'CN' ? -1 : 1
    const amt = parseAmount(r.amount_ex_vat)
    const vat = parseAmount(r.vat_amount)
    if (amt === null || vat === null) g.unreadable++
    else {
      g.amount += sign * Math.abs(amt)
      g.vat += sign * Math.abs(vat)
    }
    if (Object.values(results[i] ?? {}).some((v) => v?.verdict === 'fail')) g.failing++
  })
  for (const g of groups.values()) {
    g.amount = Math.round(g.amount * 100) / 100
    g.vat = Math.round(g.vat * 100) / 100
  }
  return [...groups.values()].sort((a, b) => a.sellerTin.localeCompare(b.sellerTin) || a.branch.localeCompare(b.branch) || a.month.localeCompare(b.month))
}

export const branchLabel = (code: string) => (code === '00000' ? 'สำนักงานใหญ่' : /^\d{5}$/.test(code) ? `สาขาที่ ${code}` : code || '(ไม่ระบุ)')
