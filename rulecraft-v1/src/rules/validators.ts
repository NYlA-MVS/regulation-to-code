import { digitsOnly, norm } from './normalize'

/** Thai 13-digit tax ID: format and check digit only (does not prove registration). */
export function taxIdProblem(value: string | undefined): string | null {
  const d = digitsOnly(value)
  if (d === '') return 'ไม่มีเลขประจำตัวผู้เสียภาษี'
  if (d.length === 12 && checkDigit('0' + d) === Number(d[11]))
    return 'เลขมี 12 หลัก น่าจะเป็นเพราะ Excel ตัดเลข 0 ตัวหน้าทิ้ง ให้ตั้งคอลัมน์เป็นข้อความแล้วเติม 0 ข้างหน้า'
  if (d.length !== 13) return `เลขมี ${d.length} หลัก ต้องมี 13 หลัก`
  const check = checkDigit(d)
  if (check !== Number(d[12])) return `เลขตรวจสอบหลักสุดท้ายไม่ถูกต้อง (ควรเป็น ${check})`
  return null
}

function checkDigit(d: string): number {
  let sum = 0
  for (let i = 0; i < 12; i++) sum += Number(d[i]) * (13 - i)
  return (11 - (sum % 11)) % 10
}

/** Accepts ISO yyyy-mm-dd and dd/mm/yyyy (Buddhist era if year > 2400). */
export function parseDate(value: string | undefined): Date | null {
  const s = norm(value)
  let y: number, m: number, d: number
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s)
  if (match) {
    ;[y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])]
  } else if ((match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s))) {
    ;[d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])]
  } else return null
  if (y > 2400) y -= 543
  const date = new Date(Date.UTC(y, m - 1, d))
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null
  return date
}

const BRANCH_PATTERNS = [
  /^สำนักงานใหญ่$/,
  /^สนญ\.?$/,
  /^(HO|HQ)$/i,
  /^head\s*office$/i,
  /^สาขาที่\s*\d+$/,
  /^(branch|br\.?)\s*no\.?\s*\d+$/i,
  /^\d{5}$/,
]

/** Head office / branch notation as described in Director-General VAT Notification No. 199. */
export function isBranchNotation(value: string | undefined): boolean {
  const s = norm(value)
  return s !== '' && BRANCH_PATTERNS.some((p) => p.test(s))
}

const PLACEHOLDERS = new Set(['-', '--', 'n/a', 'na', 'none', 'null', 'ลูกค้าทั่วไป', 'ไม่ระบุ', 'ไม่มี'])
export function isPlaceholder(value: string | undefined): boolean {
  return PLACEHOLDERS.has(norm(value).toLowerCase())
}
