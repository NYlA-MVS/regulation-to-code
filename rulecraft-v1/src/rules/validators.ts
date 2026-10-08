import { digitsOnly, norm } from './normalize'

/** Thai 13-digit tax ID: format and check digit only (does not prove registration). */
export function taxIdProblem(value: string | undefined): string | null {
  const d = splitTaxId(value).tin
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

/**
 * ETDA e-Tax data uses 18 digits: the 13-digit tax ID followed by the 5-digit branch code.
 * Returns the tax ID part and, when present, the branch code.
 */
export function splitTaxId(value: string | undefined): { tin: string; branch: string | null } {
  const d = digitsOnly(value)
  return d.length === 18 ? { tin: d.slice(0, 13), branch: d.slice(13) } : { tin: d, branch: null }
}

const MONTHS: [RegExp, number][] = [
  [/^(ม\.?ค\.?|มกรา(คม)?|jan(uary)?)$/i, 1], [/^(ก\.?พ\.?|กุมภา(พันธ์)?|feb(ruary)?)$/i, 2],
  [/^(มี\.?ค\.?|มีนา(คม)?|mar(ch)?)$/i, 3], [/^(เม\.?ย\.?|เมษา(ยน)?|apr(il)?)$/i, 4],
  [/^(พ\.?ค\.?|พฤษภา(คม)?|may)$/i, 5], [/^(มิ\.?ย\.?|มิถุนา(ยน)?|jun(e)?)$/i, 6],
  [/^(ก\.?ค\.?|กรกฎา(คม)?|jul(y)?)$/i, 7], [/^(ส\.?ค\.?|สิงหา(คม)?|aug(ust)?)$/i, 8],
  [/^(ก\.?ย\.?|กันยา(ยน)?|sep(t(ember)?)?)$/i, 9], [/^(ต\.?ค\.?|ตุลา(คม)?|oct(ober)?)$/i, 10],
  [/^(พ\.?ย\.?|พฤศจิกา(ยน)?|nov(ember)?)$/i, 11], [/^(ธ\.?ค\.?|ธันวา(คม)?|dec(ember)?)$/i, 12],
]
const monthNo = (name: string) => MONTHS.find(([re]) => re.test(name))?.[1] ?? null

/**
 * Accepts yyyy-mm-dd, dd/mm/yyyy (also with - or .), "8 ต.ค. 2569" / "8 ตุลาคม 2569" / "8 Oct 2026",
 * and Excel serial day numbers. Years above 2400 are Buddhist era. ป.86/2542 allows either era.
 */
export function parseDate(value: string | undefined): Date | null {
  const s = norm(value).replace(/\s+/g, ' ')
  let y: number, m: number, d: number
  let match: RegExpExecArray | null
  if ((match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s))) {
    ;[y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])]
  } else if ((match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s))) {
    ;[d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])]
  } else if ((match = /^(\d{1,2})[ -]?([^\d\s-]+)[ -]?(\d{4})$/.exec(s)) && monthNo(match[2])) {
    ;[d, m, y] = [Number(match[1]), monthNo(match[2])!, Number(match[3])]
  } else if (/^\d{5}$/.test(s) && Number(s) >= 20000 && Number(s) <= 80000) {
    // Excel serial day (1900 date system): day 25569 is 1970-01-01.
    const date = new Date((Number(s) - 25569) * 86400000)
    return date
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
  /^สาขา\s*\d+$/,
  /^(branch|br\.?)\s*(no\.?)?\s*\d+$/i,
  /^\d{5}$/,
]

/** Head office / branch notation as described in Director-General VAT Notification No. 199. */
export function isBranchNotation(value: string | undefined): boolean {
  const s = norm(value)
  return s !== '' && BRANCH_PATTERNS.some((p) => p.test(s))
}

/** Branch as a 5-digit code ("00000" = head office) when recognisable, so different spellings compare equal. */
export function branchCode(value: string | undefined): string {
  const s = norm(value)
  if (/^(สำนักงานใหญ่|สนญ\.?|HO|HQ|head\s*office)$/i.test(s)) return '00000'
  const n = /(\d+)$/.exec(s)
  return n && isBranchNotation(s) ? n[1].padStart(5, '0') : s
}

const PLACEHOLDERS = new Set(['-', '--', 'n/a', 'na', 'none', 'null', 'ลูกค้าทั่วไป', 'ไม่ระบุ', 'ไม่มี', 'เงินสด', 'ขายสด', 'ลูกค้าเงินสด', 'cash', 'walk-in', 'walk in', 'walkin'])
export function isPlaceholder(value: string | undefined): boolean {
  return PLACEHOLDERS.has(norm(value).toLowerCase())
}
