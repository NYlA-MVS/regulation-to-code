// Generates realistic trial files in test-files/. All companies, people and tax IDs are fictional;
// tax IDs carry valid check digits unless an error is planted on purpose.
// Run: node scripts/make-test-files.mjs
import * as fs from 'node:fs'
import { mkdirSync, writeFileSync } from 'node:fs'
import * as XLSX from 'xlsx'

XLSX.set_fs(fs)

const OUT = 'test-files'
mkdirSync(OUT, { recursive: true })

// ---- helpers --------------------------------------------------------------------------------
let seed = 20260908
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648)
const pick = (a) => a[Math.floor(rand() * a.length)]
const tin = (p12) => { let s = 0; for (let i = 0; i < 12; i++) s += Number(p12[i]) * (13 - i); return p12 + ((11 - (s % 11)) % 10) }
const r2 = (n) => Math.round((n + Math.sign(n) * 1e-9) * 100) / 100
const dmy = (d, m, y = 2569) => `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`
/** TIS-620 / Windows-874: Thai block U+0E01..U+0E5B maps to 0xA1..0xFB. */
const cp874 = (text) => Buffer.from([...text].flatMap((ch) => { const c = ch.codePointAt(0); if (c < 0x80) return [c]; if (c >= 0x0e01 && c <= 0x0e5b) return [c - 0x0e00 + 0xa0]; throw new Error(`not in TIS-620: ${ch}`) }))
const csvLine = (cells) => cells.map((v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }).join(',')

const SELLER = { name: 'บริษัท ไทยเมทัล พาร์ท จำกัด', addr: '99/1 ม.2 ถ.เทพารักษ์ ต.บางเสาธง อ.บางเสาธง จ.สมุทรปราการ 10570', tin: tin('010555901234'), branch: 'สำนักงานใหญ่' }
const C = [
  { name: 'บริษัท สยามออโต้ พาร์ท จำกัด', addr: '700/12 นิคมอุตสาหกรรมอมตะนคร ต.บ้านเก่า อ.พานทอง จ.ชลบุรี 20160', tin: tin('010554512345'), branch: 'สำนักงานใหญ่', vat: 'Y' },
  { name: 'บริษัท อีสเทิร์น ซีบอร์ด แมชชีนเนอรี่ จำกัด', addr: '64/9 ม.4 ต.ปลวกแดง อ.ปลวกแดง จ.ระยอง 21140', tin: tin('021555600712'), branch: 'สาขาที่ 00002', vat: 'Y' },
  { name: 'บริษัท กรุงเทพ ฟู้ด แพ็ค จำกัด (มหาชน)', addr: '1 ถ.พระราม 2 แขวงแสมดำ เขตบางขุนเทียน กรุงเทพฯ 10150', tin: tin('010753700456'), branch: 'สำนักงานใหญ่', vat: 'Y' },
  { name: 'ห้างหุ้นส่วนจำกัด ช่างเหล็กการช่าง', addr: '45 ถ.สุขุมวิท ต.ท้ายบ้าน อ.เมือง จ.สมุทรปราการ 10280', tin: tin('011353800321'), branch: 'สำนักงานใหญ่', vat: 'Y' },
  { name: 'บริษัท โคราช อินดัสตรี้ จำกัด', addr: '88 ถ.มิตรภาพ ต.ในเมือง อ.เมือง จ.นครราชสีมา 30000', tin: tin('030555100987'), branch: 'สาขาที่ 00001', vat: 'Y' },
  { name: 'บริษัท ไทยแพคเกจจิ้ง ซัพพลาย จำกัด', addr: '12/3 ม.6 ต.คลองหนึ่ง อ.คลองหลวง จ.ปทุมธานี 12120', tin: tin('013556200654'), branch: 'สำนักงานใหญ่', vat: 'Y' },
  { name: 'นางสาวปราณี มั่นคง', addr: '9/9 ม.1 ต.บางพลีใหญ่ อ.บางพลี จ.สมุทรปราการ 10540', tin: '', branch: '', vat: 'N' },
]
const P = [
  ['ขายึดกันชน เหล็กชุบซิงค์', 18.5], ['สกรูหัวจม M8x20', 1.25], ['บูชยางกันสะเทือน', 6], ['แผ่นเหล็กพับขึ้นรูป 1.2 มม.', 3.2],
  ['ขาแขวนสแตนเลส', 12], ['เพลากลึง CNC 25 มม.', 85], ['หน้าแปลนเหล็กหล่อ 4 นิ้ว', 240], ['ฝาครอบอลูมิเนียม', 9.5],
  ['ค่าบริการพ่นสีกันสนิม', 4500], ['ค่าแม่พิมพ์ขึ้นรูป', 18000],
]
const TH_HEAD = ['เลขที่ใบกำกับ', 'วันที่', 'ชื่อเอกสาร', 'ชื่อผู้ขาย', 'ที่อยู่ผู้ขาย', 'เลขผู้เสียภาษีผู้ขาย', 'สาขาผู้ขาย', 'ชื่อลูกค้า', 'ที่อยู่ลูกค้า', 'เลขผู้เสียภาษีลูกค้า', 'สาขาลูกค้า', 'ลูกค้าจด VAT', 'รายการ', 'จำนวน', 'ราคาต่อหน่วย', 'มูลค่าก่อน VAT', 'ภาษีมูลค่าเพิ่ม', 'รวมทั้งสิ้น']

