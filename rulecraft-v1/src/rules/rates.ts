// Dates that decide which VAT rate applies and when ภ.พ.30 is due. Update this file when a new
// Royal Decree or Finance Ministry notice is published; every entry names its source.

/** VAT rate by tax-point date. ม.80 sets 10%; Royal Decrees reduce it to 6.3% + 0.7% local tax = 7%. */
export const VAT_RATES: { until: string; rate: number; source: string }[] = [
  // Decrees 790 (to 30 ก.ย. 2568), 799 (to 30 ก.ย. 2569) and 807 (1 ต.ค. 2569 – 30 ก.ย. 2570) keep 7%. rd.go.th/1603.html
  { until: '2027-09-30', rate: 0.07, source: 'พระราชกฤษฎีกา (ฉบับที่ 807) พ.ศ. 2569 ใช้ถึง 30 ก.ย. 2570' },
]
export const RATE_KNOWN_UNTIL = VAT_RATES[VAT_RATES.length - 1].until

/** The legal rate on a date, or null when no decree is on file for that date. */
export function rateFor(date: Date): { rate: number; source: string } | null {
  const iso = date.toISOString().slice(0, 10)
  return VAT_RATES.find((r) => iso <= r.until) ?? null
}

/** ประกาศอธิบดีฯ ฉบับที่ 199: branch and buyer particulars apply to invoices from this date. */
export const DG199_FROM = '2015-01-01'

// ประกาศกระทรวงการคลัง ขยายเวลา e-filing ฉบับที่ 7–8 (2567): +8 days for returns due 1 ก.พ. 2567 – 31 ม.ค. 2570.
const EFILING = { from: '2024-02-01', to: '2027-01-31', days: 8 }

/** "YYYY-MM" tax month → ภ.พ.30 due dates (ม.83: 15th of the following month). */
export function filingDeadlines(taxMonth: string): { paper: Date; online: Date | null } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(taxMonth)
  if (!m) return null
  const paper = new Date(Date.UTC(Number(m[1]), Number(m[2]), 15))
  const iso = paper.toISOString().slice(0, 10)
  const online = iso >= EFILING.from && iso <= EFILING.to ? new Date(paper.getTime() + EFILING.days * 86400000) : null
  return { paper, online }
}

export const monthOf = (d: Date) => d.toISOString().slice(0, 7)

/** "2026-09" → "ก.ย. 2569" */
export function thaiMonth(taxMonth: string): string {
  const [y, mo] = taxMonth.split('-').map(Number)
  return new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString('th-TH', { month: 'short', year: 'numeric', timeZone: 'UTC' })
}
export const thaiDate = (d: Date) => d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
