// End-to-end smoke test against the built app: `npm run build && npx vite preview --port 4174`, then `node e2e/smoke.mjs`.
import { chromium } from 'playwright-core'
import { mkdirSync, readFileSync } from 'node:fs'
import * as XLSX from 'xlsx'

const URL = process.env.URL ?? 'http://localhost:4174/'
const OUT = process.env.OUT ?? 'e2e/out'
mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' })
const fails = []
const seen = async (loc) => loc.waitFor({ state: 'visible', timeout: 5000 }).then(() => true, () => false)
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`); if (!cond) fails.push(msg) }

const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, acceptDownloads: true })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
await page.goto(URL)
await page.screenshot({ path: `${OUT}/1-upload.png`, fullPage: true })

// Sample flow
await page.getByRole('button', { name: 'ลองด้วยไฟล์ตัวอย่าง' }).click()
ok(await page.getByText('12 แถว · 8 ใบ').isVisible(), 'sample: 12 rows grouped into 8 invoices')
ok((await page.locator('#header-row').inputValue()) === '4', 'sample: header row detected at row 4')
await page.screenshot({ path: `${OUT}/2-map.png`, fullPage: true })
await page.getByRole('button', { name: 'ตรวจ 8 ใบ' }).click()
const stats = await page.locator('.num.text-\\[1\\.75rem\\]').allInnerTexts()
ok(JSON.stringify(stats) === JSON.stringify(['8', '3', '5', '0']), `results stats ${stats}`)
await page.screenshot({ path: `${OUT}/3-results.png`, fullPage: true })
ok(await seen(page.locator('section.screen-only').getByText('สรุปสำหรับยื่น ภ.พ.30')), 'F-01: filing summary shown')
ok(await seen(page.locator('section.screen-only').getByText(/เดือนภาษี ก\.ย\. 2569 · ยื่นแบบกระดาษภายใน/)), 'F-01: tax month auto-detected as ก.ย. 2569')
ok(await seen(page.locator('section.screen-only b', { hasText: '23 ต.ค. 2569' })), 'F-01: online deadline 23 ต.ค. 2569')
await page.getByRole('button', { name: 'ใบที่ 4 มีข้อไม่ผ่าน' }).click()
ok(await page.getByText(/รายการที่ 2: จำนวน/).first().isVisible(), 'audit: multi-line invoice names failing line')
await page.screenshot({ path: `${OUT}/4-audit-multiline.png`, fullPage: true })

const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /ดาวน์โหลดรายการที่ต้องแก้/ }).click()])
const csv = readFileSync(await dl.path(), 'utf8')
ok(dl.suggestedFilename().endsWith('.csv') && csv.includes('SP6909-006') && csv.charCodeAt(0) === 0xfeff, `fix list downloaded: ${dl.suggestedFilename()}`)

await page.getByRole('button', { name: 'ดูภาพรวมทุกใบ' }).click()
ok((await page.locator('table:has(th:text("ใบที่ / เลขที่")) tbody tr').count()) === 5, 'matrix: shows only the 5 problem invoices by default')
await page.screenshot({ path: `${OUT}/5-matrix.png`, fullPage: true })

// Print shows only the report
await page.emulateMedia({ media: 'print' })
ok(await page.locator('.print-only').isVisible(), 'print: report visible')
ok(!(await page.locator('header.screen-only').isVisible()), 'print: app chrome hidden')
await page.pdf({ path: `${OUT}/7-report.pdf`, format: 'A4' })
await page.emulateMedia({ media: 'screen' })


// Excel upload with a title row and a tax ID that lost its leading zero
const ws = XLSX.utils.aoa_to_sheet([
  ['รายงานภาษีขาย'],
  ['เลขที่ใบกำกับ', 'วันที่', 'ชื่อเอกสาร', 'ชื่อผู้ขาย', 'ที่อยู่ผู้ขาย', 'เลขผู้เสียภาษีผู้ขาย', 'สาขาผู้ขาย', 'ชื่อลูกค้า', 'ที่อยู่ลูกค้า', 'เลขผู้เสียภาษีลูกค้า', 'สาขาลูกค้า', 'ลูกค้าจด VAT', 'รายการ', 'จำนวน', 'ราคาต่อหน่วย', 'มูลค่าก่อน VAT', 'ภาษีมูลค่าเพิ่ม', 'รวมทั้งสิ้น'],
  ['X-1', new Date(2026, 10, 3), 'ใบกำกับภาษี', 'บริษัท ก จำกัด', '1 ถ.หนึ่ง', 105558123451, 'สำนักงานใหญ่', 'บริษัท ข จำกัด', '2 ถ.สอง', '0105547003211', 'สำนักงานใหญ่', 'Y', 'น็อต', 10, 10, 100, 7, 107],
], { cellDates: true })
const wb = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(wb, ws, 'ภาษีขาย')
const xlsx = Buffer.from(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }))
await page.getByRole('button', { name: '1 · เลือกไฟล์' }).click()
await page.locator('#file').setInputFiles({ name: 'sales.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: xlsx })
ok(await seen(page.getByText('sales.xlsx · 1 แถว · 1 ใบ')), 'xlsx: read with title row skipped')
await page.getByRole('button', { name: 'ตรวจ 1 ใบ' }).click()
ok(await seen(page.getByText(/Excel ตัดเลข 0/).first()), 'xlsx: leading-zero tax ID explained')

// Non-spreadsheet rejected
await page.getByRole('button', { name: '1 · เลือกไฟล์' }).click()
await page.locator('#file').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') })
ok(await seen(page.getByRole('alert').getByText('รองรับไฟล์ .xlsx .xls และ .csv เท่านั้น')), 'txt: rejected with message')

// No buyer-VAT column: file-level notice, and a buyer TIN without branch is a warning
const noVat = [
  'เลขที่ใบกำกับ,วันที่,ชื่อเอกสาร,ชื่อผู้ขาย,ที่อยู่ผู้ขาย,เลขผู้เสียภาษีผู้ขาย,สาขาผู้ขาย,ชื่อลูกค้า,ที่อยู่ลูกค้า,เลขผู้เสียภาษีลูกค้า,สาขาลูกค้า,รายการ,จำนวน,มูลค่าก่อน VAT,ภาษีมูลค่าเพิ่ม,รวมทั้งสิ้น',
  'N-1,1 ต.ค. 2569,TAX INVOICE,บริษัท ก จำกัด,1 ถ.หนึ่ง,0105558123451,สำนักงานใหญ่,นายสมชาย ใจดี,2 ถ.สอง,,,น็อต,10,100.00,7.00,107.00',
  'N-2,2 ต.ค. 2569,ใบกำกับภาษี,บริษัท ก จำกัด,1 ถ.หนึ่ง,0105558123451,สำนักงานใหญ่,บริษัท ข จำกัด,3 ถ.สาม,0105547003211,,สกรู,5,50.00,3.50,53.50',
].join('\n')
await page.getByRole('button', { name: '1 · เลือกไฟล์' }).click()
await page.locator('#file').setInputFiles({ name: 'novat.csv', mimeType: 'text/csv', buffer: Buffer.from(noVat) })
await page.getByRole('button', { name: 'ตรวจ 2 ใบ' }).click()
ok(await seen(page.getByText(/1 ใบไม่มีทั้งข้อมูลว่าผู้ซื้อจด VAT/)), 'no VAT column: file-level notice shown')
const st = await page.locator('.num.text-\\[1\\.75rem\\]').allInnerTexts()
ok(JSON.stringify(st) === JSON.stringify(['2', '1', '0', '1']), `no VAT column: English title + Thai-month dates pass, missing branch warns (${st})`)
await page.getByRole('button', { name: /ใบที่ 2 ควรตรวจสอบ/ }).click()
ok(await seen(page.getByText('ควรตรวจสอบ', { exact: true }).first()), 'audit: warn note shown')
await page.screenshot({ path: `${OUT}/8-warn.png`, fullPage: true })
await page.getByRole('button', { name: '1 · เลือกไฟล์' }).click()

// P3: credit note, cancelled invoice and its replacement, through the optional columns
const p3 = [
  'เลขที่ใบกำกับ,วันที่,ชื่อเอกสาร,ชื่อผู้ขาย,ที่อยู่ผู้ขาย,เลขผู้เสียภาษีผู้ขาย,สาขาผู้ขาย,ชื่อลูกค้า,ที่อยู่ลูกค้า,เลขผู้เสียภาษีลูกค้า,สาขาลูกค้า,ลูกค้าจด VAT,รายการ,จำนวน,มูลค่าก่อน VAT,ภาษีมูลค่าเพิ่ม,รวมทั้งสิ้น,สถานะ,ออกแทนใบเลขที่,อ้างอิงใบกำกับเดิม,มูลค่าเดิม,มูลค่าที่ถูกต้อง,เหตุผล',
  'P-1,03/09/2569,ใบกำกับภาษี,บริษัท ก จำกัด,1 ถ.หนึ่ง,0105558123451,สำนักงานใหญ่,บริษัท ข จำกัด,2 ถ.สอง,0105547003211,สำนักงานใหญ่,Y,น็อต,10,1000.00,70.00,1070.00,ยกเลิก,,,,,',
  'P-2,03/09/2569,ใบกำกับภาษี,บริษัท ก จำกัด,1 ถ.หนึ่ง,0105558123451,สำนักงานใหญ่,บริษัท ข จำกัด,2 ถ.สอง,0105547003211,สำนักงานใหญ่,Y,น็อต,10,1000.00,70.00,1070.00,,P-1,,,,',
  'CN-1,10/09/2569,ใบลดหนี้,บริษัท ก จำกัด,1 ถ.หนึ่ง,0105558123451,สำนักงานใหญ่,บริษัท ข จำกัด,2 ถ.สอง,0105547003211,สำนักงานใหญ่,Y,,,200.00,14.00,214.00,,,P-2,1000.00,800.00,คืนสินค้า 2 ชิ้น',
].join('\n')
await page.getByRole('button', { name: '1 · เลือกไฟล์' }).click()
await page.locator('#file').setInputFiles({ name: 'p3.csv', mimeType: 'text/csv', buffer: Buffer.from(p3) })
ok((await page.locator('#map-ref_invoice_no').inputValue()) === 'อ้างอิงใบกำกับเดิม', 'P3: optional columns auto-mapped')
await page.getByRole('button', { name: 'ตรวจ 3 ใบ' }).click()
const p3stats = await page.locator('.num.text-\\[1\\.75rem\\]').allInnerTexts()
ok(JSON.stringify(p3stats) === JSON.stringify(['3', '3', '0', '0']), `P3: cancelled, replacement and credit note all pass (${p3stats})`)
ok(await seen(page.locator('section.screen-only').getByText('800.00')), 'P3: filing nets the credit note (1,000 − 200 = 800)')
ok(await seen(page.locator('section.screen-only').getByText(/ยกเลิก 1 ไม่นับยอด/)), 'P3: cancelled listed, not summed')
await page.getByRole('button', { name: 'ใบที่ 1 ผ่าน' }).click()
ok(await seen(page.locator('article').getByText('ยกเลิก', { exact: true })), 'P3: cancelled stamp on the paper')
await page.getByText('ตรวจด้วยตาก่อนส่งใบ').click()
await page.getByLabel(/ตีพิมพ์ไว้ หรือพิมพ์จากคอมพิวเตอร์ทั้งฉบับ ไม่ใช่/).check()
ok(await seen(page.getByText('1/9')), 'P3: manual checklist counts ticks')
await page.screenshot({ path: `${OUT}/9-p3.png`, fullPage: true })
await page.getByRole('button', { name: '1 · เลือกไฟล์' }).click()

// Mapping remembered for the same header layout
await page.getByRole('button', { name: 'ลองด้วยไฟล์ตัวอย่าง' }).click()
await page.locator('#map-total').selectOption('')
await page.getByRole('button', { name: 'ตรวจ 8 ใบ' }).click()
await page.reload()
await page.getByRole('button', { name: 'ลองด้วยไฟล์ตัวอย่าง' }).click()
await page.locator('#map-total').waitFor()
ok((await page.locator('#map-total').inputValue()) === '', `mapping: remembered after reload (${await page.locator('#map-total').inputValue()})`)

// Phone width, both themes: no horizontal page scroll
for (const scheme of ['light', 'dark']) {
  const m = await browser.newPage({ viewport: { width: 360, height: 780 }, colorScheme: scheme })
  await m.goto(URL)
  for (const step of ['upload', 'map', 'results']) {
    if (step === 'map') await m.getByRole('button', { name: 'ลองด้วยไฟล์ตัวอย่าง' }).click()
    if (step === 'results') await m.getByRole('button', { name: 'ตรวจ 8 ใบ' }).click()
    const over = await m.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    ok(over <= 0, `360px ${scheme} ${step}: no horizontal overflow (${over}px)`)
  }
  await m.screenshot({ path: `${OUT}/6-mobile-${scheme}.png`, fullPage: true })
  await m.close()
}

ok(errors.length === 0, `no page errors ${errors.join(' | ')}`)
await browser.close()
console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASSED')
process.exit(fails.length ? 1 : 0)
