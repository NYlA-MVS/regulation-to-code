// Text normalisation shared by every check. Deterministic, no network, no LLM.

const ZERO_WIDTH = /[​-‍⁠﻿]/g
const THAI_DIGITS = '๐๑๒๓๔๕๖๗๘๙'

/** Unicode compatibility form, zero-width characters removed, Thai digits to 0-9. */
export function norm(value: string | undefined | null): string {
  if (value == null) return ''
  // NFKC splits SARA AM (ำ) into nikhahit + sara aa; join it back so rules written with ำ still match.
  let s = value.normalize('NFKC').replace(ZERO_WIDTH, '').replace(/\u0E4D\u0E32/g, '\u0E33')
  s = s.replace(/[๐-๙]/g, (d) => String(THAI_DIGITS.indexOf(d)))
  return s.trim()
}

/** For matching required words: also drops every whitespace character. */
export function compact(value: string | undefined | null): string {
  return norm(value).replace(/\s+/g, '')
}

export function isBlank(value: string | undefined | null): boolean {
  return norm(value) === ''
}

/** Only the digits of a value (removes dashes, spaces, full-width forms). */
export function digitsOnly(value: string | undefined | null): string {
  return norm(value).replace(/\D/g, '')
}

/** Parses "1,170.00", "๑๗๐", full-width digits. Returns null when not a number. */
export function parseAmount(value: string | undefined | null): number | null {
  const s = norm(value).replace(/,/g, '')
  if (s === '' || !/^-?\d+(\.\d+)?$/.test(s)) return null
  return Number(s)
}