/** Invoices as line rows; amounts per line, VAT per line. */
function invoices(n, { prefix, month = 9, maxLines = 4, customers = C.slice(0, 6), start = 1 }) {
  const out = []
  for (let k = 0; k < n; k++) {
    const day = 1 + Math.floor((k * 29) / n)
    const c = customers[k % customers.length]
    const lines = []
    const nl = 1 + Math.floor(rand() * maxLines)
    for (let j = 0; j < nl; j++) {
      const [desc, price] = P[(k * 3 + j) % P.length]
      const qty = price > 1000 ? 1 : 10 * (1 + Math.floor(rand() * 40))
      const amount = r2(qty * price)
      lines.push({ desc, qty, price, amount, vat: r2(amount * 0.07) })
    }
    out.push({ no: `${prefix}${String(start + k).padStart(4, '0')}`, date: dmy(day, month), title: 'ใบกำกับภาษี/ใบส่งของ', c: { ...c }, lines })
  }
  return out
}
const toRows = (invs) => invs.flatMap((v) => v.lines.map((l) => [v.no, v.date, v.title, SELLER.name, SELLER.addr, SELLER.tin, SELLER.branch, v.c.name, v.c.addr, v.c.tin, v.c.branch, v.c.vat, l.desc, l.qty, l.price, l.amount, l.vat, r2(l.amount + l.vat), ...(l.extra ?? [])]))

function writeXlsx(file, sheets) {
  const wb = XLSX.utils.book_new()
  for (const [name, aoa, textCols = []] of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    const range = XLSX.utils.decode_range(ws['!ref'])
    for (let r = range.s.r; r <= range.e.r; r++)
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })]
        if (!cell) continue
        if (textCols.includes(c)) Object.assign(cell, { t: 's', v: String(cell.v), z: '@' })
        else if (cell.t === 'n' && !Number.isInteger(cell.v)) cell.z = '#,##0.00'
      }
    ws['!cols'] = aoa.reduce((w, row) => row.map((v, i) => Math.max(w[i] ?? 8, Math.min(40, String(v ?? '').length + 2))), [])
    XLSX.utils.book_append_sheet(wb, ws, name)
  }
  XLSX.writeFile(wb, `${OUT}/${file}`, { compression: true })
}
const titleBlock = (title) => [[SELLER.name], [`เลขประจำตัวผู้เสียภาษี ${SELLER.tin} สำนักงานใหญ่`], [title], ['พิมพ์จากระบบบัญชี วันที่ 05/10/2569'], []]
const TIN_COLS = [0, 5, 9] // invoice no, seller TIN, buyer TIN as text so leading zeros survive

