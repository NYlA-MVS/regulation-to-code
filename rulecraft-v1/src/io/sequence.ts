// TI-19 (info only): gaps in invoice numbering. No rule requires consecutive numbers and several
// series may run at once (rulings 0706/พ./1514, 0811/พ./11941), so a gap is a prompt to look, not an error.
import type { Invoice } from '../rules/engine'
import { norm } from '../rules/normalize'
import { branchCode, splitTaxId } from '../rules/validators'

export interface Gap {
  series: string
  missing: string[]
  /** more missing numbers than listed */
  more: number
}

const LIST = 10

export function numberGaps(invoices: Invoice[], maxGap = 50): Gap[] {
  const series = new Map<string, { prefix: string; width: number; nums: Set<number> }>()
  for (const x of invoices) {
    const m = /^(.*?)(\d+)$/.exec(norm(x.row.invoice_no))
    if (!m) continue
    const key = [splitTaxId(x.row.seller_tax_id).tin, branchCode(x.row.seller_branch), norm(x.row.book_no), m[1], m[2].length].join('\u0001')
    const s = series.get(key) ?? { prefix: m[1], width: m[2].length, nums: new Set<number>() }
    s.nums.add(Number(m[2]))
    series.set(key, s)
  }
  const out: Gap[] = []
  for (const s of series.values()) {
    const nums = [...s.nums].sort((a, b) => a - b)
    const missing: string[] = []
    for (let i = 1; i < nums.length; i++) {
      const gap = nums[i] - nums[i - 1] - 1
      // A very large jump is a different series or a new year, not missing invoices.
      if (gap > 0 && gap <= maxGap) for (let n = nums[i - 1] + 1; n < nums[i]; n++) missing.push(s.prefix + String(n).padStart(s.width, '0'))
    }
    if (missing.length) out.push({ series: `${s.prefix}${'#'.repeat(s.width)}`, missing: missing.slice(0, LIST), more: Math.max(0, missing.length - LIST) })
  }
  return out
}
