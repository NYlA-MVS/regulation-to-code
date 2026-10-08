// Turns per-invoice results into issue cards: one card per rule and level, listing every invoice it hits.
// Grouping by rule means one fix pattern clears many invoices (OneSchema issue summary; NN/g alert fatigue).
import type { Verdict } from '../rules/checks'
import { CLAUSES } from '../rules/clauses'
import type { Clause, ClauseId } from '../rules/clauses'
import type { Invoice, RowResults } from '../rules/engine'

export interface IssueHit {
  invoice: number
  evidence: string
  fix: string
}
export interface Issue {
  id: string
  clause: Clause
  level: 'fail' | 'warn' | 'needs_expert'
  title: string
  hits: IssueHit[]
}

const RANK = { fail: 0, warn: 1, needs_expert: 2 } as const

/** What is wrong, in plain Thai, as the card heading. No rule codes. */
export const ISSUE_TITLE: Record<ClauseId, string> = {
  'TI-01': 'ชื่อเอกสารไม่มีคำว่า "ใบกำกับภาษี"',
  'TI-02': 'ชื่อ ที่อยู่ หรือเลขผู้เสียภาษีของผู้ขายไม่ครบหรือไม่ถูกต้อง',
  'TI-03': 'ชื่อหรือที่อยู่ของผู้ซื้อไม่ครบ',
  'TI-04': 'เลขที่ใบกำกับภาษีว่างหรือซ้ำ',
  'TI-05': 'รายการสินค้า จำนวน หรือมูลค่าไม่ครบ',
  'TI-06': 'ไม่ได้แสดงภาษีมูลค่าเพิ่มแยกจากมูลค่า',
  'TI-06b': 'ยอดภาษีไม่ตรงกับมูลค่า × อัตราภาษี',
  'TI-07': 'วันที่ออกใบกำกับภาษีว่างหรือไม่ใช่วันที่จริง',
  'TI-08': 'ไม่ได้ระบุสำนักงานใหญ่หรือสาขาของผู้ขาย',
  'TI-09': 'เลขผู้เสียภาษีของผู้ซื้อที่จด VAT ไม่ครบหรือไม่ถูกต้อง',
  'TI-10': 'ไม่ได้ระบุสำนักงานใหญ่หรือสาขาของผู้ซื้อที่จด VAT',
  'TI-11': 'ยอดรวมทั้งสิ้นไม่เท่ากับมูลค่าบวกภาษี',
  'TI-12': 'จำนวน × ราคาต่อหน่วยไม่ตรงกับมูลค่า',
  'TI-13': 'อัตราภาษีไม่ตรงกับอัตราตามกฎหมาย ณ วันที่ในใบ',
  'TI-14': 'วันที่ในใบไม่ตรงกับเดือนภาษีที่จะยื่น',
  'TI-15': 'บรรทัดในใบเดียวกันมีหัวใบไม่ตรงกัน',
  'TI-16': 'ชื่อหรือที่อยู่ต่างจากใบอื่นของเลขผู้เสียภาษีเดียวกัน',
  'TI-17': 'ใช้คำย่อนิติบุคคลที่ไม่อยู่ในรายการที่กรมสรรพากรรับรอง',
  'TI-18': 'ผู้ซื้อที่เป็นบุคคลธรรมดาไม่มีนามสกุล',
  'TI-21': 'ใบที่ออกแทนใบที่ยกเลิกยังไม่สมบูรณ์',
  'TI-22': 'ใบที่เป็นเงินตราต่างประเทศ',
  'TI-23': 'คิดภาษีกับรายการอัตรา 0% หรือรายการยกเว้นไม่ถูกต้อง',
  'TI-24': 'ออกใบกำกับภาษีอย่างย่อให้ผู้ซื้อที่จด VAT',
  'TI-25': 'ออกใบหลังวันส่งมอบหรือวันรับชำระ',
  'CN-01': 'ใบเพิ่มหนี้/ใบลดหนี้ไม่มีชื่อเอกสารที่ถูกต้อง',
  'CN-02': 'ใบเพิ่มหนี้/ใบลดหนี้ไม่ได้อ้างเลขที่ใบกำกับภาษีเดิม',
  'CN-03': 'มูลค่าเดิม มูลค่าที่ถูกต้อง หรือผลต่างในใบเพิ่มหนี้/ใบลดหนี้ไม่ครบหรือไม่ตรงกัน',
  'CN-04': 'ใบเพิ่มหนี้/ใบลดหนี้ไม่มีเหตุผล',
}

export function buildIssues(results: RowResults[]): Issue[] {
  const map = new Map<string, Issue>()
  results.forEach((r, i) => {
    for (const c of CLAUSES) {
      const x = r[c.id]
      if (!x || !(x.verdict in RANK)) continue
      const level = x.verdict as Issue['level']
      const id = `${c.id}-${level}`
      const issue = map.get(id) ?? { id, clause: c, level, title: ISSUE_TITLE[c.id], hits: [] }
      issue.hits.push({ invoice: i, evidence: x.evidence, fix: x.fix ?? '' })
      map.set(id, issue)
    }
  })
  return [...map.values()].sort((a, b) => RANK[a.level] - RANK[b.level] || b.hits.length - a.hits.length)
}

/** Invoices that carry at least one problem at a level. */
export const invoicesAt = (results: RowResults[], levels: Verdict[]) => results.filter((r) => Object.values(r).some((x) => x && levels.includes(x.verdict))).length

/** Text a user can paste to their accountant for a needs-expert issue. */
export function questionFor(issue: Issue, invoices: Invoice[]): string {
  const lines = issue.hits.slice(0, 10).map((h) => `- ${invoices[h.invoice]?.row.invoice_no || `ใบที่ ${h.invoice + 1}`}: ${h.evidence}`)
  return [
    `สอบถามเรื่อง: ${issue.title}`,
    `อ้างอิง: ${issue.clause.source}`,
    `พบใน ${issue.hits.length} ใบ`,
    ...lines,
    issue.hits.length > 10 ? `และอีก ${issue.hits.length - 10} ใบ` : '',
    issue.hits[0]?.fix ? `ประเด็น: ${issue.hits[0].fix}` : '',
  ].filter(Boolean).join('\n')
}