// ---- 01: accounting-program export, Sep 2569, multi-line, planted errors ---------------------
{
  const v = invoices(38, { prefix: 'IV6909-' })
  v[4].c.branch = ''                                                 // TI-10 registered buyer without branch
  v[8].lines = [v[8].lines[0]]; v[8].lines[0].vat = r2(v[8].lines[0].amount * 0.07 + 50) // TI-06b VAT wrong
  v[11].title = 'ใบเสร็จรับเงิน'                                      // TI-01 not a tax invoice title
  v[14].c.tin = v[14].c.tin.slice(0, 12) + ((Number(v[14].c.tin[12]) + 3) % 10) // TI-09 check digit wrong
  if (v[17].lines.length < 2) v[17].lines.push({ ...v[17].lines[0] })
  Object.assign(v[17].lines[1], { qty: 0, amount: 0, vat: 0 })     // TI-05 line with qty 0
  v[20].no = v[2].no; v[20].c = { ...C[5] }                         // TI-04 duplicate number, other buyer
  v[23].date = dmy(31, 8)                                           // TI-14 dated August
  v[26].c.name = 'บจก. สยามออโต้ พาร์ท'                               // TI-17 + TI-16
  v[29].c = { ...C[6], name: 'นายวิชัย' }                              // TI-18 individual without surname
  v[32].lines = [v[32].lines[0]]; { const l = v[32].lines[0]; l.amount = r2(l.qty * l.price * 0.95); l.vat = r2(l.amount * 0.07) } // TI-12 hidden discount
  v[35].c = { name: 'เงินสด', addr: '-', tin: '', branch: '', vat: 'N' } // TI-03 placeholder buyer
  writeXlsx('01-รายงานภาษีขาย-ก.ย.2569-จากโปรแกรมบัญชี.xlsx', [['รายงานภาษีขาย', [...titleBlock('รายงานภาษีขาย เดือนกันยายน 2569'), TH_HEAD, ...toRows(v)], TIN_COLS]])
}

// ---- 02: CSV saved by older Thai Excel (TIS-620), one row per invoice ---------------------------
{
  const head = ['เลขที่ใบกำกับภาษี', 'วันที่ออก', 'ชื่อเอกสาร', 'ชื่อผู้ขาย', 'ที่อยู่ผู้ขาย', 'เลขผู้เสียภาษีผู้ขาย', 'สาขาผู้ขาย', 'ชื่อผู้ซื้อ', 'ที่อยู่ผู้ซื้อ', 'เลขผู้เสียภาษีผู้ซื้อ', 'สาขาผู้ซื้อ', 'ผู้ซื้อจด VAT', 'รายการสินค้า', 'จำนวน', 'ราคาต่อหน่วย', 'มูลค่า', 'ภาษีมูลค่าเพิ่ม', 'รวมทั้งสิ้น']
  const v = invoices(15, { prefix: 'TX6909-', maxLines: 1 })
  const rows = toRows(v)
  rows[2][9] = `${rows[2][9].slice(0, 1)}-${rows[2][9].slice(1, 5)}-${rows[2][9].slice(5, 10)}-${rows[2][9].slice(10, 12)}-${rows[2][9].slice(12)}` // dashes in TIN: fine
  rows[4][2] = 'TAX INVOICE'                                       // English title: fine
  rows[6][1] = '15 ก.ย. 2569'                                       // Thai month name: fine
  rows[8][6] = 'สาขาบางนา'                                          // TI-08 place name → warn
  rows[10][4] = ''                                                  // TI-02 seller address missing → fail
  rows[12][17] = r2(rows[12][17] + 100)                             // TI-11 total ≠ value + VAT → warn
  writeFileSync(`${OUT}/02-ภาษีขาย-แถวละใบ-Excel-ภาษาไทยรุ่นเก่า-TIS620.csv`, cp874([head, ...rows].map(csvLine).join('\r\n') + '\r\n'))
}

