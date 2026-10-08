// Approved clauses for the full tax invoice rule pack. Source text is quoted from rd.go.th.

export type ClauseId = 'TI-01' | 'TI-02' | 'TI-03' | 'TI-04' | 'TI-05' | 'TI-06' | 'TI-06b' | 'TI-07' | 'TI-08' | 'TI-09' | 'TI-10'

export interface Clause {
  id: ClauseId
  source: string
  quote: string
  plain: string
  fields: string[]
  status: 'checkable' | 'partial' | 'needs_expert'
  /** Rule pack version that introduced the clause. */
  since: 'v2558' | 'v2026'
}

export const S86_4 = 'ประมวลรัษฎากร มาตรา 86/4'
export const DG199 = 'ประกาศอธิบดีกรมสรรพากร เกี่ยวกับภาษีมูลค่าเพิ่ม (ฉบับที่ 199)'

export const CLAUSES: Clause[] = [
  { id: 'TI-01', source: `${S86_4} (1)`, quote: 'คำว่า "ใบกำกับภาษี" ในที่ที่เห็นได้เด่นชัด', plain: 'มีคำว่า "ใบกำกับภาษี" บนเอกสาร', fields: ['doc_title'], status: 'partial', since: 'v2558' },
  { id: 'TI-02', source: `${S86_4} (2)`, quote: 'ชื่อ ที่อยู่ และเลขประจำตัวผู้เสียภาษีอากรของผู้ประกอบการจดทะเบียนที่ออกใบกำกับภาษี', plain: 'ชื่อ ที่อยู่ และเลขผู้เสียภาษี 13 หลักของผู้ขาย', fields: ['seller_name', 'seller_address', 'seller_tax_id'], status: 'checkable', since: 'v2558' },
  { id: 'TI-03', source: `${S86_4} (3)`, quote: 'ชื่อ ที่อยู่ของผู้ซื้อสินค้าหรือผู้รับบริการ', plain: 'ชื่อและที่อยู่ของผู้ซื้อ', fields: ['buyer_name', 'buyer_address'], status: 'checkable', since: 'v2558' },
  { id: 'TI-04', source: `${S86_4} (4)`, quote: 'หมายเลขลำดับของใบกำกับภาษี และหมายเลขลำดับของเล่มถ้ามี', plain: 'เลขที่ใบกำกับภาษี ไม่ว่างและไม่ซ้ำ', fields: ['invoice_no'], status: 'checkable', since: 'v2558' },
  { id: 'TI-05', source: `${S86_4} (5)`, quote: 'ชื่อ ชนิด ประเภท ปริมาณ และมูลค่าของสินค้าหรือของบริการ', plain: 'รายการสินค้า จำนวน และมูลค่า', fields: ['item_desc', 'qty', 'amount_ex_vat'], status: 'checkable', since: 'v2558' },
  { id: 'TI-06', source: `${S86_4} (6)`, quote: 'จำนวนภาษีมูลค่าเพิ่มที่คำนวณจากมูลค่าของสินค้าหรือของบริการ โดยให้แยกออกจากมูลค่า', plain: 'แสดงภาษีมูลค่าเพิ่มแยกจากมูลค่าสินค้า', fields: ['vat_amount'], status: 'checkable', since: 'v2558' },
  { id: 'TI-06b', source: `${S86_4} (6) การคำนวณ`, quote: 'จำนวนภาษีมูลค่าเพิ่มที่คำนวณจากมูลค่าของสินค้าหรือของบริการ', plain: 'ยอดภาษีตรงกับมูลค่า × อัตราภาษีที่ตั้งไว้', fields: ['amount_ex_vat', 'vat_amount'], status: 'partial', since: 'v2558' },
  { id: 'TI-07', source: `${S86_4} (7)`, quote: 'วัน เดือน ปี ที่ออกใบกำกับภาษี', plain: 'วันที่ออกใบกำกับภาษีที่เป็นวันจริง', fields: ['issue_date'], status: 'checkable', since: 'v2558' },
  { id: 'TI-08', source: `${DG199} ข้อ 8`, quote: 'ระบุ "สำนักงานใหญ่" หรือ "สาขาที่ ..." ของผู้ประกอบการที่ออกใบกำกับภาษี', plain: 'ระบุสำนักงานใหญ่หรือสาขาของผู้ขาย', fields: ['seller_branch'], status: 'checkable', since: 'v2026' },
  { id: 'TI-09', source: `${DG199} ข้อ 7`, quote: 'เลขประจำตัวผู้เสียภาษีอากรของผู้ซื้อสินค้าหรือผู้รับบริการ', plain: 'เลขผู้เสียภาษีของผู้ซื้อ (ตรวจเมื่อผู้ซื้อจด VAT)', fields: ['buyer_tax_id', 'buyer_is_vat_registrant'], status: 'needs_expert', since: 'v2026' },
  { id: 'TI-10', source: `${DG199} ข้อ 9`, quote: 'ระบุ "สำนักงานใหญ่" หรือ "สาขาที่ ..." ของผู้ซื้อสินค้าหรือผู้รับบริการ', plain: 'ระบุสำนักงานใหญ่หรือสาขาของผู้ซื้อ (เมื่อผู้ซื้อจด VAT)', fields: ['buyer_branch', 'buyer_is_vat_registrant'], status: 'needs_expert', since: 'v2026' },
]

export const PACKS = {
  v2558: {
    label: 'ก่อนประกาศฉบับที่ 199',
    note: 'เฉพาะ มาตรา 86/4 (1)–(7)',
    clauses: CLAUSES.filter((c) => c.since === 'v2558').map((c) => c.id),
  },
  v2026: {
    label: 'ฉบับปัจจุบัน',
    note: 'มาตรา 86/4 + ประกาศอธิบดีฯ ฉบับที่ 199 (ใช้กับใบกำกับภาษีที่ออกตั้งแต่ 1 ม.ค. 2558)',
    clauses: CLAUSES.map((c) => c.id),
  },
} as const
export type PackId = keyof typeof PACKS
