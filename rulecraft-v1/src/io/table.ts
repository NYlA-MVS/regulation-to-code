// Reads a user's file (CSV in any common Thai encoding, or Excel) into plain string records.
// Everything runs in the browser; nothing is uploaded.
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import { autoMap } from '../rules/engine'

export interface Sheet {
  name: string
  cells: string[][]
}
export interface Table {
  headers: string[]
  /** One record per non-empty data row. */
  records: Record<string, string>[]
  /** 1-based row number of each record in the original file, so users can find it in Excel. */
  lineNos: number[]
  /** 1-based row number of the header row. */
  headerLine: number
}

/** UTF-8 (with or without BOM), UTF-16 with BOM, else Windows-874 / TIS-620 as saved by Thai Excel. */
export function decodeText(buf: ArrayBuffer): string {
  const b = new Uint8Array(buf)
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder('utf-16le').decode(b)
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder('utf-16be').decode(b)
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(b).replace(/^﻿/, '')
  } catch {
    return new TextDecoder('windows-874').decode(b)
  }
}

export function parseCsv(text: string): string[][] {
  return Papa.parse<string[]>(text.replace(/^﻿/, ''), { skipEmptyLines: false }).data
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Excel workbook → sheets of display strings. Dates become yyyy-mm-dd; numbers keep their shown format. */
export function readWorkbook(buf: ArrayBuffer): Sheet[] {
  const wb = XLSX.read(buf, { type: 'array', cellDates: true })
  return wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name]
    const ref = ws['!ref']
    if (!ref) return { name, cells: [] }
    const range = XLSX.utils.decode_range(ref)
    const cells: string[][] = []
    for (let r = range.s.r; r <= range.e.r; r++) {
      const line: string[] = []
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })] as XLSX.CellObject | undefined
        if (!cell || cell.v == null) line.push('')
        else if (cell.v instanceof Date) line.push(`${cell.v.getFullYear()}-${pad(cell.v.getMonth() + 1)}-${pad(cell.v.getDate())}`)
        else if (cell.t === 'n') line.push(cell.w && !/[eE]/.test(cell.w) ? cell.w : String(cell.v))
        else line.push(cell.w ?? String(cell.v))
      }
      cells.push(line)
    }
    return { name, cells }
  })
}

const isEmptyRow = (r: string[]) => r.every((v) => (v ?? '').trim() === '')

/** Exports often start with a title or company block. Pick the row in the first 15 that names the most known fields. */
export function detectHeaderRow(cells: string[][]): number {
  let best = 0
  let bestScore = -1
  for (let i = 0; i < Math.min(cells.length, 15); i++) {
    if (isEmptyRow(cells[i])) continue
    const score = Object.values(autoMap(cells[i].map((h) => (h ?? '').trim()))).filter(Boolean).length
    if (score > bestScore) [best, bestScore] = [i, score]
  }
  return best
}

export function toTable(cells: string[][], headerIdx = detectHeaderRow(cells)): Table {
  const raw = (cells[headerIdx] ?? []).map((h) => (h ?? '').trim())
  const seen = new Map<string, number>()
  const headers = raw.map((h, i) => {
    const base = h || `คอลัมน์ ${i + 1}`
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    return n > 1 ? `${base} (${n})` : base
  })
  const records: Record<string, string>[] = []
  const lineNos: number[] = []
  for (let i = headerIdx + 1; i < cells.length; i++) {
    const r = cells[i] ?? []
    if (isEmptyRow(r)) continue
    const rec: Record<string, string> = {}
    headers.forEach((h, j) => (rec[h] = (r[j] ?? '').trim()))
    records.push(rec)
    lineNos.push(i + 1)
  }
  return { headers, records, lineNos, headerLine: headerIdx + 1 }
}

export const ACCEPT = '.csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,.pdf,application/pdf,.jpg,.jpeg,.png,.webp,.heic,image/*'

/** Reads a File into sheets. CSV yields one sheet. Throws a Thai message for unsupported files. */
export async function readFile(file: File): Promise<Sheet[]> {
  const buf = await file.arrayBuffer()
  if (/\.csv$/i.test(file.name)) return [{ name: file.name, cells: parseCsv(decodeText(buf)) }]
  if (/\.xlsx?$/i.test(file.name)) {
    try {
      return readWorkbook(buf)
    } catch {
      throw new Error('เปิดไฟล์ Excel นี้ไม่ได้ ไฟล์อาจเสียหรือมีรหัสผ่าน ลองบันทึกใหม่เป็น .xlsx หรือ .csv')
    }
  }
  throw new Error('รองรับไฟล์ Excel (.xlsx .xls), CSV, PDF และรูป (.jpg .png) เท่านั้น')
}