// ---- 03: everything correct --------------------------------------------------------------------
const clean = invoices(10, { prefix: 'OK6909-', maxLines: 3 })
writeXlsx('03-ถูกต้องทั้งหมด-ควรผ่านทุกข้อ.xlsx', [['ภาษีขาย', [TH_HEAD, ...toRows(clean)], TIN_COLS]])

// ---- 04: credit/debit notes, cancel & reissue, export in USD, exempt line, late invoice -------
{
  const EXTRA = ['ประเภทเอกสาร', 'สถานะ', 'ออกแทนใบเลขที่', 'อ้างอิงใบกำกับเดิม', 'มูลค่าเดิม', 'มูลค่าที่ถูกต้อง', 'เหตุผล', 'สกุลเงิน', 'อัตราแลกเปลี่ยน', 'ประเภทภาษี', 'วันส่งมอบ']
  const c = C[0], x = C[2]
  const row = (no, date, title, cust, desc, qty, price, vatRate, extra) => {
    const amount = r2(qty * price), vat = r2(amount * vatRate)
    return [no, date, title, SELLER.name, SELLER.addr, SELLER.tin, SELLER.branch, cust.name, cust.addr, cust.tin, cust.branch, cust.vat, desc, qty, price, amount, vat, r2(amount + vat), ...extra]
  }
  const e = (o = {}) => [o.type ?? 'INV', o.status ?? '', o.replaces ?? '', o.ref ?? '', o.orig ?? '', o.correct ?? '', o.reason ?? '', o.cur ?? '', o.fx ?? '', o.cat ?? '', o.deliv ?? '']
  const foreign = { name: 'Nippon Precision Co., Ltd.', addr: '2-1 Marunouchi, Chiyoda-ku, Tokyo, Japan', tin: '', branch: '', vat: 'N' }
  const cn = (no, date, title, ref, orig, correct, reason, type) => {
    const diff = r2(Math.abs(orig - correct)), vat = r2(diff * 0.07)
    return [no, date, title, SELLER.name, SELLER.addr, SELLER.tin, SELLER.branch, c.name, c.addr, c.tin, c.branch, c.vat, '', '', '', diff, vat, r2(diff + vat), ...e({ type, ref, orig, correct, reason })]
  }
  const rows = [
    row('IV6909-0101', dmy(3, 9), 'ใบกำกับภาษี/ใบส่งของ', c, 'เพลากลึง CNC 25 มม.', 500, 100, 0.07, e({ deliv: dmy(3, 9) })),
    row('IV6909-0102', dmy(4, 9), 'ใบกำกับภาษี/ใบส่งของ', x, 'หน้าแปลนเหล็กหล่อ 4 นิ้ว', 20, 240, 0.07, e({ status: 'ยกเลิก' })),
    row('IV6909-0103', dmy(4, 9), 'ใบกำกับภาษี/ใบส่งของ', x, 'หน้าแปลนเหล็กหล่อ 4 นิ้ว', 20, 240, 0.07, e({ replaces: 'IV6909-0102' })),
    row('EX6909-0001', dmy(8, 9), 'ใบกำกับภาษี/Commercial Invoice', foreign, 'Stamped steel bracket', 10000, 0.55, 0, e({ cur: 'USD', fx: 36.25, cat: '0%' })),
    row('IV6909-0104', dmy(10, 9), 'ใบกำกับภาษี/ใบส่งของ', c, 'ขาแขวนสแตนเลส', 200, 12, 0.07, e()),
    row('IV6909-0104', dmy(10, 9), 'ใบกำกับภาษี/ใบส่งของ', c, 'หนังสือคู่มือการติดตั้ง', 10, 150, 0, e({ cat: 'ยกเว้น' })),
    row('IV6909-0105', dmy(12, 9), 'ใบกำกับภาษี/ใบส่งของ', x, 'ฝาครอบอลูมิเนียม', 1000, 9.5, 0.07, e({ deliv: dmy(5, 9) })),
    row('IV6909-0106', dmy(15, 9), 'ใบกำกับภาษี/ใบส่งของ', c, 'ค่าแม่พิมพ์ขึ้นรูป', 1, 18000, 0.07, e({ cur: 'EUR' })),
    cn('CN6909-0001', dmy(18, 9), 'ใบลดหนี้', 'IV6909-0101', 50000, 45000, 'ลดราคาเนื่องจากชิ้นงานผิดสเปก 50 ชิ้น', 'CN'),
    cn('DN6909-0001', dmy(20, 9), 'ใบเพิ่มหนี้', 'IV6909-0104', 2400, 2700, '', 'DN'),
    cn('CN6909-0002', dmy(22, 9), 'ใบลดหนี้', '', 4750, 4275, 'คืนสินค้าชำรุด', 'CN'),
  ]
  writeXlsx('04-ใบลดหนี้-ใบเพิ่มหนี้-ยกเลิก-ส่งออก.xlsx', [['เอกสารขาย', [...titleBlock('รายงานภาษีขาย เดือนกันยายน 2569 (รวมใบเพิ่มหนี้/ใบลดหนี้)'), [...TH_HEAD, ...EXTRA], ...rows], [...TIN_COLS, 20]]])
}

// ---- 05: English headers, ISO dates, UTF-8 with BOM (online accounting style) ----------------
{
  const head = ['Invoice No', 'Invoice Date', 'Document Title', 'Seller Name', 'Seller Address', 'Seller Tax ID', 'Seller Branch', 'Customer', 'Customer Address', 'Customer Tax ID', 'Buyer Branch', 'Buyer VAT Registered', 'Description', 'Quantity', 'Unit Price', 'Subtotal', 'VAT Amount', 'Grand Total']
  const v = invoices(12, { prefix: 'INV-2026-', maxLines: 1, start: 301 })
  const rows = toRows(v).map((r) => { const [d, m, y] = r[1].split('/'); r[1] = `${Number(y) - 543}-${m}-${d}`; r[2] = 'Tax Invoice / Receipt'; r[6] = 'Head Office'; if (r[10] === 'สำนักงานใหญ่') r[10] = 'HQ'; if (r[11] === 'Y') r[11] = 'Yes'; return r })
  rows[3][9] = ''                                                   // TI-09 registered buyer without TIN → fail
  rows[7][16] = r2(rows[7][15] * 0.1); rows[7][17] = r2(rows[7][15] + rows[7][16]) // TI-06b VAT at 10% → fail
  writeFileSync(`${OUT}/05-English-headers-online-accounting.csv`, '﻿' + [head, ...rows].map(csvLine).join('\n') + '\n')
}

// ---- 06: workbook whose first sheet is a summary ---------------------------------------------
writeXlsx('06-หลายชีต-ชีตแรกเป็นสรุป.xlsx', [
  ['สรุป', [['สรุปยอดขายเดือนกันยายน 2569'], [], ['รายการ', 'ยอด'], ['มูลค่าขาย', 105000], ['ภาษีขาย', 7350]]],
  ['ภาษีขาย', [TH_HEAD, ...toRows(clean.slice(0, 6))], TIN_COLS],
])

// ---- 07: VAT column missing ------------------------------------------------------------------
{
  const drop = TH_HEAD.indexOf('ภาษีมูลค่าเพิ่ม')
  writeXlsx('07-ขาดคอลัมน์ภาษีมูลค่าเพิ่ม.xlsx', [['ภาษีขาย', [TH_HEAD, ...toRows(clean.slice(0, 5))].map((r) => r.filter((_, i) => i !== drop)), TIN_COLS]])
}

// ---- 08: large file for speed ----------------------------------------------------------------
{
  const v = invoices(2000, { prefix: 'BIG69-', maxLines: 3 })
  for (const k of [137, 845, 1520]) v[k].title = 'ใบเสร็จรับเงิน'
  for (const k of [402, 1777]) v[k].c = { ...v[k].c, branch: '' }
  writeXlsx('08-ไฟล์ใหญ่-2000ใบ.xlsx', [['ภาษีขาย', [TH_HEAD, ...toRows(v)], TIN_COLS]])
}

console.log('written to', OUT)
